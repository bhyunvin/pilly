import { Elysia } from 'elysia';
import * as jose from 'jose';
import { db } from '../db';
import { userProfiles } from '../db/schema';
import { eq } from 'drizzle-orm';
import { USER_STATUS } from '../utils/constants';

/**
 * 인증 처리를 위한 JWKS(JSON Web Key Set) URL입니다.
 * 환경 변수 NEON_AUTH_JWKS_URL에서 가져오며, 기본값은 빈 문자열입니다.
 */
const JWKS_URL = process.env.NEON_AUTH_JWKS_URL || '';

/**
 * Elysia 애플리케이션을 위한 인증 플러그인입니다.
 *
 * @description
 * HTTP 요청의 Authorization 헤더에서 Bearer 토큰을 추출하여 검증합니다.
 * 검증 성공 시 사용자 프로필을 조회하여 계정 상태(제한됨, 삭제 예정 등)를 확인합니다.
 *
 * @async
 * @param {Request} request - HTTP 요청 객체
 * @param {Function} set - 응답 상태 코드 및 헤더 설정을 위한 객체
 * @param {string} path - 현재 요청 경로
 * @returns {Promise<{ userId: string, email: string }>} 검증된 사용자의 ID와 이메일
 * @throws {Error} 토큰이 없거나, 유효하지 않거나, 계정이 제한/삭제된 경우 에러를 발생시킵니다.
 */
export const authPlugin = new Elysia({ name: 'auth' }).derive(
  { as: 'global' },
  async ({ request, set, path }): Promise<{ userId: string; email: string }> => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      set.status = 401;
      throw new Error('Unauthorized: Missing token');
    }

    const token = authHeader.split(' ')[1];

    try {
      const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL));
      const { payload } = await jose.jwtVerify(token, JWKS);
      const userId = payload.sub as string;
      const email = payload.email as string;

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      const isRestorePath = path === '/profile/restore';
      const isAccountRestricted = profile?.status === USER_STATUS.RESTRICTED;
      const isAccountDeleted = profile?.deletedAt != null;

      if (profile && !isRestorePath) {
        if (isAccountRestricted) {
          set.status = 403;
          throw new Error('Forbidden: Your account has been restricted.');
        }
        if (isAccountDeleted) {
          set.status = 403;
          throw new Error('Forbidden: Your account is scheduled for deletion.');
        }
      }

      return { userId, email };
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 403)
        throw error;
      set.status = 401;
      throw new Error('Unauthorized: Invalid token', { cause: error });
    }
  },
);

// 리팩토링 및 테스트 호환성을 위한 더미 export
export const authMiddleware = authPlugin;
