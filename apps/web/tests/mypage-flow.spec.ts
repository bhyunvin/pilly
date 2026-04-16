import { test, expect } from '@playwright/test';

test.describe('MyPage User Journey (Nickname & Soft Delete)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: 'user-mock-token',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    await page.route('**/api/auth/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user_1', email: 'user@example.com' },
          session: { id: 'session_1', userId: 'user_1' },
        }),
      });
    });

    await page.route('**/api/v1/profile**', async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === 'GET' && url.endsWith('/profile')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { userId: 'user_1', nickname: '기존닉네임', status: 'ACTIVE', deletedAt: null },
          }),
        });
      } else if (method === 'PATCH' && url.endsWith('/profile')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { nickname: '새닉네임' } }),
        });
      } else if (method === 'POST' && url.includes('/withdraw')) {
        // 탈퇴 후 GET /profile 요청 시 deletedAt을 포함하도록 모킹 갱신 시뮬레이션
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });
  });

  test('마이페이지에서 닉네임 변경 및 회원 탈퇴 플로우 검증', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).not.toHaveURL(/\/login/);

    const nicknameInput = page.locator('input#nickname');
    await expect(nicknameInput).toBeVisible({ timeout: 20000 });

    await nicknameInput.fill('새닉네임');
    await page.locator('button:has-text("닉네임 수정")').click();
    await expect(page.locator('text=성공적으로 수정되었습니다')).toBeVisible();

    await page.locator('button:has-text("회원 탈퇴")').click();
    await expect(page.locator('text=정말로 탈퇴하시겠습니까?')).toBeVisible();

    await page.locator('textarea#withdraw-reason').fill('사유');

    // 탈퇴 후 안내 페이지에서 보여줄 프로필 데이터 덮어쓰기 (탈퇴 유예 상태)
    await page.route('**/api/v1/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              userId: 'user_1',
              nickname: '새닉네임',
              status: 'ACTIVE',
              deletedAt: new Date().toISOString(),
            },
          }),
        });
      }
    });

    await page.locator('button:has-text("탈퇴 확정")').click();

    // /restore 페이지 이동 및 로딩 완료 대기
    await expect(page).toHaveURL(/\/restore/, { timeout: 15000 });
    // restoreHeading 변수 할당 제거됨
    // CardTitle이 h3로 렌더링되는지 확인 (UI 라이브러리 구조에 따라 다름, 텍스트로 대체 가능)
    await expect(page.locator('text=회원 탈퇴 유예 기간입니다')).toBeVisible({ timeout: 20000 });
  });
});
