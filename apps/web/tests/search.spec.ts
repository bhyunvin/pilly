import { test, expect } from '@playwright/test';

test.describe('의약품 검색 및 필터링 흐름', () => {
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

    await page.route('**/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            userId: 'user_1',
            nickname: '테스터',
            role: 'USER',
            status: 'ACTIVE',
            deletedAt: null,
          },
        }),
      });
    });

    await page.route('**/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('검색어 입력 및 필터 선택 시 의약품 검색 API 호출과 결과 렌더링이 정상 동작한다', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const requestedUrls: string[] = [];
    await page.route('**/api/v1/search*', async (route) => {
      const url = new URL(route.request().url());
      requestedUrls.push(url.search);
      const nameQuery = url.searchParams.get('name') ?? '';

      const pills = nameQuery.includes('존재하지않는약')
        ? []
        : [
            {
              itemSeq: '199303108',
              itemName: '타이레놀정500밀리그람(아세트아미노펜)',
              entpName: '(주)한국얀센',
              chart: '흰색의 장방형 정제',
              drugShape: '장방형',
              colorClass1: '하양',
              itemImage: null,
            },
          ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          pills,
        }),
      });
    });

    await page.goto('/search');
    await expect(page).not.toHaveURL(/\/login/);

    const searchInput = page.getByPlaceholder('의약품 이름을 입력하세요');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('타이레놀');
    await page.getByRole('button', { name: '검색' }).click();

    await expect(page.getByText('타이레놀정500밀리그람(아세트아미노펜)')).toBeVisible();
    await expect(page.getByText('(주)한국얀센 · 흰색의 장방형 정제')).toBeVisible();
    await expect(page.getByRole('heading', { name: '검색 결과 (1)' })).toBeVisible();
    expect(requestedUrls.some((s) => s.includes('name=%ED%83%80%EC%9D%B4%EB%A0%88%EB%86%80'))).toBe(
      true,
    );

    // 없는 약 검색 시 빈 결과 안내 메시지 검증
    await searchInput.fill('존재하지않는약');
    await page.getByRole('button', { name: '검색' }).click();
    await expect(
      page.getByText('검색 결과가 없습니다. 다른 조건으로 시도해 보세요.'),
    ).toBeVisible();

    expect(errors).toEqual([]);
  });
});
