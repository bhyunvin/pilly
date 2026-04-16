import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 애플리케이션의 미들웨어 함수입니다.
 * 세션 토큰을 확인하여 보호된 경로에 대한 접근 권한을 제어합니다.
 *
 * @param request - Next.js 요청 객체
 * @returns 다음 미들웨어로 진행하거나 리다이렉트 응답을 반환합니다.
 */
export function middleware(request: NextRequest): NextResponse {
  // Better Auth는 기본적으로 'better-auth.session_token' 쿠키를 사용함
  const sessionToken = request.cookies.get('better-auth.session_token');
  const { pathname } = request.nextUrl;

  // 1. 로그인하지 않은 상태에서 보호된 경로 접근 시 리다이렉트
  const protectedRoutes = ['/', '/search', '/chat', '/profile'];
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtectedRoute && !sessionToken && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. 이미 로그인한 상태에서 로그인 페이지 접근 시 홈으로 리다이렉트
  if (pathname === '/login' && sessionToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

/**
 * 미들웨어가 실행될 경로 설정입니다.
 * API, 정적 파일, 이미지 최적화 파일, 파비콘 등을 제외한 모든 경로에서 실행됩니다.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
