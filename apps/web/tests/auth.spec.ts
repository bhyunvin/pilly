import { expect, test } from '@playwright/test';

test.describe('Authentication & Public/Protected Route Access', () => {
  test('로그인 페이지가 정상적으로 로드되는가?', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('스마트한 복약 관리의 시작, Pilly')).toBeVisible();

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute('placeholder', 'name@example.com');
  });

  test('비로그인 상태에서 공개 경로(/, /medications/[id])는 허용되고 보호 경로는 /login으로 리다이렉트된다', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto('/medications/199303108');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('타이레놀정500밀리그람(아세트아미노펜)')).toBeVisible();

    for (const protectedPath of ['/medications', '/inquiry', '/admin/users']) {
      await page.goto(protectedPath);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
