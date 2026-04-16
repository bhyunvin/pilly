import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * @description 여러 줄의 텍스트를 입력받기 위한 폼 요소입니다.
 * 내용에 따라 높이가 자동으로 조절되며, 프로젝트 디자인 시스템에 맞춘 스타일이 적용되어 있습니다.
 *
 * @param {React.ComponentProps<'textarea'>} props - textarea 요소의 모든 표준 속성
 * @returns {JSX.Element} 스타일이 적용된 textarea 요소를 반환합니다.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
