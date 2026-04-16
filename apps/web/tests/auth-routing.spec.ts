import { test, expect } from '@playwright/test';

test.describe('Auth Routing and Restriction Redirects', () => {
  test.beforeEach(async ({ page, context }) => {
    // 1. 미들웨어를 통과시키기 위한 세션 쿠키 삽입
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

    // 2. Better-Auth 세션 체크 API 모킹
    await page.route('**/get-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user_1', email: 'test@example.com' },
          session: { id: 'session_1', userId: 'user_1' },
        }),
      });
    });

    // 3. 프로필 API 모킹
    await page.route('**/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { userId: 'user_1', nickname: '테스터', status: 'ACTIVE', deletedAt: null },
        }),
      });
    });
  });

  test('탈퇴 유예 중인 사용자가 접속 시 /restore 페이지로 리다이렉트 되는가?', async ({ page }) => {
    await page.route('**/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            userId: 'user_1',
            nickname: '탈퇴중',
            status: 'ACTIVE',
            deletedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page).toHaveURL(/\/restore/, { timeout: 15000 });
    await expect(page.locator('text=회원 탈퇴 유예 기간입니다')).toBeVisible();
  });

  test('제한된(RESTRICTED) 사용자가 접속 시 /restricted 페이지로 리다이렉트 되는가?', async ({
    page,
  }) => {
    await page.route('**/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { userId: 'user_2', nickname: '제한됨', status: 'RESTRICTED', deletedAt: null },
        }),
      });
    });

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/restricted/, { timeout: 15000 });
    await expect(page.locator('text=계정 이용이 제한되었습니다')).toBeVisible();
  });
});
