import { test, expect } from '@playwright/test';

test.describe('복약 관리(추가/조회/삭제) 흐름', () => {
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

  test('복약 등록, 목록 반영, 삭제 전체 흐름이 정상 동작한다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const medications: Array<{ id: number; name: string; dosage: string; frequency: string }> = [];

    await page.route('**/api/v1/medications', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, medications }),
        });
      } else if (method === 'POST') {
        const body = route.request().postDataJSON() as {
          name: string;
          dosage: string;
          frequency: string;
        };
        const created = { id: 101, ...body };
        medications.push(created);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, medication: created }),
        });
      }
    });

    await page.route('**/api/v1/medications/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: '삭제되었습니다.' }),
        });
      }
    });

    await page.goto('/medications');
    await expect(page.getByText('현재 등록된 복약 정보가 없습니다.')).toBeVisible();

    await page.getByLabel('약물 이름').fill('아스피린 500mg');
    await page.getByLabel('용량').fill('1정');
    await page.getByLabel('복용 빈도').fill('1일 2회 식후');
    await page.getByRole('button', { name: '추가하기' }).click();

    await expect(page.getByText('아스피린 500mg')).toBeVisible();
    await expect(page.getByText('1정 · 1일 2회 식후')).toBeVisible();
    await expect(page.getByRole('heading', { name: '복용 중인 약물 (1)' })).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByText('아스피린 500mg').hover();
    await page.getByLabel('아스피린 500mg 삭제').click();

    await expect(page.getByText('현재 등록된 복약 정보가 없습니다.')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
