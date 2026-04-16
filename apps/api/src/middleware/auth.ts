import { Elysia } from 'elysia';
import * as jose from 'jose';
import { db } from '../db';
import { userProfiles } from '../db/schema';
import { eq } from 'drizzle-orm';
import { USER_STATUS } from '../utils/constants';

const JWKS_URL = process.env.NEON_AUTH_JWKS_URL || '';

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
