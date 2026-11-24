import { expect, test } from '@playwright/test';
import { fulfillJson, MOCK_JWT, setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('Chatting Flow and Session Management', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedSession(page, context, { mockSessions: false });
  });

  test('채팅방 생성 및 신규 세션 첫 질문이 JWT 인증과 함께 정상 응답되는가?', async ({ page }) => {
    await page.route('**/api/v1/chat/sessions', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await fulfillJson(route, []);
      } else if (method === 'POST') {
        await fulfillJson(route, {
          success: true,
          data: { id: 123, title: '새로운 상담', createdAt: new Date().toISOString() },
        });
      }
    });

    await page.goto('/chat');

    const startButton = page.getByLabel('새로운 상담 시작하기');
    await expect(startButton).toBeVisible();
    await startButton.click();

    await page.waitForURL(/\/chat\/\d+/);

    await page.route('**/api/v1/chat/sessions/123', async (route) => {
      await fulfillJson(route, { success: true, logs: [] });
    });

    let capturedAuthHeader = '';
    let capturedHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    await page.route('**/api/v1/chat/sessions/*/message', async (route) => {
      capturedAuthHeader = route.request().headers().authorization ?? '';
      const payload = route.request().postDataJSON() as {
        history: Array<{ role: string; parts: Array<{ text: string }> }>;
      };
      capturedHistory = payload.history;

      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: 'AI 답변입니다.',
      });
    });

    const input = page.getByLabel('채팅 입력');
    await expect(input).toBeVisible();
    await input.fill('감기약 성분이 궁금해요.');
    await page.keyboard.press('Enter');

    await expect(page.locator('text=감기약 성분이 궁금해요.')).toBeVisible();
    await expect(page.locator('text=AI 답변입니다.')).toBeVisible();

    expect(capturedAuthHeader).toBe(`Bearer ${MOCK_JWT}`);
    expect(capturedHistory[0]?.role).toBe('user');
    expect(capturedHistory[0]?.parts[0]?.text).toBe('감기약 성분이 궁금해요.');
  });
});
