import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (A11y) Audit', () => {
  test.beforeEach(async ({ page, context }) => {
    // 세션 쿠키 삽입
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

    // 세션 모킹하여 보호된 페이지 접근 허용
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

  test('홈 페이지의 접근성 준수 사항을 확인하는가?', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('채팅 페이지의 접근성 준수 사항을 확인하는가?', async ({ page }) => {
    // 채팅 세션 API 모킹
    await page.route('**/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/chat');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
