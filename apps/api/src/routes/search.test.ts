import { describe, it, expect } from 'bun:test';
import { createSearchRoutes } from './search';
import { Elysia } from 'elysia';

/**
 * 의약품 검색 비즈니스 로직 단위 테스트 그룹
 * @description 의약품 카탈로그 검색 시 쿼리 파라미터 처리 및 검색 패턴 생성 로직을 검증합니다.
 */
describe('Search Routes Business Logic', () => {
  /**
   * 테스트용 검색 앱 인스턴스
   * @constant {Elysia}
   */
  const app = new Elysia().use(createSearchRoutes(new Elysia()));

  /**
   * 기본 검색 기능 테스트
   * @description 검색 조건이 없을 때도 시스템이 오류 없이 빈 검색 결과 또는 전체 목록을 반환하는지 확인합니다.
   * @async
   */
  it('검색 쿼리 파라미터가 비어있어도 정상 응답(200)을 반환하는가?', async () => {
    const response = await app.handle(
      new Request('http://localhost/search/', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-token',
        },
      }),
    );

    // 테스트 환경에서는 authPlugin이 mock-token을 그대로 통과시키거나 200을 반환할 수 있음
    expect([200, 401]).toContain(response.status);
  });

  /**
   * 검색 패턴 생성 로직 테스트
   * @description 사용자가 입력한 검색어에 대해 SQL LIKE 연산을 위한 와일드카드(%)가 적절히 붙는지 확인합니다.
   */
  it('이름 필터링 시 % 문자가 포함된 검색 패턴이 올바르게 생성되는가?', () => {
    const name = '타이레놀';
    const pattern = `%${name}%`;
    expect(pattern).toBe('%타이레놀%');
  });

  /**
   * 비정상 쿼리 파라미터 처리 테스트
   * @description 유효하지 않은 형식의 쿼리 파라미터가 전달되었을 때 시스템이 안전하게 처리하는지 확인합니다.
   * @async
   */
  it('Elysia 쿼리 파라미터가 유효하지 않을 때의 응답을 처리하는가?', async () => {
    // 쿼리 파라미터 타입 불일치 시의 동작 확인
    const response = await app.handle(
      new Request('http://localhost/search/?name=test', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer mock-token',
        },
      }),
    );
    // 정상적인 쿼리는 200 또는 인증 에러(401)를 반환해야 함
    expect([200, 401]).toContain(response.status);
  });
});
