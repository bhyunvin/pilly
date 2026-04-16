import { Elysia, t } from 'elysia';
import { db } from '../db';
import { userMedications } from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { eq, desc } from 'drizzle-orm';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

/**
 * 복약 관리 라우트 팩토리 함수
 * @description 사용자의 복약 목록 관리(CRUD) 및 AI 이미지 분석을 통한 복약 정보 자동 추출 기능을 제공합니다.
 * @param {Elysia} app - Elysia 애플리케이션 인스턴스
 * @returns {Elysia} 복약 관리 그룹 라우트가 추가된 인스턴스
 */
export const createMedicationRoutes = (app: Elysia) => {
  return app.group('/medications', (group) =>
    group
      .use(authPlugin)

      /**
       * 사용자의 복약 목록 조회
       * @description 현재 로그인한 사용자의 모든 복약 기록을 최신순으로 가져옵니다.
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {string} context.userId - 인증된 사용자 ID
       * @returns {Promise<Array<Object>>} 복약 목록 리스트
       */
      .get(
        '/',
        async ({ userId }) => {
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
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {Object} context.body - 복약 정보 본문 (name, dosage, frequency, startDate)
       * @param {string} context.userId - 인증된 사용자 ID
       * @param {Object} context.set - 응답 상태 설정 객체
       * @returns {Promise<{success: boolean, data: Object}>} 생성된 복약 레코드
       */
      .post(
        '/',
        async ({ body, userId, set }) => {
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
       * Gemini 3.1 Flash Vision 모델을 사용하여 이미지 내의 텍스트와 맥락을 파악합니다.
       *
       * @async
       * @param {Object} context - 요청 컨텍스트
       * @param {Object} context.body - 요청 본문 (image: File)
       * @returns {Promise<{success: boolean, data: Array<Object>}>} 추출된 약물 정보 배열
       */
      .post(
        '/analyze-image',
        async ({ body }) => {
          const { image } = body;
          const buffer = Buffer.from(await image.arrayBuffer());
          const base64Image = buffer.toString('base64');

          const messages = [
            {
              role: 'user' as const,
              content: [
                {
                  type: 'text' as const,
                  text: '이 사진에서 약 정보를 추출해줘. 반드시 다음과 같은 순수 JSON 문자열 형식으로 응답해: {"medications":[{"name": "약품명", "dosage": "용량", "frequency": "복용빈도"}]}',
                },
                { type: 'image' as const, image: base64Image },
              ],
            },
          ];

          const { text } = await generateText({
            model: google('gemini-3.1-flash'),
            messages,
          });

          let jsonText = text.trim();
          if (jsonText.startsWith('```json')) {
            jsonText = jsonText.substring(7);
          }
          if (jsonText.endsWith('```')) {
            jsonText = jsonText.substring(0, jsonText.length - 3);
          }
          jsonText = jsonText.trim();

          let data;
          try {
            data = JSON.parse(jsonText).medications;
          } catch (e) {
            console.error('Vision AI JSON parse error:', e);
            data = [];
          }

          return { success: true, data };
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
