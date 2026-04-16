import { ERROR_MESSAGES, USER_ROLE, USER_STATUS, ACCESS_EXPIRATION_TIME } from '../utils/constants';
import { Elysia, t } from 'elysia';
import { db } from '../db';
import {
  chatAccessApprovals,
  aiChatLogs,
  userProfiles,
  chatSessions,
  userRestrictionHistory,
} from '../db/schema';
import { authPlugin } from '../middleware/auth';
import { updatePillDatabase } from '../scripts/syncPills';
import { eq, desc } from 'drizzle-orm';
import { sendAccessAlertEmail } from '../utils/mail';
import { decrypt } from '../utils/security';

export const createAdminRoutes = (auth = authPlugin) =>
  new Elysia({ prefix: '/admin' })
    .post(
      '/sync-pills',
      async ({ headers, set }) => {
        const adminKey = process.env.ADMIN_API_KEY;
        const clientKey = headers['x-admin-key'];
        if (!adminKey || clientKey !== adminKey) {
          set.status = 401;
          return { success: false, message: 'Unauthorized' };
        }
        updatePillDatabase().catch(console.error);
        return { success: true, message: 'Sync started' };
      },
      {
        detail: {
          summary: '의약품 데이터베이스 동기화',
          description:
            '공공데이터포털 API로부터 최신 의약품 정보를 가져와 로컬 DB와 동기화합니다. 관리자 키가 필요합니다.',
          tags: ['Admin'],
        },
      },
    )
    .use(auth)
    .derive(async ({ userId, set }) => {
      if (!userId) {
        set.status = 401;
        throw new Error('Unauthorized');
      }

      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      if (profile.length === 0 || profile[0].role !== USER_ROLE.ADMIN) {
        set.status = 403;
        throw new Error('Forbidden: Admin access required');
      }

      return { isAdmin: true };
    })
    .get(
      '/users',
      async () => {
        const allUsers = await db
          .select({
            userId: userProfiles.userId,
            nickname: userProfiles.nickname,
            role: userProfiles.role,
            status: userProfiles.status,
            createdAt: userProfiles.createdAt,
          })
          .from(userProfiles)
          .orderBy(desc(userProfiles.createdAt));
        return { success: true, users: allUsers };
      },
      {
        detail: {
          summary: '전체 사용자 목록 조회',
          description: '관리자가 시스템의 모든 사용자 프로필 목록을 최신순으로 조회합니다.',
          tags: ['Admin'],
        },
      },
    )
    .get(
      '/withdrawals',
      async () => {
        const { isNotNull } = await import('drizzle-orm');
        const pendingWithdrawalUsers = await db
          .select()
          .from(userProfiles)
          .where(isNotNull(userProfiles.deletedAt))
          .orderBy(desc(userProfiles.deletedAt));

        return { success: true, withdrawals: pendingWithdrawalUsers };
      },
      {
        detail: {
          summary: '탈퇴 유예 중인 유저 목록 조회',
          description:
            '회원 탈퇴를 신청하여 30일간의 유예 기간 상태에 있는 사용자 목록을 조회합니다.',
          tags: ['Admin'],
        },
      },
    )
    .get(
      '/users/:userId',
      async ({ params, set }) => {
        const userProfileDetail = await db.query.userProfiles.findFirst({
          where: eq(userProfiles.userId, params.userId),
          with: {
            restrictionHistory: {
              orderBy: [desc(userRestrictionHistory.createdAt)],
            },
          },
        });

        if (!userProfileDetail) {
          set.status = 404;
          return { success: false, message: ERROR_MESSAGES.USER_NOT_FOUND };
        }

        return { success: true, user: userProfileDetail };
      },
      {
        params: t.Object({ userId: t.String() }),
        detail: {
          summary: '특정 사용자 상세 및 제재 히스토리 조회',
          description:
            '특정 사용자의 상세 프로필 정보와 과거의 계정 이용 제한 기록(제재 히스토리)을 함께 조회합니다.',
          tags: ['Admin'],
        },
      },
    )
    .patch(
      '/users/:userId/role',
      async ({ params, set }) => {
        const profile = await db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.userId, params.userId))
          .limit(1);
        if (profile.length === 0) {
          set.status = 404;
          return { success: false, message: ERROR_MESSAGES.USER_NOT_FOUND };
        }

        const newRole = profile[0].role === USER_ROLE.ADMIN ? USER_ROLE.USER : USER_ROLE.ADMIN;
        await db
          .update(userProfiles)
          .set({ role: newRole })
          .where(eq(userProfiles.userId, params.userId));

        return { success: true, role: newRole };
      },
      {
        params: t.Object({ userId: t.String() }),
        detail: {
          summary: '사용자 권한 토글 (USER <-> ADMIN)',
          description:
            '특정 사용자의 권한을 일반 사용자(USER)에서 관리자(ADMIN)로, 혹은 그 반대로 전환합니다.',
          tags: ['Admin'],
        },
      },
    )
    .patch(
      '/users/:userId/status',
      async ({ params, body, set, userId: currentAdminId }) => {
        const { status, reason } = body;
        const profile = await db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.userId, params.userId))
          .limit(1);

        if (profile.length === 0) {
          set.status = 404;
          return { success: false, message: ERROR_MESSAGES.USER_NOT_FOUND };
        }

        const DEFAULT_RESTRICTED_REASON = '관리자에 의해 계정이 제한되었습니다.';

        if (status === USER_STATUS.RESTRICTED) {
          await db.transaction(async (tx) => {
            await tx
              .update(userProfiles)
              .set({
                status: USER_STATUS.RESTRICTED,
                restrictedReason: reason || DEFAULT_RESTRICTED_REASON,
                restrictedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(userProfiles.userId, params.userId));

            await tx.insert(userRestrictionHistory).values({
              userId: params.userId,
              adminId: currentAdminId,
              reason: reason || DEFAULT_RESTRICTED_REASON,
            });
          });
        } else if (status === USER_STATUS.ACTIVE) {
          await db
            .update(userProfiles)
            .set({
              status: USER_STATUS.ACTIVE,
              restrictedReason: null,
              restrictedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(userProfiles.userId, params.userId));
        } else {
          set.status = 400;
          return { success: false, message: '올바르지 않은 상태값입니다.' };
        }

        return { success: true, message: `사용자 상태가 ${status}로 변경되었습니다.` };
      },
      {
        params: t.Object({ userId: t.String() }),
        body: t.Object({
          status: t.String(),
          reason: t.Optional(t.String()),
        }),
        detail: {
          summary: '사용자 상태 변경 및 히스토리 기록',
          description:
            '사용자의 계정 상태(ACTIVE, RESTRICTED)를 변경하고, 제한 시 사유를 히스토리에 기록합니다.',
          tags: ['Admin'],
        },
      },
    )
    .get(
      '/chat/:sessionId',
      async ({ params, set }) => {
        const sessionId = Number.parseInt(params.sessionId);
        const approvals = await db
          .select()
          .from(chatAccessApprovals)
          .where(eq(chatAccessApprovals.chatSessionId, sessionId))
          .orderBy(desc(chatAccessApprovals.createdAt))
          .limit(1);

        const approval = approvals[0];
        if (!approval) {
          set.status = 403;
          return { success: false, message: '해당 채팅방에 대한 접근 권한이 승인되지 않았습니다.' };
        }

        const now = new Date();
        if (approval.accessedAt) {
          if (approval.expiresAt && now > approval.expiresAt) {
            set.status = 403;
            return { success: false, message: '접근 권한이 만료되었습니다.' };
          }
        } else {
          const expiresAt = new Date(now.getTime() + ACCESS_EXPIRATION_TIME);
          await db
            .update(chatAccessApprovals)
            .set({ accessedAt: now, expiresAt: expiresAt })
            .where(eq(chatAccessApprovals.id, approval.id));

          // 이메일 주소 확보를 위해 문의한 유저 프로필 조회. (현재 schema.ts에 email이 없어 임시 조치)
          const sessionUser = await db
            .select()
            .from(chatSessions)
            .where(eq(chatSessions.id, sessionId))
            .limit(1);

          if (sessionUser.length > 0) {
            // Note: schema.ts의 userProfiles에 email 필드 추가 후 연동
            const dummyEmail = `user-${sessionUser[0].userId}@pilly.local`;
            await sendAccessAlertEmail(dummyEmail, sessionId);
          }
        }

        const chatLogsRaw = await db
          .select()
          .from(aiChatLogs)
          .where(eq(aiChatLogs.sessionId, sessionId))
          .orderBy(aiChatLogs.createdAt);

        // 복호화 파이프라인
        const chatLogs = chatLogsRaw.map((log) => ({
          ...log,
          prompt: decrypt(log.prompt),
          response: decrypt(log.response),
        }));

        return { success: true, logs: chatLogs };
      },
      {
        params: t.Object({ sessionId: t.String() }),
        detail: {
          summary: '관리자용 JIT 채팅방 내역 열람',
          description:
            '사용자의 동의를 받은 1:1 문의와 연관된 채팅 대화 내역을 일시적으로(24시간) 열람합니다.',
          tags: ['Admin'],
        },
      },
    );

export const adminRoutes = createAdminRoutes();
