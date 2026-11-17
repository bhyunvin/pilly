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

    // Better-Auth 세션 모킹
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

  test('탈퇴 예정자 목록(/admin/withdrawals) 및 JIT 채팅 열람(/admin/chat/[uuid])이 정상 동작한다', async ({
    page,
  }) => {
    await page.route('**/api/v1/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { userId: 'admin_1', nickname: '관리자', role: 'ADMIN', status: 'ACTIVE' },
        }),
      });
    });

    await page.route('**/api/v1/admin/withdrawals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              userId: 'user_w1',
              nickname: '탈퇴예정자',
              deletedAt: new Date().toISOString(),
              deletionReason: '서비스 미사용',
            },
          ],
        }),
      });
    });

    await page.goto('/admin/withdrawals');
    await expect(page.getByText('탈퇴예정자')).toBeVisible();
    await expect(page.getByText('서비스 미사용')).toBeVisible();

    await page.route('**/api/v1/admin/chat/*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              userId: 'user_1',
              prompt: '타이레놀 복용법 알려주세요',
              response: '성인 기준 1회 1~2정입니다.',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.goto('/admin/chat/11111111-1111-1111-1111-111111111111');
    await expect(page.getByText('타이레놀 복용법 알려주세요')).toBeVisible();
    await expect(page.getByText('성인 기준 1회 1~2정입니다.')).toBeVisible();
  });
});
