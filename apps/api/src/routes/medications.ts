import { Elysia, t, type Context } from 'elysia';
import { db } from '../db';
import { userMedications } from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { eq, desc } from 'drizzle-orm';
import { google } from '@ai-sdk/google';
import { generateText, Output, zodSchema } from 'ai';
import { z } from 'zod';
import { logger } from '../utils/logger';

/**
 * Vision AI가 이미지에서 추출하는 약물 정보 스키마
 * @description generateText({ output })이 이 스키마에 따라 구조화된 응답을 보장합니다.
 */
const analyzeImageSchema = z.object({
  medications: z
    .array(
      z.object({
        name: z.string().describe('약품명'),
        dosage: z.string().describe('용량 및 용법 (예: 1정, 500mg 등)'),
        frequency: z.string().describe('복용 빈도 (예: 하루 3회, 식후 30분 등)'),
      }),
    )
    .describe('이미지에서 식별된 약물 목록'),
});

/**
 * 복약 관리 라우트 팩토리 함수
 * @description 사용자의 복약 목록 관리(CRUD) 및 AI 이미지 분석을 통한 복약 정보 자동 추출 기능을 제공합니다.
 * @param app - Elysia 애플리케이션 인스턴스
 * @returns 복약 관리 그룹 라우트가 추가된 인스턴스
 */
export const createMedicationRoutes = (app: Elysia) => {
  return app.group('/medications', (group) =>
    group
      .use(authPlugin)

      /**
       * 사용자의 복약 목록 조회
       * @description 현재 로그인한 사용자의 모든 복약 기록을 최신순으로 가져옵니다.
       */
      .get(
        '/',
        async ({ userId }: { userId: string }) => {
          return await db
            .select()
            .from(userMedications)
            .where(eq(userMedications.userId, userId))
            .orderBy(desc(userMedications.createdAt));
        },
        {
          detail: {
            summary: '복약 목록 조회',
            description: '사용자의 복약 목록을 가져옵니다.',
            tags: ['Medications'],
          },
        },
      )

      /**
       * 새로운 복약 정보 추가
       * @description 사용자가 직접 입력한 약품명, 용법, 빈도 등의 정보를 저장합니다.
       */
      .post(
        '/',
        async ({
          body,
          userId,
          set,
        }: {
          body: { name: string; dosage: string; frequency: string; startDate?: string };
          userId: string;
          set: Context['set'];
        }) => {
          const { name, dosage, frequency, startDate } = body;
          const [med] = await db
            .insert(userMedications)
            .values({
              userId,
              name,
              dosage,
              frequency,
              startDate: startDate || new Date().toISOString(),
            })
            .returning();

          set.status = 201;
          return { success: true, data: med };
        },
        {
          body: t.Object({
            name: t.String(),
            dosage: t.String(),
            frequency: t.String(),
            startDate: t.Optional(t.String()),
            notes: t.Optional(t.String()),
          }),
          detail: {
            summary: '복약 정보 추가',
            tags: ['Medications'],
          },
        },
      )

      /**
       * 이미지 분석을 통한 복약 정보 추출 (Vision AI)
       * @description 처방전이나 약 봉투 사진을 분석하여 약품명, 용법, 빈도를 구조화된 데이터로 추출합니다.
       * SDK v6의 generateText({ output }) 방식을 사용하여 타입 안전한 파싱을 보장합니다.
       *
       * @async
       * @param context - 요청 컨텍스트
       * @returns 추출된 약물 정보 배열
       */
      .post(
        '/analyze-image',
        async ({ body, set }: { body: { image: File }; set: Context['set'] }) => {
          const { image } = body;
          const buffer = Buffer.from(await image.arrayBuffer());
          const base64Image = buffer.toString('base64');

          try {
            // SDK v6: generateObject 대신 generateText({ output }) 사용 (deprecated 경고 해결)
            const { output } = await generateText({
              // 고도의 이미지 추론이 필요한 경우 google('gemini-3.1-pro') 사용을 고려하세요.
              model: google('gemini-3.1-flash'),
              // Output.object를 통해 Zod 스키마와 결합된 구조화된 출력을 생성합니다.
              output: Output.object({
                schema: zodSchema(analyzeImageSchema),
              }),
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: '이 사진에서 약 정보를 추출해 주세요. 사진에 보이는 모든 약품명, 용량, 복용 빈도를 식별해 주세요.',
                    },
                    { type: 'image', image: base64Image },
                  ],
                },
              ],
            });

            return { success: true, data: output.medications };
          } catch (e) {
            logger.error({ err: e }, '[Vision AI] 이미지 분석 실패:');
            set.status = 500;
            return {
              success: false,
              error: '이미지 분석에 실패했습니다. 사진을 다시 찍거나 직접 입력해 주세요.',
            };
          }
        },
        {
          body: t.Object({
            image: t.File(),
          }),
          detail: {
            summary: '이미지 분석 (Vision AI)',
            tags: ['Medications', 'AI'],
          },
        },
      ),
  );
};
