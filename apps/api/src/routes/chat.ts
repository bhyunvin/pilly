import { Elysia, t } from 'elysia';
import { db } from '../db';
import { chatSessions, aiChatLogs } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { authPlugin } from '../middleware/auth';
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { encrypt } from '../utils/security';

/**
 * 채팅 히스토리 메시지 텍스트 파트 구조
 * @interface ChatHistoryPart
 * @property {string} text - 실제 대화 내용
 */
interface ChatHistoryPart {
  text: string;
}

/**
 * 채팅 히스토리 메시지 항목 구조
 * @interface ChatHistoryItem
 * @property {string} role - 화자의 역할 (user 또는 assistant)
 * @property {ChatHistoryPart[]} parts - 메시지 내용 파트 리스트
 */
interface ChatHistoryItem {
  role: string;
  parts: ChatHistoryPart[];
}

/**
 * AI 복약 상담 관련 API 라우트를 정의하는 그룹
 * @description 세션 관리 및 LLM 기반의 실시간 스트리밍 채팅 기능을 제공합니다.
 * 보안을 위해 대화 내역은 암호화되어 저장됩니다.
 *
 * @param {Elysia} app - Elysia 애플리케이션 인스턴스
 * @returns {Elysia} 채팅 그룹 라우트가 추가된 인스턴스
 */
export const createChatRoutes = (app: Elysia) => {
  return app.group('/chat', (group) =>
    group
      .use(authPlugin)
      /**
       * 사용자의 활성화된 모든 채팅 세션 목록 조회
       * @description 현재 로그인한 사용자의 모든 과거 상담 내역 세션을 최신순으로 가져옵니다.
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {string} context.userId - 인증된 사용자 ID
       * @returns {Promise<Array<Object>>} 채팅 세션 리스트
       */
      .get(
        '/sessions',
        async ({ userId }) => {
          return await db
            .select()
            .from(chatSessions)
            .where(eq(chatSessions.userId, userId))
            .orderBy(desc(chatSessions.createdAt));
        },
        {
          detail: {
            summary: '채팅 세션 목록 조회',
            description: '현재 로그인한 사용자의 모든 상담 내역 세션을 가져옵니다.',
            tags: ['Chat'],
          },
        },
      )

      /**
       * 새로운 채팅 상담 세션 생성
       * @description AI와의 대화를 시작하기 위한 새로운 방(세션)을 생성합니다.
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {string} context.userId - 인증된 사용자 ID
       * @param {Object} context.body - 요청 본문 (title)
       * @returns {Promise<{success: boolean, data: Object}>} 생성된 세션 정보
       */
      .post(
        '/sessions',
        async ({ userId, body }) => {
          const [newSession] = await db
            .insert(chatSessions)
            .values({
              userId,
              title: body.title || '새로운 상담',
            })
            .returning();

          return { success: true, data: newSession };
        },
        {
          body: t.Object({
            title: t.Optional(t.String()),
          }),
          detail: {
            summary: '새 채팅 세션 생성',
            description: 'AI와의 상담을 위한 새로운 대화방 세션을 만듭니다.',
            tags: ['Chat'],
          },
        },
      )

      /**
       * 실시간 AI 메시징 및 스트리밍 응답
       * @description 특정 세션 내에서 AI에게 메시지를 전송하고 Gemini AI로부터 실시간 스트리밍 답변을 받습니다.
       * 1. 사용자 질문을 암호화하여 즉시 DB에 기록 (유실 방지)
       * 2. Gemini 1.5 Flash 모델을 통한 전문 복약 지도 답변 생성
       * 3. 답변 완료 후 암호화된 응답을 DB에 업데이트
       *
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {Object} context.params - 경로 파라미터 (id)
       * @param {Object} context.body - 요청 본문 (history)
       * @param {string} context.userId - 인증된 사용자 ID
       * @returns {Promise<Response>} AI 응답 스트림
       */
      .post(
        '/sessions/:id/message',
        async ({ params, body, userId }) => {
          const sessionId = params.id;
          const { history } = body as { history: ChatHistoryItem[] };

          // 전송된 히스토리 중 마지막 사용자 프롬프트 추출
          const lastUserMessage = [...history].reverse().find((msg) => msg.role === 'user');
          const userPrompt = lastUserMessage?.parts[0].text || '';

          // AI SDK 호환 메시지 포맷으로 변환 (엄격한 리터럴 타입 명시)
          const messages: { role: 'user' | 'assistant'; content: string }[] = history.map(
            (msg) => ({
              role: msg.role === 'user' ? 'user' : 'assistant',
              content: msg.parts[0].text,
            }),
          );

          // 1. 대화 기록 레코드 선행 생성 (질문 유실 방지)
          const [logRecord] = await db
            .insert(aiChatLogs)
            .values({
              sessionId,
              userId,
              prompt: encrypt(userPrompt),
              response: '', // 답변 전 임시 상태
            })
            .returning();

          const result = streamText({
            model: google('gemini-1.5-flash'),
            system:
              '당신은 전문 약사 AI "Pilly"입니다. 사용자의 건강 상태와 약물 정보를 바탕으로 안전하고 전문적인 복약 지도를 수행하세요. 답변은 한국어로 친절하게 작성하세요.',
            messages,
            onFinish: async ({ text }) => {
              // 2. 답변 완료 시 해당 레코드 업데이트
              await db
                .update(aiChatLogs)
                .set({ response: encrypt(text) })
                .where(eq(aiChatLogs.id, logRecord.id));
            },
          });

          return result.toTextStreamResponse();
        },
        {
          params: t.Object({
            id: t.Numeric({ description: '채팅 세션 ID (숫자)' }),
          }),
          body: t.Object({
            history: t.Array(
              t.Object({
                role: t.String(),
                parts: t.Array(
                  t.Object({
                    text: t.String(),
                  }),
                ),
              }),
            ),
          }),
          detail: {
            summary: '실시간 AI 메시징',
            description: '질문을 전송하고 Gemini AI로부터 실시간 스트리밍 답변을 받습니다.',
            tags: ['Chat'],
          },
        },
      ),
  );
};
