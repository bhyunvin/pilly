import * as React from 'react';
import { Input as InputPrimitive } from '@base-ui/react/input';

import { cn } from '@/lib/utils';

/**
 * @description 한 줄 텍스트나 데이터를 입력받기 위한 기본 폼 요소입니다.
 * 다양한 input 타입(text, password, email 등)을 지원하며, 포커스 및 유효성 검사 실패 시의 시각적 스타일을 제공합니다.
 *
 * @param {React.ComponentProps<'input'>} props - input 요소의 모든 표준 속성
 * @returns {JSX.Element} 스타일이 적용된 input 요소를 반환합니다.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
