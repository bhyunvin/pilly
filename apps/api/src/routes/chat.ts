import { Elysia, t } from 'elysia';
import { db } from '../db';
import { chatSessions, aiChatLogs, pillCatalog, userMedications } from '../db/schema';
import { eq, desc, ilike } from 'drizzle-orm';
import { authPlugin } from '../middleware/auth';
import { google } from '@ai-sdk/google';
import { streamText, tool, zodSchema } from 'ai';
import { z } from 'zod';
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
 * AI 상담 채팅에서 사용할 Function Calling 도구 정의
 *
 * @description
 * 사용자가 특정 의도(약물 검색, 복약 목록 조회, 복약 알림 설정)를 표현할 때
 * Gemini 모델이 자동으로 해당 tool을 호출합니다.
 *
 * @param {string} userId - 현재 인증된 사용자 ID (복약 데이터 조회에 사용)
 */
const createChatTools = (userId: string) => ({
  /**
   * 의약품 카탈로그 검색 도구
   * 사용자가 특정 약 이름을 언급하거나 약 정보를 묻는 경우 호출됩니다.
   */
  searchMedication: tool({
    description:
      '사용자가 특정 약물의 정보를 검색하거나 찾길 원할 때 호출합니다. 약 이름, 모양, 색상으로 검색할 수 있습니다.',
    inputSchema: zodSchema(
      z.object({
        keyword: z.string().describe('검색할 약물명 또는 키워드'),
      }),
    ),
    execute: async ({ keyword }) => {
      const results = await db
        .select({
          itemName: pillCatalog.itemName,
          entpName: pillCatalog.entpName,
          drugShape: pillCatalog.drugShape,
          colorClass1: pillCatalog.colorClass1,
          itemImage: pillCatalog.itemImage,
          chart: pillCatalog.chart,
        })
        .from(pillCatalog)
        .where(ilike(pillCatalog.itemName, `%${keyword}%`))
        .limit(5);

      if (results.length === 0) {
        return { found: false, message: `"${keyword}"에 해당하는 약물을 찾지 못했습니다.` };
      }

      return { found: true, count: results.length, medications: results };
    },
  }),

  /**
   * 사용자 복약 목록 조회 도구
   * 사용자가 본인이 등록한 복약 목록을 물어볼 때 호출됩니다.
   */
  getMyMedications: tool({
    description:
      '사용자가 현재 복용 중인 약 목록을 조회하거나 어떤 약을 먹고 있는지 묻는 경우 호출합니다.',
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const medications = await db
        .select({
          name: userMedications.name,
          dosage: userMedications.dosage,
          frequency: userMedications.frequency,
          startDate: userMedications.startDate,
          status: userMedications.status,
        })
        .from(userMedications)
        .where(eq(userMedications.userId, userId))
        .orderBy(desc(userMedications.createdAt));

      if (medications.length === 0) {
        return { found: false, message: '등록된 복약 정보가 없습니다.' };
      }

      return { found: true, count: medications.length, medications };
    },
  }),

  /**
   * 복약 알림 설정 안내 도구
   * 사용자가 복약 알림, 타이머, 일정 설정을 요청하는 경우 호출됩니다.
   * 실제 알림 저장은 클라이언트에서 처리합니다.
   */
  setMedicationReminder: tool({
    description:
      '사용자가 약 복용 알림이나 복약 일정을 설정하길 원할 때 호출합니다. 약 이름과 복용 시간, 빈도를 추출합니다.',
    inputSchema: zodSchema(
      z.object({
        medicationName: z.string().describe('알림을 설정할 약물명'),
        time: z.string().describe('복용 시간 (예: 오전 8시, 식후 30분 등)'),
        frequency: z.string().describe('복용 빈도 (예: 하루 3회, 매일 등)'),
      }),
    ),
    execute: async ({ medicationName, time, frequency }) => {
      // 실제 스케줄러/푸시 알림 연동은 클라이언트 또는 별도 서비스에서 처리
      return {
        success: true,
        reminder: { medicationName, time, frequency },
        message: `${medicationName} 알림 정보를 확인했습니다. 클라이언트에서 알림을 등록해 주세요.`,
      };
    },
  }),
});

/**
 * AI 복약 상담 관련 API 라우트를 정의하는 그룹
 * @description 세션 관리 및 LLM 기반의 실시간 스트리밍 채팅 기능을 제공합니다.
 * Function Calling(tools)을 통해 약물 검색, 복약 목록 조회, 알림 설정 의도를 처리합니다.
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
       * 실시간 AI 메시징 및 스트리밍 응답 (Function Calling 포함)
       * @description 특정 세션 내에서 AI에게 메시지를 전송하고 Gemini AI로부터 실시간 스트리밍 답변을 받습니다.
       * 1. 사용자 질문을 암호화하여 즉시 DB에 기록 (유실 방지)
       * 2. Gemini 모델을 통한 전문 복약 지도 답변 생성
       * 3. Function Calling tools를 통해 약물 검색/복약 목록 조회/알림 설정 의도 처리
       * 4. 답변 완료 후 암호화된 응답을 DB에 업데이트
       *
       * [NOTE]: 고도의 추론이 필요한 경우 google('gemini-3.1-pro')로 교체 검토
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
            // [NOTE]: 복잡한 약물 상호작용 분석이 필요한 경우 google('gemini-3.1-pro') 사용 권장
            model: google('gemini-3.1-flash'),
            system:
              '당신은 전문 약사 AI "Pilly"입니다. 사용자의 건강 상태와 약물 정보를 바탕으로 안전하고 전문적인 복약 지도를 수행하세요. 답변은 한국어로 친절하게 작성하세요. 약물 검색이나 복약 목록 조회, 알림 설정이 필요하면 제공된 도구(tool)를 적극적으로 활용하세요.',
            messages,
            tools: createChatTools(userId),
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
            summary: '실시간 AI 메시징 (Function Calling 포함)',
            description:
              '질문을 전송하고 Gemini AI로부터 실시간 스트리밍 답변을 받습니다. 약물 검색, 복약 목록 조회, 알림 설정 기능을 지원합니다.',
            tags: ['Chat'],
          },
        },
      ),
  );
};
