import { expect, test } from '@playwright/test';
import { fulfillJson, setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('복약 관리(추가/체크/이력/삭제) 및 의약품 상세 SSR 흐름', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedSession(page, context);
  });

  test('복약 등록, 복용 완료 체크, 이력 펼침 조회 및 삭제 전체 흐름이 정상 동작한다', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const medications: Array<{ id: number; name: string; dosage: string; frequency: string }> = [];
    const historyItems: Array<{
      id: number;
      medicationId: number;
      status: string;
      takenAt: string;
    }> = [];

    await page.route('**/api/v1/medications', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await fulfillJson(route, { success: true, medications });
      } else if (method === 'POST') {
        const body = route.request().postDataJSON() as {
          name: string;
          dosage: string;
          frequency: string;
        };
        const created = { id: 101, ...body };
        medications.push(created);
        await fulfillJson(route, { success: true, medication: created }, 201);
      }
    });

    await page.route('**/api/v1/medications/*/history', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        const body = route.request().postDataJSON() as { status: string };
        const created = {
          id: historyItems.length + 1,
          medicationId: 101,
          status: body.status,
          takenAt: new Date().toISOString(),
        };
        historyItems.unshift(created);
        await fulfillJson(route, { success: true, data: created }, 201);
      } else if (method === 'GET') {
        await fulfillJson(route, { success: true, history: historyItems });
      }
    });

    await page.route('**/api/v1/medications/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await fulfillJson(route, { success: true, message: '삭제되었습니다.' });
      } else {
        await route.fallback();
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

    await page.getByRole('button', { name: '복용 완료' }).click();
    await page.getByRole('button', { name: '아스피린 500mg 복약 이력 보기' }).click();

    await expect(page.getByRole('listitem').getByText('복용 완료')).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    await page.getByText('아스피린 500mg').hover();
    await page.getByLabel('아스피린 500mg 삭제').click();

    await expect(page.getByText('현재 등록된 복약 정보가 없습니다.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('/medications/[id] 동적 상세 페이지 SSR 렌더링 및 미존재 시 404 처리가 정상 동작한다', async ({
    page,
  }) => {
    const validRes = await page.goto('/medications/199303108');
    expect(validRes?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: '타이레놀정500밀리그람(아세트아미노펜)' }),
    ).toBeVisible();
    await expect(page.getByText('(주)한국얀센')).toBeVisible();
    await expect(page.getByText('장방형', { exact: true })).toBeVisible();
    await expect(page.getByText('하양', { exact: true })).toBeVisible();

    const notFoundRes = await page.goto('/medications/999999999');
    expect(notFoundRes?.status()).toBe(404);
  });
});
