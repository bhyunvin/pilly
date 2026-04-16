'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';

export function AppShell({ children }: { children: React.ReactNode }) {
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
        console.error('Restriction/Withdrawal check failed:', err);
      }
    };

    checkRestriction();
  }, [pathname, router]);

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-background">
      <Sidebar />
      <Header />
      <main className="flex-1 pt-16 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-64 transition-all duration-300 flex flex-col">
        <div className="flex-1 mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
        <Footer />
      </main>
      <BottomNav />
    </div>
  );
}
