'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';

/**
 * @description 다크 모드와 라이트 모드 간 테마를 전환하는 토글 버튼 컴포넌트입니다.
 * 현재 테마 상태에 따라 해(Sun) 또는 달(Moon) 아이콘을 명시적으로 렌더링합니다.
 * 하이드레이션 오류 방지를 위해 클라이언트 마운트 이후에 정확한 아이콘을 표시하며,
 * 내부적으로 테마 전환 로직을 캡슐화하여 어디서든 쉽게 재사용할 수 있습니다.
 *
 * @returns {JSX.Element} 테마 전환 기능을 수행하는 아이콘 버튼을 반환합니다.
 */
export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // 클라이언트 사이드 마운트 확인 (Hydration mismatch 방지)
  React.useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * 시스템 테마를 고려하여 현재 테마와 반대되는 테마로 전환합니다.
   */
  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  /**
   * 테마 및 마운트 상태에 따라 적절한 아이콘을 렌더링합니다.
   */
  const renderIcon = () => {
    if (!mounted) {
      // 마운트 전에는 레이아웃 유지를 위해 빈 공간 표시
      return <div className="h-6 w-6" />;
    }

    if (resolvedTheme === 'dark') {
      return <Moon className="h-6 w-6 text-foreground animate-in fade-in zoom-in duration-300" />;
    }

    return <Sun className="h-6 w-6 text-foreground animate-in fade-in zoom-in duration-300" />;
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="rounded-full w-10 min-w-10 h-10 active:scale-95 transition-all hover:bg-accent border-muted-foreground/30 shadow-sm bg-background/50 backdrop-blur-sm flex items-center justify-center"
      aria-label="테마 변경"
    >
      {renderIcon()}
      <span className="sr-only">테마 변경</span>
    </Button>
  );
}
