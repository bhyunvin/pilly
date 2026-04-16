'use client';
import * as React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * @description 애플리케이션의 테마(다크 모드, 라이트 모드 등)를 관리하는 프로바이더 컴포넌트입니다.
 * next-themes 패키지의 ThemeProvider를 래핑하여 사용하며, 전역적인 테마 상태를 하위 컴포넌트에 제공합니다.
 *
 * @param {React.ComponentProps<typeof NextThemesProvider>} props - 테마 프로바이더 설정 옵션 (children, attribute, defaultTheme 등)
 * @returns {JSX.Element} 테마 컨텍스트가 적용된 자식 컴포넌트들을 반환합니다.
 */
export function ThemeProvider({
  children,
  ...props
}: Readonly<React.ComponentProps<typeof NextThemesProvider>>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
