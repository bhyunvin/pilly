import { expect, test } from '@playwright/test';
import { fulfillJson, setupAuthenticatedSession } from './helpers/mockAuth';

test.describe('Admin Dashboard, Inquiries, and User Restriction', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAuthenticatedSession(page, context, {
      userId: 'admin_1',
      email: 'admin@pilly.com',
      role: 'ADMIN',
      profile: {
        userId: 'admin_1',
        nickname: '관리자',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    await page.route('**/api/v1/admin/users**', async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (method !== 'GET') {
        await fulfillJson(route, { success: true });
        return;
      }

      if (url.endsWith('/admin/users')) {
        await fulfillJson(route, {
          success: true,
          users: [
            {
              userId: 'user_1',
              nickname: '사용자1',
              status: 'ACTIVE',
              role: 'USER',
              createdAt: new Date().toISOString(),
            },
          ],
        });
        return;
      }

      await fulfillJson(route, {
        success: true,
        user: {
          userId: 'user_1',
          nickname: '사용자1',
          status: 'ACTIVE',
          role: 'USER',
          createdAt: new Date().toISOString(),
          restrictionHistory: [],
        },
      });
    });
  });

  test('관리자 대시보드 유저 목록 조회 및 제재 프로세스 검증', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.locator('table')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=사용자1')).toBeVisible();

    await page.locator('text=사용자1').first().click();
    await expect(page.locator('text=계정 상태 변경')).toBeVisible();

    const reasonInput = page.locator('textarea#reason');
    await reasonInput.fill('부적절한 언어 사용');
    await page.locator('button:has-text("계정 이용 제한하기")').click();

    await expect(reasonInput).toHaveValue('');
  });

  test('탈퇴 예정자 목록(/admin/withdrawals) 및 JIT 채팅 열람(/admin/chat/[uuid])이 정상 동작한다', async ({
    page,
  }) => {
    await page.route('**/api/v1/admin/withdrawals', async (route) => {
      await fulfillJson(route, {
        success: true,
        data: [
          {
            userId: 'user_w1',
            nickname: '탈퇴예정자',
            deletedAt: new Date().toISOString(),
            deletionReason: '서비스 미사용',
          },
        ],
      });
    });

    await page.goto('/admin/withdrawals');
    await expect(page.getByText('탈퇴예정자')).toBeVisible();
    await expect(page.getByText('서비스 미사용')).toBeVisible();

    await page.route('**/api/v1/admin/chat/*', async (route) => {
      await fulfillJson(route, {
        success: true,
        data: [
          {
            id: 1,
            userId: 'user_1',
            prompt: '타이레놀 복용법 알려주세요',
            response: '성인 기준 1회 1~2정입니다.',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });

    await page.goto('/admin/chat/11111111-1111-1111-1111-111111111111');
    await expect(page.getByText('타이레놀 복용법 알려주세요')).toBeVisible();
    await expect(page.getByText('성인 기준 1회 1~2정입니다.')).toBeVisible();
  });

  test('/admin/inquiries에서 문의 상태 변경 및 승인된 채팅 내역(/admin/chat/[uuid]) 이동이 동작한다', async ({
    page,
  }) => {
    const approvalUuid = '22222222-2222-2222-2222-222222222222';

    await page.route('**/api/v1/admin/inquiries', async (route) => {
      await fulfillJson(route, {
        success: true,
        data: [
          {
            id: 1,
            userId: 'user_1',
            nickname: '사용자1',
            chatSessionId: 55,
            title: 'AI 복약 안내 오류 문의',
            content: '복용 횟수 안내를 확인 부탁드립니다.',
            allowChatAccess: true,
            chatAccessId: approvalUuid,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            attachments: [],
          },
        ],
      });
    });

    await page.route('**/api/v1/admin/inquiries/1/status', async (route) => {
      const body = route.request().postDataJSON() as { status: string };
      await fulfillJson(route, { success: true, status: body.status });
    });

    await page.route(`**/api/v1/admin/chat/${approvalUuid}`, async (route) => {
      await fulfillJson(route, {
        success: true,
        data: [
          {
            id: 10,
            userId: 'user_1',
            prompt: '식후 30분 복용 맞나요?',
            response: '네, 식후 30분 복용이 권장됩니다.',
            createdAt: new Date().toISOString(),
          },
        ],
      });
    });

    await page.goto('/admin/inquiries');
    await expect(page.getByText('AI 복약 안내 오류 문의')).toBeVisible();
    await expect(page.getByText('접수 대기')).toBeVisible();

    await page.getByRole('button', { name: '처리 완료로 변경' }).click();
    await expect(page.getByText('처리 완료')).toBeVisible();

    await page.getByRole('link', { name: 'AI 복약 안내 오류 문의 연결 채팅 내역 열람' }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/chat/${approvalUuid}`));
    await expect(page.getByText('식후 30분 복용 맞나요?')).toBeVisible();
    await expect(page.getByText('네, 식후 30분 복용이 권장됩니다.')).toBeVisible();
  });
});
