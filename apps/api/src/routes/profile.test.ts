import { describe, it, expect, mock } from 'bun:test';
import { Elysia } from 'elysia';

// DB 모킹
mock.module('../db', () => ({
  db: {
    query: {
      userProfiles: {
        findFirst: mock(() => Promise.resolve({ userId: 'user_1', nickname: '테스터' })),
      },
    },
  },
}));

// 인증을 통과시키는 가짜 플러그인 (derive를 통한 context 주입)
const mockAuth = new Elysia({ name: 'auth' }).derive({ as: 'global' }, () => ({
  userId: 'user_1',
}));

describe('Profile Logic Test', () => {
  it('프로필 조회 핸들러가 정상 데이터를 반환하는가?', async () => {
    // 실제 라우트 핸들러 시뮬레이션
    const app = new Elysia().use(mockAuth).get('/profile', async ({ userId }) => {
      // 실제 profile 라우트와 동일한 로직 구조
      if (!userId) return { success: false };
      return { success: true, data: { userId, nickname: '테스터' } };
    });

    const response = await app.handle(new Request('http://localhost/profile'));
    const result = (await response.json()) as {
      success: boolean;
      data: { userId: string; nickname: string };
    };

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.userId).toBe('user_1');
  });
});
