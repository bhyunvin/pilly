'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';

import { cn } from '@/lib/utils';

/**
 * @description 폼 입력 요소와 연결되는 라벨 컴포넌트입니다.
 * Radix UI의 Label Primitives를 사용하여 접근성을 보장하며, 비활성화 상태 등에 따른 스타일을 제공합니다.
 *
 * @param {React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>} props - 라벨 요소 속성
 * @returns {JSX.Element} 스타일이 적용된 라벨 요소를 반환합니다.
 */
const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    data-slot="label"
    className={cn(
      'text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
