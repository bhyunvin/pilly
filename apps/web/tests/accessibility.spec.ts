import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fulfillJson, setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('Accessibility (A11y) Audit', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedSession(page, context);
  });

  test('홈 페이지의 접근성 준수 사항을 확인하는가?', async ({ page }) => {
    await page.goto('/');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('채팅 페이지의 접근성 준수 사항을 확인하는가?', async ({ page }) => {
    await page.goto('/chat');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('의약품 검색 페이지(/search)의 접근성 준수 사항을 확인하는가?', async ({ page }) => {
    await page.goto('/search');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('복약 관리 페이지(/medications)의 접근성 준수 사항을 확인하는가?', async ({ page }) => {
    await page.route('**/api/v1/medications', async (route) => {
      await fulfillJson(route, { success: true, medications: [] });
    });

    await page.goto('/medications');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
