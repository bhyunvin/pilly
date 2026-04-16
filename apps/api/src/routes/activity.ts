import { Elysia } from 'elysia';
import { db } from '../db';
import { userActivityLogs } from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { desc, eq } from 'drizzle-orm';

/**
 * 활동 로그 라우트 팩토리 함수
 */
export const createActivityRoutes = (app: Elysia) => {
  return app.group('/activity', (group) =>
    group.use(authPlugin).get(
      '/',
      async ({ userId }) => {
        return await db
          .select()
          .from(userActivityLogs)
          .where(eq(userActivityLogs.userId, userId))
          .orderBy(desc(userActivityLogs.createdAt))
          .limit(50);
      },
      {
        detail: {
          summary: '최근 활동 내역 조회',
          description: '사용자의 최근 서비스 이용 활동 로그를 최대 50개까지 조회합니다.',
          tags: ['Activity'],
        },
      },
    ),
  );
};
