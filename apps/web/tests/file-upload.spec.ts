import { test, expect } from '@playwright/test';

test.describe('File Upload Interaction (Chat/Inquiry)', () => {
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { userId: 'user_1', nickname: '테스터', status: 'ACTIVE', deletedAt: null },
        }),
      });
    });

    await page.route('**/api/v1/chat/sessions**', async (route) => {
      const url = route.request().url();
      if (url.endsWith('/sessions')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 123, title: '테스트 상담', createdAt: new Date().toISOString() },
          ]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ logs: [] }),
        });
      }
    });

    await page.route('**/api/v1/inquiry**', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      }
    });
  });

  test('채팅방 내 문의 모달에서 파일 업로드 인터랙션 검증', async ({ page }) => {
    await page.goto('/chat/123');

    await page.locator('button[aria-label="1:1 문의하기"]').click();

    const fileInput = page.locator('input#attachment');
    await expect(fileInput).toBeVisible({ timeout: 15000 });

    // 파일 업로드
    await fileInput.setInputFiles([
      { name: 'test1.png', mimeType: 'image/png', buffer: Buffer.from('fake data') },
      { name: 'test2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake data') },
    ]);

    // 파일 선택 후 UI 갱신 대기 (정확한 텍스트 매칭 및 충분한 타임아웃)
    const countText = page.locator('p:has-text("2개의 파일이 선택됨")');
    await expect(countText).toBeVisible({ timeout: 20000 });

    await page.locator('input#title').fill('문의 제목');
    await page.locator('textarea#content').fill('문의 내용');

    await page.locator('button:has-text("문의 등록하기")').click();
    await expect(page.locator('text=등록 중...')).toBeVisible();
  });
});
