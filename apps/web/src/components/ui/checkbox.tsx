'use client';

import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';

import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';

/**
 * @description 사용자가 여러 옵션 중 하나 이상을 선택할 수 있게 하는 체크박스 컴포넌트입니다.
 * 체크 상태에 따른 시각적 피드백과 접근성을 지원합니다.
 *
 * @param {CheckboxPrimitive.Root.Props} props - 체크박스 루트 속성
 * @returns {JSX.Element} 체크 상태를 표시하는 아이콘이 포함된 체크박스 요소를 반환합니다.
 */
function Checkbox({ className, ...props }: Readonly<CheckboxPrimitive.Root.Props>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
