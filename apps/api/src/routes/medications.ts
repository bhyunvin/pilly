import { Elysia, t } from 'elysia';
import { db } from '../db';
import { userMedications } from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { eq, desc } from 'drizzle-orm';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

/**
 * 복약 관리 라우트 팩토리 함수
 */
export const createMedicationRoutes = (app: Elysia) => {
  return app.group('/medications', (group) =>
    group
      .use(authPlugin)

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
                { type: 'text' as const, text: '이 사진에서 약 정보를 추출해줘.' },
                { type: 'image' as const, image: base64Image },
              ],
            },
          ];

          const result = await generateObject({
            model: google('gemini-3.1-flash'),
            schema: z.object({
              medications: z.array(
                z.object({
                  name: z.string(),
                  dosage: z.string(),
                  frequency: z.string(),
                }),
              ),
            }),
            messages,
          });

          return { success: true, data: result.object.medications };
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
