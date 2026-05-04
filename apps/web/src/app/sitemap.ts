import { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { logger } from '@/utils/logger';

/**
 * 서비스의 sitemap.xml 설정을 생성합니다.
 * 주요 페이지의 URL, 최종 수정일, 변경 빈도 및 우선순위를 정의합니다.
 *
 * @returns 사이트맵 항목 배열
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pilly-web.vercel.app';
  const lastModified = new Date();

  let drugSitemaps: MetadataRoute.Sitemap = [];

  try {
    // 실제 백엔드 API를 호출하여 검색 엔진에 노출할 퍼블릭 의약품 목록(pillCatalog)을 가져옵니다.
    // Elysia 라우트 그룹 구조에 따라 .api.v1.search 형태로 호출합니다.
    const { data, error } = await api.api.v1.search.sitemap.get();
    
    if (!error && data?.success) {
      drugSitemaps = data.pills.map((pill: { itemSeq: string }) => ({
        url: `${baseUrl}/medications/${pill.itemSeq}`,
        lastModified,
        changeFrequency: 'weekly',
        priority: 0.7,
      }));
    }
  } catch (err) {
    logger.error({ err }, 'Failed to fetch drug list for sitemap');
  }

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/chat`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...drugSitemaps,
    {
      url: `${baseUrl}/terms`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
