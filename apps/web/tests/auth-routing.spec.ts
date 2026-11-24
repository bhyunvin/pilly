import { expect, test } from '@playwright/test';
import { setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('Auth Routing and Restriction Redirects', () => {
  test('탈퇴 유예 중인 사용자가 접속 시 /restore 페이지로 리다이렉트 되는가?', async ({
    page,
    context,
  }) => {
    await setupAuthenticatedSession(page, context, {
      profile: {
        userId: 'user_1',
        nickname: '탈퇴중',
        status: 'ACTIVE',
        deletedAt: new Date().toISOString(),
      },
    });

    await page.goto('/');
    await expect(page).toHaveURL(/\/restore/, { timeout: 15000 });
    await expect(page.locator('text=회원 탈퇴 유예 기간입니다')).toBeVisible();
  });

  test('제한된(RESTRICTED) 사용자가 접속 시 /restricted 페이지로 리다이렉트 되는가?', async ({
    page,
    context,
  }) => {
    await setupAuthenticatedSession(page, context, {
      profile: {
        userId: 'user_2',
        nickname: '제한됨',
        status: 'RESTRICTED',
        restrictedReason: '반복적인 부적절 게시물 작성',
        deletedAt: null,
      },
    });

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/restricted/, { timeout: 15000 });
    await expect(page.locator('text=계정 이용이 제한되었습니다')).toBeVisible();
    await expect(page.locator('text=반복적인 부적절 게시물 작성')).toBeVisible();
  });

  test('일반 USER가 /admin/users 접속 시 홈(/)으로 차단 리다이렉트 된다', async ({
    page,
    context,
  }) => {
    await setupAuthenticatedSession(page, context, {
      role: 'USER',
      profile: {
        userId: 'user_1',
        nickname: '일반유저',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
  });

  test('프로필이 없는 사용자(404)는 /profile/setup 페이지로 유도된다', async ({
    page,
    context,
  }) => {
    await setupAuthenticatedSession(page, context, {
      profile: {
        profileStatus: 404,
      },
    });

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/profile\/setup/, { timeout: 15000 });
  });
});
