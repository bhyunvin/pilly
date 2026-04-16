'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Pill, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * @description 애플리케이션의 전역 상단 헤더 컴포넌트입니다.
 * 서비스 로고, 모바일 메뉴 트리거, 사용자 프로필 이동 버튼을 포함하며, 화면 상단에 고정되어 상시 노출됩니다.
 * 하이드레이션 오류 방지를 위해 클라이언트 마운트 이후에 렌더링을 시작합니다.
 *
 * @returns 마운트 완료 시 헤더 요소를 반환하며, 초기 렌더링 시에는 null을 반환합니다.
 */
export function Header() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // 클라이언트 사이드 렌더링 확인 (Hydration mismatch 방지)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) return null;

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-2 md:hidden">
          <Button variant="ghost" size="icon" aria-label="메뉴 열기">
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl text-green-800 dark:text-green-400"
        >
          <Pill className="h-6 w-6 rotate-45" aria-hidden="true" />
          <span className="hidden sm:inline-block">Pilly</span>
        </Link>

        <div className="flex items-center gap-4">
          {!isAuthPage && (
            <Link href="/profile">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="프로필 페이지로 이동"
              >
                <User className="h-5 w-5" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
