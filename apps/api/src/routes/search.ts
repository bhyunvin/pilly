import { Elysia, t } from 'elysia';
import { db } from '../db';
import { pillCatalog } from '../db/schema';
import { ilike, and, eq, type InferSelectModel } from 'drizzle-orm';
import { authPlugin } from '../middleware/auth';

/**
 * 의약품 검색 결과 인터페이스 정의
 * @description 식약처 카탈로그 데이터 모델을 나타냅니다.
 */
type Pill = InferSelectModel<typeof pillCatalog>;

/**
 * 의약품 검색 응답 구조
 * @interface SearchResponse
 * @property {boolean} success - 요청 처리 성공 여부
 * @property {Pill[]} pills - 검색 결과 약물 목록
 */
interface SearchResponse {
  success: boolean;
  pills: Pill[];
}

/**
 * 의약품 통합 검색 API 라우트를 정의하는 그룹
 * @description 식약처 데이터를 기반으로 이름, 제형, 색상 필터링 검색을 수행합니다.
 *
 * @param app - Elysia 애플리케이션 인스턴스
 * @returns 검색 그룹 라우트가 추가된 인스턴스
 */
export const createSearchRoutes = (app: Elysia) => {
  return app.group('/search', (group) =>
    group
      .use(authPlugin)
      /**
       * 의약품 카탈로그 조건 검색
       * @description 쿼리 파라미터(이름, 모양, 색상)로 전달된 조건에 따라 의약품 목록을 최대 50개까지 조회합니다.
       * @async
       * @param context - 요청 컨텍스트
       * @returns 검색 결과 객체
       */
      .get(
        '/',
        async ({
          query,
        }: {
          query: { name?: string; shape?: string; color?: string };
        }): Promise<SearchResponse> => {
          const { name, shape, color } = query;

          const filters = [];
          if (name) filters.push(ilike(pillCatalog.itemName, `%${name}%`));
          if (shape) filters.push(eq(pillCatalog.drugShape, shape));
          if (color) filters.push(eq(pillCatalog.colorClass1, color));

          const pills = await db
            .select()
            .from(pillCatalog)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .limit(50);

          return { success: true, pills };
        },
        {
          query: t.Object({
            name: t.Optional(t.String()),
            shape: t.Optional(t.String()),
            color: t.Optional(t.String()),
          }),
          detail: {
            summary: '의약품 통합 검색',
            description: '이름, 모양, 색상 조건에 맞는 의약품 목록을 조회합니다.',
            tags: ['Search'],
          },
        },
      ),
  );
};
