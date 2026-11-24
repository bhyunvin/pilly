import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const PROTECTED_PREFIX_ROUTES = [
  '/chat',
  '/search',
  '/profile',
  '/inquiry',
  '/restore',
  '/restricted',
  '/admin',
];

const EXACT_PROTECTED_ROUTES = new Set(['/medications']);

function isProtectedPath(pathname: string): boolean {
  if (EXACT_PROTECTED_ROUTES.has(pathname)) {
    return true;
  }

  return PROTECTED_PREFIX_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * 애플리케이션의 미들웨어 함수입니다.
 * 공개 경로(`/`, `/login`, `/terms`, `/privacy`, `/medications/[id]`)는 허용하고,
 * 인증이 필요한 보호 경로는 세션 쿠키 유무에 따라 `/login`으로 리다이렉트합니다.
 *
 * @param request - Next.js 요청 객체
 * @returns 다음 미들웨어로 진행하거나 리다이렉트 응답을 반환합니다.
 */
export function middleware(request: NextRequest): NextResponse {
  const sessionToken = request.cookies.get('better-auth.session_token');
  const { pathname } = request.nextUrl;

  if (isProtectedPath(pathname) && !sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

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
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
