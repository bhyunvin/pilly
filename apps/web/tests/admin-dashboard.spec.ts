import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard and User Restriction', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: 'admin-mock-token',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    // 모든 API 가로채기 (V1 프리픽스 대응)
    await page.route('**/api/v1/api/auth/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'admin_1', email: 'admin@pilly.com', role: 'ADMIN' },
          session: { id: 'session_admin', userId: 'admin_1' },
        }),
      });
    });

    // Better-Auth 기본 경로 대응
    await page.route('**/api/auth/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'admin_1', email: 'admin@pilly.com', role: 'ADMIN' },
          session: { id: 'session_admin', userId: 'admin_1' },
        }),
      });
    });

    await page.route('**/api/v1/admin/users**', async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === 'GET') {
        if (url.endsWith('/admin/users')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              users: [
                {
                  userId: 'user_1',
                  nickname: '사용자1',
                  status: 'ACTIVE',
                  role: 'USER',
                  createdAt: new Date().toISOString(),
                },
              ],
            }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              user: {
                userId: 'user_1',
                nickname: '사용자1',
                status: 'ACTIVE',
                role: 'USER',
                createdAt: new Date().toISOString(),
                restrictionHistory: [],
              },
            }),
          });
        }
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });
  });

  test('관리자 대시보드 유저 목록 조회 및 제재 프로세스 검증', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/login/);

    // 테이블 대기
    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=사용자1')).toBeVisible();

    await page.locator('text=사용자1').first().click();
    await expect(page.locator('text=계정 상태 변경')).toBeVisible();

    const reasonInput = page.locator('textarea#reason');
    await reasonInput.fill('부적절한 언어 사용');
    await page.locator('button:has-text("계정 이용 제한하기")').click();

    await expect(reasonInput).toHaveValue('');
  });
});
