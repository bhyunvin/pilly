import { Elysia, t } from 'elysia';
import { db } from '../db';
import { chatSessions, aiChatLogs } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { authPlugin } from '../middleware/auth';
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

/**
 * 채팅 히스토리 메시지 구조 정의
 */
interface ChatHistoryPart {
  text: string;
}

interface ChatHistoryItem {
  role: string;
  parts: ChatHistoryPart[];
}

/**
 * AI 복약 상담 관련 API 라우트를 정의하는 그룹
 * 세션 관리 및 LLM 기반의 실시간 스트리밍 채팅 기능을 제공합니다.
 *
 * @param app - Elysia 애플리케이션 인스턴스
 * @returns 채팅 그룹 라우트가 추가된 인스턴스
 */
export const createChatRoutes = (app: Elysia) => {
  return app.group('/chat', (group) =>
    group
      .use(authPlugin)
      /**
       * 사용자의 활성화된 모든 채팅 세션 목록을 최신순으로 조회합니다.
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
       * 새로운 채팅 상담 세션을 생성합니다.
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
       * 특정 세션 내에서 AI에게 메시지를 전송하고 스트리밍 답변을 받습니다.
       * 답변 완료 후 해당 로그는 DB에 영구 저장됩니다.
       */
      .post(
        '/sessions/:id/message',
        async ({ params, body, userId }) => {
          const sessionId = params.id;
          const { history } = body as { history: ChatHistoryItem[] };

          // 전송된 히스토리 중 마지막 사용자 프롬프트 추출
          const lastUserMessage = [...history].reverse().find((msg) => msg.role === 'user');
          const userPrompt = lastUserMessage?.parts[0].text || '';

          // AI SDK 호환 메시지 포맷으로 변환
          const messages = history.map((msg) => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.parts[0].text,
          }));

          // 1. 대화 기록 레코드 선행 생성 (질문 유실 방지)
          const [logRecord] = await db
            .insert(aiChatLogs)
            .values({
              sessionId,
              userId,
              prompt: userPrompt,
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
                .set({ response: text })
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
