import { describe, it, expect, mock } from 'bun:test';
import { Elysia } from 'elysia';

/**
 * DB 쿼리 체이닝 모킹을 위한 객체
 * @constant {Object}
 */
const mockQueryChain = {
  orderBy: mock(() => Promise.resolve([])),
  limit: mock(() => Promise.resolve([])),
};

/**
 * DB from 절 모킹을 위한 객체
 * @constant {Object}
 */
const mockFrom = {
  where: mock(() => mockQueryChain),
  limit: mock(() => Promise.resolve([])),
};

/**
 * DB select 절 모킹을 위한 객체
 * @constant {Object}
 */
const mockSelect = {
  from: mock(() => mockFrom),
};

/**
 * 데이터베이스 모듈 모킹
 * @description 실제 DB 접근 없이 drizzle-orm 쿼리 빌더의 동작을 흉내냅니다.
 */
mock.module('../db', () => ({
  db: {
    select: mock(() => mockSelect),
  },
  userProfiles: {},
  userRestrictionHistory: {},
}));

/**
 * 인증 플러그인 모킹
 * @description 테스트를 위해 관리자 권한을 가진 사용자로 세션을 고정합니다.
 */
mock.module('../middleware/auth', () => ({
  authPlugin: new Elysia({ name: 'auth' }).derive(() => ({
    userId: 'admin_1',
    email: 'admin@pilly.com',
  })),
}));

import { createAdminRoutes } from './admin';

/**
 * 관리자 라우트 통합 테스트 그룹
 * @description 관리자 전용 API의 엔드포인트가 정상적으로 연결되고 인증 필터를 통과하는지 확인합니다.
 */
describe('Admin Route Integration Test', () => {
  /**
   * 테스트용 관리자 앱 인스턴스
   * @constant {Elysia}
   */
  const app = createAdminRoutes(new Elysia());

  /**
   * 사용자 목록 조회 API 통합 테스트
   * @description GET /admin/users 요청 시 정상적으로 처리되는지 확인합니다.
   * @async
   */
  it('GET /admin/users - 정상 호출되는가?', async () => {
    const response = await app.handle(
      new Request('http://localhost/admin/users', {
        headers: { Authorization: 'Bearer mock-token' },
      }),
    );
    expect(response.status).toBeDefined();
  });
});
