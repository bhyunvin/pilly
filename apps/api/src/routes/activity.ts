import { Elysia } from 'elysia';
import { db } from '../db';
import { userActivityLogs } from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { desc, eq } from 'drizzle-orm';

/**
 * 활동 로그 라우트 팩토리 함수
 * @description 사용자가 서비스 내에서 수행한 주요 활동(검색, 상담, 복약 등록 등)의 기록을 조회하는 기능을 제공합니다.
 * @param app - Elysia 애플리케이션 인스턴스
 * @returns 활동 로그 그룹 라우트가 추가된 인스턴스
 */
export const createActivityRoutes = (app: Elysia) => {
  return app.group('/activity', (group) =>
    group.use(authPlugin).get(
      '/',
      /**
       * 사용자의 최근 활동 내역 조회
       * @description 현재 로그인한 사용자의 최근 활동 로그를 최대 50개까지 역순(최신순)으로 조회합니다.
       * @async
       * @param context - 요청 컨텍스트
       * @returns 최근 활동 로그 목록
       */
      async ({ userId }: { userId: string }) => {
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
