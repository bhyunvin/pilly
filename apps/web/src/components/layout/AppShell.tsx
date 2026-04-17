'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { logger } from '@/utils/logger';
import { authClient } from '@/lib/auth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';

/**
 * @description 애플리케이션의 공통 레이아웃을 정의하는 셸 컴포넌트입니다.
 * 사이드바, 헤더, 푸터, 하단 내비게이션 등 전역 UI 구조를 포함하며,
 * 마운트 시 사용자 세션 상태를 확인하여 서비스 이용 제한(제재, 탈퇴 유예) 여부를 체크하고 리다이렉션을 수행합니다.
 *
 * @param props - 레이아웃 내부에 렌더링될 콘텐츠
 * @returns 공통 UI 요소가 적용된 전체 레이아웃 구조를 반환합니다.
 */
export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const checkRestriction = async () => {
      // 이미 제한 페이지거나 복구 페이지, 공개 페이지(로그인 등)인 경우 체크 건너뜀
      if (
        pathname === '/restricted' ||
        pathname === '/restore' ||
        pathname === '/login' ||
        pathname === '/terms' ||
        pathname === '/privacy'
      ) {
        return;
      }

      try {
        const { data: sessionData } = await authClient.getSession();
        if (!sessionData) return;

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/profile`,
          {
            headers: {
              Authorization: `Bearer ${sessionData.session.id}`,
            },
          },
        );

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            // 1. 탈퇴 유예 상태 체크 (최우선)
            if (result.data.deletedAt) {
              router.replace('/restore');
              return;
            }
            // 2. 관리자 제재 상태 체크
            if (result.data.status === 'RESTRICTED') {
              router.replace('/restricted');
              return;
            }
          }
        }
      } catch (err) {
        logger.error({ err }, 'Restriction/Withdrawal check failed');
      }
    };

    checkRestriction();
  }, [pathname, router]);

  return (
    <div className="relative min-h-screen flex flex-row bg-background">
      <aside className="sticky top-0 h-screen w-64 border-r hidden md:block overflow-y-auto z-40 shrink-0">
        <Sidebar />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 pt-16 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 transition-all duration-300 flex flex-col">
          <div className="flex-1 mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
          <Footer />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
