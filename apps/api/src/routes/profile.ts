import { Elysia, t } from 'elysia';
import { db } from '../db';
import { userProfiles } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { eq } from 'drizzle-orm';

/**
 * 사용자 프로필 라우트 팩토리 함수
 * @param app Elysia 인스턴스
 * @returns 리팩토링된 프로필 라우트가 포함된 Elysia 인스턴스
 */
export const createProfileRoutes = (app: Elysia) => {
  return app.group('/profile', (group) =>
    group
      .use(authMiddleware)

      .get(
        '/',
        async ({ userId, set }) => {
          const user = await db.query.userProfiles.findFirst({
            where: eq(userProfiles.userId, userId),
          });

          if (!user) {
            set.status = 404;
            return { success: false, message: '사용자를 찾을 수 없습니다.' };
          }

          return { success: true, data: user };
        },
        {
          detail: {
            summary: '내 프로필 조회',
            description: '현재 로그인한 사용자의 기본 정보 및 계정 상태를 조회합니다.',
            tags: ['Profile'],
          },
        },
      )

      .patch(
        '/',
        async ({ body, userId }) => {
          const [updated] = await db
            .update(userProfiles)
            .set({ nickname: body.nickname })
            .where(eq(userProfiles.userId, userId))
            .returning();

          return { success: true, data: updated };
        },
        {
          body: t.Object({
            nickname: t.String({ minLength: 2, maxLength: 40 }),
          }),
          detail: {
            summary: '닉네임 수정',
            description: '사용자의 서비스 내 닉네임을 변경합니다.',
            tags: ['Profile'],
          },
        },
      )

      .post(
        '/withdraw',
        async ({ body, userId }) => {
          // Soft Delete: deletedAt에 현재 시간 기록 (30일 유예 기간 시작)
          await db
            .update(userProfiles)
            .set({
              deletedAt: new Date(),
              restrictedReason: body.reason || '자발적 탈퇴',
            })
            .where(eq(userProfiles.userId, userId));

          return {
            success: true,
            message:
              '탈퇴 유예 처리가 완료되었습니다. 30일 이내에 다시 로그인하여 철회할 수 있습니다.',
          };
        },
        {
          body: t.Object({
            reason: t.Optional(t.String()),
          }),
          detail: {
            summary: '회원 탈퇴 (30일 유예)',
            description:
              '계정을 즉시 삭제하지 않고 30일간의 유예 기간을 두는 Soft-delete를 수행합니다.',
            tags: ['Profile'],
          },
        },
      )

      .post(
        '/restore',
        async ({ userId }) => {
          // 탈퇴 유예 상태 복구
          await db
            .update(userProfiles)
            .set({ deletedAt: null, restrictedReason: null })
            .where(eq(userProfiles.userId, userId));

          return { success: true, message: '계정이 성공적으로 복구되었습니다.' };
        },
        {
          detail: {
            summary: '계정 복구',
            description: '탈퇴 유예 중인 계정을 다시 활성 상태로 복구합니다.',
            tags: ['Profile'],
          },
        },
      ),
  );
};
