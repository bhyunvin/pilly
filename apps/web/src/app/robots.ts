import { MetadataRoute } from 'next';

/**
 * 서비스의 robots.txt 설정을 생성합니다.
 * 검색 엔진 및 AI 크롤러에 대한 접근 정책을 정의합니다.
 *
 * @returns robots.txt 설정 객체
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pilly-web.vercel.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/profile/setup'],
      },
      {
        // 최신 AI 모델들이 컨텐츠를 파싱할 수 있도록 명시적 허용
        userAgent: ['GPTBot', 'Google-Extended', 'Claude-Web', 'PerplexityBot'],
        allow: '/',
        disallow: ['/admin/', '/profile/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
