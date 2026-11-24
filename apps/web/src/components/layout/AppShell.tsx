'use client';

import { usePathname, useRouter } from 'next/navigation';
import type React from 'react';
import { useEffect } from 'react';
import { useApi } from '@/hooks/useApi';
import { authClient } from '@/lib/auth';
import { logger } from '@/utils/logger';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

const PUBLIC_SKIP_PATHS = new Set(['/login', '/terms', '/privacy']);

interface GuardProfile {
  deletedAt?: string | null;
  status?: string;
  role?: string;
}

/**
 * 사용자의 프로필 상태 및 권한에 따라 리다이렉트할 대상 경로를 결정합니다.
 */
function resolveProfileRedirect(pathname: string, profile: GuardProfile): string | null {
  if (profile.deletedAt) {
    return pathname !== '/restore' ? '/restore' : null;
  }

  if (profile.status === 'RESTRICTED') {
    return pathname !== '/restricted' && pathname !== '/inquiry' ? '/restricted' : null;
  }

  if (pathname.startsWith('/admin') && profile.role !== 'ADMIN') {
    return '/';
  }

  return null;
}

/**
 * @description 애플리케이션의 공통 레이아웃을 정의하는 셸 컴포넌트입니다.
 * 사이드바, 헤더, 푸터, 하단 내비게이션 등 전역 UI 구조를 포함하며,
 * 로그인 사용자의 프로필 상태(미설정, 탈퇴 유예, 이용 제한, 관리자 권한)에 따라 적절한 경로로 가드합니다.
 *
 * @param props - 레이아웃 내부에 렌더링될 콘텐츠
 * @returns 공통 UI 요소가 적용된 전체 레이아웃 구조를 반환합니다.
 */
export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const { apiFetch } = useApi();

  useEffect(() => {
    const checkAccessGuard = async () => {
      if (PUBLIC_SKIP_PATHS.has(pathname)) {
        return;
      }

      try {
        const { data: sessionData } = await authClient.getSession();
        if (!sessionData) return;

        const response = await apiFetch('/profile');

        if (response.status === 404) {
          if (pathname !== '/profile/setup') {
            router.replace('/profile/setup');
          }
          return;
        }

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const redirectTo = resolveProfileRedirect(pathname, result.data as GuardProfile);
            if (redirectTo) {
              router.replace(redirectTo);
            }
          }
        }
      } catch (err) {
        logger.error({ err }, '계정 상태 및 권한 가드 확인 실패');
      }
    };

    void checkAccessGuard();
  }, [pathname, router, apiFetch]);

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  if (isAuthPage) {
    return (
      <div className="h-screen w-full overflow-hidden bg-background">
        <main className="h-full w-full overflow-y-auto">{children}</main>
      </div>
    );
  }

  return (
    <div className="relative h-screen flex flex-row bg-background overflow-hidden">
      <aside className="sticky top-0 h-full w-64 border-r hidden md:block overflow-y-auto z-40 shrink-0">
        <Sidebar />
      </aside>
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-y-auto flex flex-col w-full min-h-0">
          <div className="flex-1 flex flex-col mx-auto w-full max-w-7xl p-4 md:p-8">
            <div className="flex-1 flex flex-col w-full">{children}</div>
          </div>
          <Footer />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
