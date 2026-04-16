'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

/**
 * @description 다크 모드와 라이트 모드 간 테마를 전환하는 토글 버튼 컴포넌트입니다.
 * 현재 테마 상태에 따라 해(Sun) 또는 달(Moon) 아이콘을 애니메이션과 함께 표시합니다.
 *
 * @returns {JSX.Element} 테마 전환 기능을 수행하는 아이콘 버튼을 반환합니다.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="rounded-full w-9 h-9 active:scale-95 transition-transform"
      aria-label="테마 변경"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">테마 변경</span>
    </Button>
  );
}
