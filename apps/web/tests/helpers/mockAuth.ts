import type { BrowserContext, Page, Route } from '@playwright/test';

const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const JWT_PAYLOAD = Buffer.from(
  JSON.stringify({
    sub: 'user_1',
    email: 'test@example.com',
    exp: 4102444800, // 2100-01-01T00:00:00Z
  }),
).toString('base64url');

export const MOCK_JWT = `${JWT_HEADER}.${JWT_PAYLOAD}.mock-signature`;

export async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export interface MockProfileOptions {
  userId?: string;
  nickname?: string;
  role?: 'USER' | 'ADMIN';
  status?: 'ACTIVE' | 'RESTRICTED';
  restrictedReason?: string | null;
  deletedAt?: string | null;
  profileStatus?: number;
}

export interface SetupAuthOptions {
  userId?: string;
  email?: string;
  role?: 'USER' | 'ADMIN';
  profile?: MockProfileOptions | null;
  mockSessions?: boolean;
  mockActivity?: boolean;
}

/**
 * Wave 1(`T-02`) Better Auth JWT 인증 흐름(`get-session` + `token`)에 맞춰
 * Playwright E2E 테스트용 세션 쿠키와 인증·프로필·세션 모킹을 일괄 설정합니다.
 */
export async function setupAuthenticatedSession(
  page: Page,
  context: BrowserContext,
  options: SetupAuthOptions = {},
): Promise<void> {
  const userId = options.userId ?? 'user_1';
  const email = options.email ?? 'test@example.com';
  const role = options.role ?? options.profile?.role ?? 'USER';

  await context.addCookies([
    {
      name: 'better-auth.session_token',
      value: 'mock-session-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await page.route('**/api/auth/**', async (route) => {
    if (route.request().url().includes('/token')) {
      await fulfillJson(route, { token: MOCK_JWT });
      return;
    }

    await fulfillJson(route, {
      user: { id: userId, email, role },
      session: { id: 'session_1', userId },
    });
  });

  if (options.profile !== null) {
    const profileStatus = options.profile?.profileStatus ?? 200;
    await page.route('**/api/v1/profile', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      if (profileStatus === 404) {
        await fulfillJson(route, { success: false, message: '프로필을 찾을 수 없습니다.' }, 404);
        return;
      }

      await fulfillJson(
        route,
        {
          success: true,
          data: {
            userId: options.profile?.userId ?? userId,
            nickname: options.profile?.nickname ?? '테스터',
            role,
            status: options.profile?.status ?? 'ACTIVE',
            restrictedReason: options.profile?.restrictedReason ?? null,
            deletedAt: options.profile?.deletedAt ?? null,
          },
        },
        profileStatus,
      );
    });
  }

  if (options.mockSessions !== false) {
    await page.route('**/api/v1/chat/sessions', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await fulfillJson(route, []);
    });
  }

  if (options.mockActivity) {
    await page.route('**/api/v1/activity', async (route) => {
      await fulfillJson(route, []);
    });
  }
}
