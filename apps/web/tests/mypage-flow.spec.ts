import { expect, test } from '@playwright/test';
import { fulfillJson, setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('MyPage User Journey (Nickname & Soft Delete)', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedSession(page, context, { profile: null, mockActivity: true });

    await page.route('**/api/v1/profile**', async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method === 'GET' && url.endsWith('/profile')) {
        await fulfillJson(route, {
          success: true,
          data: { userId: 'user_1', nickname: '기존닉네임', status: 'ACTIVE', deletedAt: null },
        });
      } else if (method === 'PATCH' && url.endsWith('/profile')) {
        await fulfillJson(route, { success: true, data: { nickname: '새닉네임' } });
      } else if (method === 'POST' && url.includes('/withdraw')) {
        await fulfillJson(route, { success: true });
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
        await fulfillJson(route, {
          success: true,
          data: {
            userId: 'user_1',
            nickname: '새닉네임',
            status: 'ACTIVE',
            deletedAt: new Date().toISOString(),
          },
        });
      }
    });

    await page.locator('button:has-text("탈퇴 확정")').click();

    await expect(page).toHaveURL(/\/restore/, { timeout: 15000 });
    await expect(page.locator('text=회원 탈퇴 유예 기간입니다')).toBeVisible({ timeout: 20000 });
  });
});
