import { test, expect } from '@playwright/test';

test.describe('Chatting Flow and Session Management', () => {
  test.beforeEach(async ({ page, context }) => {
    // 1. 미들웨어 통과를 위한 세션 쿠키 삽입
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

    // 2. 세션 모킹
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

    // 3. 프로필 모킹 (정상 상태)
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

  test('채팅방 생성 및 대화 플로우가 정상 작동하는가?', async ({ page }) => {
    // 1. Mocking: 채팅 세션 리스트 (처음엔 비어있음)
    await page.route('**/chat/sessions', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else if (method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { id: 123, title: '새로운 상담', createdAt: new Date().toISOString() },
          }),
        });
      }
    });

    // 2. 채팅 페이지 접속
    await page.goto('/chat');

    // 3. 상담 시작 유도 버튼 확인 (aria-label 사용)
    const startButton = page.getByLabel('새로운 상담 시작하기');
    await expect(startButton).toBeVisible();
    await startButton.click();

    // 4. 채팅 세션 페이지로 리다이렉트 (Mocking 적용 전 대기)
    await page.waitForURL(/\/chat\/\d+/);

    // 메시지 전송 API 모킹
    await page.route('**/chat/sessions/*/message', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: 'AI 답변입니다.',
      });
    });

    // 5. 메시지 전송 시뮬레이션
    const input = page.getByLabel('채팅 입력');
    await expect(input).toBeVisible();
    await input.fill('감기약 성분이 궁금해요.');
    await page.keyboard.press('Enter');

    // 6. AI 응답 대기 상태 확인
    await expect(page.locator('text=AI가 답변을 작성 중입니다')).toBeVisible();
  });
});
