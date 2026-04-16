'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Pill, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 어플리케이션 공통 헤더 컴포넌트
 * 로고, 모바일 메뉴 트리거 및 사용자 프로필 링크를 포함합니다.
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
