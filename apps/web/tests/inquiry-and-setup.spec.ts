import { test, expect } from '@playwright/test';

test.describe('프로필 초기 설정(/profile/setup) 및 1:1 문의(/inquiry) 흐름', () => {
  test.beforeEach(async ({ page, context }) => {
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

    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('/profile/setup에서 닉네임 중복(409) 안내 후 정상 생성(POST) 시 홈으로 이동한다', async ({
    page,
  }) => {
    await page.route('**/api/v1/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Not found' }),
        });
      } else if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { nickname: string };
        if (body.nickname === '중복닉네임') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({ success: false, message: '이미 사용 중인 닉네임입니다.' }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: { userId: 'user_1', nickname: body.nickname, role: 'USER', status: 'ACTIVE' },
            }),
          });
        }
      }
    });

    await page.goto('/profile/setup');
    const input = page.getByLabel('닉네임');
    await expect(input).toBeVisible();

    await input.fill('중복닉네임');
    await page.getByRole('button', { name: '설정 완료' }).click();
    await expect(page.getByText('이미 사용 중인 닉네임입니다.')).toBeVisible();

    await input.fill('신규필리유저');
    await page.getByRole('button', { name: '설정 완료' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('/inquiry 페이지에서 Multipart FormData로 1:1 문의를 정상 제출한다', async ({ page }) => {
    await page.route('**/api/v1/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { userId: 'user_1', nickname: '테스터', role: 'USER', status: 'ACTIVE' },
        }),
      });
    });

    let contentTypeHeader = '';
    await page.route('**/api/v1/inquiry', async (route) => {
      contentTypeHeader = route.request().headers()['content-type'] ?? '';
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, inquiryId: 1 }),
      });
    });

    await page.goto('/inquiry');
    await page.getByLabel('문의 제목').fill('복약 알림 문의');
    await page.getByLabel('문의 내용').fill('알림이 제시간에 오지 않습니다.');
    await page.getByRole('button', { name: '문의 제출하기' }).click();

    await expect(page.getByText('문의가 접수되었습니다.')).toBeVisible();
    expect(contentTypeHeader).toContain('multipart/form-data');
  });
});
