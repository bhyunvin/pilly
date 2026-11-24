import { expect, test } from '@playwright/test';
import { fulfillJson, setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('File Upload Interaction (Chat/Inquiry)', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedSession(page, context, { mockSessions: false });

    await page.route('**/api/v1/chat/sessions**', async (route) => {
      if (route.request().url().endsWith('/sessions')) {
        await fulfillJson(route, [
          { id: 123, title: '테스트 상담', createdAt: new Date().toISOString() },
        ]);
        return;
      }
      await fulfillJson(route, { logs: [] });
    });

    await page.route('**/api/v1/inquiry**', async (route) => {
      if (route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fulfillJson(route, { success: true });
      }
    });
  });

  test('채팅방 내 문의 모달에서 파일 업로드 인터랙션 검증', async ({ page }) => {
    await page.goto('/chat/123');

    await page.locator('button[aria-label="1:1 문의하기"]').click();

    const fileInput = page.locator('input#attachment');
    await expect(fileInput).toBeVisible({ timeout: 15000 });

    await fileInput.setInputFiles([
      { name: 'test1.png', mimeType: 'image/png', buffer: Buffer.from('fake data') },
      { name: 'test2.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake data') },
    ]);

    const countText = page.locator('p:has-text("2개의 파일이 선택됨")');
    await expect(countText).toBeVisible({ timeout: 20000 });

    await page.locator('input#title').fill('문의 제목');
    await page.locator('textarea#content').fill('문의 내용');

    await page.locator('button:has-text("문의 등록하기")').click();
    await expect(page.locator('text=등록 중...')).toBeVisible();
  });
});
