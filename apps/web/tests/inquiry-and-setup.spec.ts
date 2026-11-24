import { expect, test } from '@playwright/test';
import { fulfillJson, setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('프로필 초기 설정(/profile/setup) 및 1:1 문의(/inquiry) 흐름', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedSession(page, context, { profile: null });
  });

  test('/profile/setup에서 닉네임 중복(409) 안내 후 정상 생성(POST) 시 홈으로 이동한다', async ({
    page,
  }) => {
    await page.route('**/api/v1/profile', async (route) => {
      if (route.request().method() === 'GET') {
        await fulfillJson(route, { success: false, message: 'Not found' }, 404);
      } else if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { nickname: string };
        if (body.nickname === '중복닉네임') {
          await fulfillJson(
            route,
            { success: false, message: '이미 사용 중인 닉네임입니다.' },
            409,
          );
        } else {
          await fulfillJson(route, {
            success: true,
            data: { userId: 'user_1', nickname: body.nickname, role: 'USER', status: 'ACTIVE' },
          });
        }
      }
    });

    await page.goto('/profile/setup');
    const input = page.getByLabel('닉네임');
    await expect(input).toBeVisible();

    await input.fill('중복닉네임');
    await page.getByRole('button', { name: '설정 완료' }).click();
    await expect(page.getByText('이미 사용 중인 닉네임입니다.')).toBeVisible();

    await input.fill('신규필리유저');
    await page.getByRole('button', { name: '설정 완료' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('/inquiry 페이지에서 1:1 문의 제출 및 내 문의 내역 조회가 정상 동작한다', async ({
    page,
  }) => {
    await page.route('**/api/v1/profile', async (route) => {
      await fulfillJson(route, {
        success: true,
        data: { userId: 'user_1', nickname: '테스터', role: 'USER', status: 'ACTIVE' },
      });
    });

    const inquiries: Array<{
      id: number;
      userId: string;
      title: string;
      content: string;
      status: 'PENDING' | 'RESOLVED';
      createdAt: string;
      attachments: Array<{ id: number; fileUrl: string; originalName: string }>;
    }> = [
      {
        id: 10,
        userId: 'user_1',
        title: '이전 복약 문의',
        content: '답변 확인 부탁드립니다.',
        status: 'RESOLVED',
        createdAt: new Date().toISOString(),
        attachments: [{ id: 1, fileUrl: 'https://example.com/a.png', originalName: '처방전.png' }],
      },
    ];

    await page.route('**/api/v1/inquiry/list', async (route) => {
      await fulfillJson(route, inquiries);
    });

    let contentTypeHeader = '';
    await page.route('**/api/v1/inquiry', async (route) => {
      contentTypeHeader = route.request().headers()['content-type'] ?? '';
      inquiries.unshift({
        id: 11,
        userId: 'user_1',
        title: '복약 알림 문의',
        content: '알림이 제시간에 오지 않습니다.',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        attachments: [],
      });
      await fulfillJson(route, { success: true, inquiryId: 11 }, 201);
    });

    await page.goto('/inquiry');
    await expect(page.getByText('이전 복약 문의')).toBeVisible();
    await expect(page.getByText('답변 완료')).toBeVisible();
    await expect(page.getByRole('link', { name: '처방전.png' })).toBeVisible();

    await page.getByLabel('문의 제목').fill('복약 알림 문의');
    await page.getByLabel('문의 내용').fill('알림이 제시간에 오지 않습니다.');
    await page.getByRole('button', { name: '문의 제출하기' }).click();

    await expect(page.getByText('문의가 접수되었습니다.')).toBeVisible();
    await expect(page.getByText('복약 알림 문의')).toBeVisible();
    await expect(page.getByText('접수 대기')).toBeVisible();
    expect(contentTypeHeader).toContain('multipart/form-data');
  });
});
