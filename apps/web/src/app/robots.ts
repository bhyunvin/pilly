import { MetadataRoute } from 'next';

/**
 * 서비스의 robots.txt 설정을 생성합니다.
 * 검색 엔진 크롤러에 대한 접근 허용 및 차단 경로를 정의합니다.
 *
 * @returns {MetadataRoute.Robots} robots.txt 설정 객체
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pilly-web.vercel.app';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/', '/profile/setup'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
