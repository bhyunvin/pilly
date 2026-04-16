import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('로그인 페이지가 정상적으로 로드되는가?', async ({ page }) => {
    // 1. 로그인 페이지 접속 (상대 경로 사용)
    await page.goto('/login');

    // 2. 타이틀 확인
    await expect(page.getByText('Pilly 시작하기')).toBeVisible();

    // 3. 이메일 입력 필드 존재 여부 확인
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'name@example.com');
  });
});
