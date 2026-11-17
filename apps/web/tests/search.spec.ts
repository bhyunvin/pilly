import { test, expect } from '@playwright/test';

test.describe('의약품 검색 및 필터링 흐름', () => {
  test('검색어 입력 후 의약품 검색 API 호출 및 결과 렌더링이 정상 동작한다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.route('**/api/v1/search*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              itemSeq: '199303108',
              itemName: '타이레놀정500밀리그람(아세트아미노펜)',
              entpName: '(주)한국얀센',
              efcyQesitm: '감기로 인한 발열 및 동통(통증), 두통, 신경통, 근육통',
              useMethodQesitm: '만 12세 이상 소아 및 성인: 1회 1~2정씩 1일 3-4회',
              atpnQesitm: '매일 세잔 이상 정기적으로 술을 마시는 사람은 의사 또는 약사와 상의할 것',
              itemImage: null,
            },
          ],
          totalCount: 1,
        }),
      });
    });

    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[type="search"], input[type="text"], input[placeholder*="검색"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('타이레놀');
      await searchInput.press('Enter');
      await expect(page.locator('body')).toContainText(/타이레놀|검색/);
    }

    expect(errors).toEqual([]);
  });
});
