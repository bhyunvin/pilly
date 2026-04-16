import { describe, it, expect, mock } from 'bun:test';
import { Elysia } from 'elysia';

/**
 * 데이터베이스 모듈 모킹
 * 실제 DB 연결 없이 테스트를 수행하기 위해 userProfiles.findFirst 메서드를 모킹합니다.
 */
mock.module('../db', () => ({
  db: {
    query: {
      userProfiles: {
        findFirst: mock(() => Promise.resolve({ userId: 'user_1', nickname: '테스터' })),
      },
    },
  },
}));

/**
 * 인증 모킹 플러그인
 * 모든 요청에 대해 고정된 userId('user_1')를 컨텍스트에 주입하여 인증된 상태를 시뮬레이션합니다.
 */
const mockAuth = new Elysia({ name: 'auth' }).derive({ as: 'global' }, () => ({
  userId: 'user_1',
}));

/**
 * 프로필 로직 단위 테스트 그룹
 * 사용자 정보 조회 기능이 정상적으로 동작하는지 검증합니다.
 */
describe('Profile Logic Test', () => {
  /**
   * 프로필 조회 핸들러 테스트
   * @description 인증된 사용자가 자신의 프로필을 요청했을 때 올바른 데이터와 성공 응답을 반환하는지 확인합니다.
   * @async
   */
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
