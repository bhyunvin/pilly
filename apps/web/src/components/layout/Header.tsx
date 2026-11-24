'use client';

import { Menu, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAppStore } from '@/store/useAppStore';
import { Sidebar } from './Sidebar';

/**
 * @description 애플리케이션의 전역 상단 헤더 컴포넌트입니다.
 * 모바일 메뉴 드로어 트리거(Sheet + Sidebar 연동), 사용자 프로필 이동 버튼, 테마 전환 버튼을 포함합니다.
 *
 * @returns 마운트 완료 시 헤더 요소를 반환하며, 초기 렌더링 시에는 null을 반환합니다.
 */
export function Header() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const isSidebarOpen = useAppStore((state) => state.isSidebarOpen);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) return null;

  const isAuthPage = pathname === '/login' || pathname === '/signup';

  const handleOpenChange = (open: boolean) => {
    if (open !== isSidebarOpen) {
      toggleSidebar();
    }
  };

  const handleCloseDrawer = () => {
    if (isSidebarOpen) {
      toggleSidebar();
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95">
      <div className="flex h-16 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="메뉴 열기"
            aria-expanded={isSidebarOpen}
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </Button>
          <Sheet open={isSidebarOpen} onOpenChange={handleOpenChange}>
            <SheetContent side="left" className="w-72 p-0 sm:max-w-xs">
              <SheetTitle className="sr-only">내비게이션 메뉴</SheetTitle>
              <Sidebar onNavigate={handleCloseDrawer} />
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          {!isAuthPage && (
            <Link href="/profile">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full w-10 h-10"
                aria-label="프로필 페이지로 이동"
              >
                <User className="h-6 w-6" aria-hidden="true" />
              </Button>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
