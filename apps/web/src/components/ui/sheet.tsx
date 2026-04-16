'use client';

import * as React from 'react';
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { XIcon } from 'lucide-react';

/**
 * @description 측면에서 슬라이드하여 나타나는 오버레이 패널 컴포넌트의 루트입니다.
 *
 * @param {SheetPrimitive.Root.Props} props - Sheet 루트 속성
 * @returns {JSX.Element} Sheet 컨텍스트를 제공하는 루트 요소를 반환합니다.
 */
function Sheet({ ...props }: Readonly<SheetPrimitive.Root.Props>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

/**
 * @description Sheet 패널을 여는 트리거 버튼입니다.
 *
 * @param {SheetPrimitive.Trigger.Props} props - Sheet 트리거 속성
 * @returns {JSX.Element} 트리거 요소를 반환합니다.
 */
function SheetTrigger({ ...props }: Readonly<SheetPrimitive.Trigger.Props>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

/**
 * @description Sheet 패널을 닫는 버튼입니다.
 *
 * @param {SheetPrimitive.Close.Props} props - Sheet 닫기 속성
 * @returns {JSX.Element} 닫기 요소를 반환합니다.
 */
function SheetClose({ ...props }: Readonly<SheetPrimitive.Close.Props>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

/**
 * @description Sheet 패널을 DOM의 별도 위치(주로 body 끝)로 렌더링하기 위한 포털입니다.
 *
 * @param {SheetPrimitive.Portal.Props} props - 포털 속성
 * @returns {JSX.Element} 포털 요소를 반환합니다.
 */
function SheetPortal({ ...props }: Readonly<SheetPrimitive.Portal.Props>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

/**
 * @description Sheet 패널 뒤에 나타나는 반투명 배경 레이어입니다.
 *
 * @param {SheetPrimitive.Backdrop.Props} props - 오버레이 속성
 * @returns {JSX.Element} 배경 레이어 요소를 반환합니다.
 */
function SheetOverlay({ className, ...props }: Readonly<SheetPrimitive.Backdrop.Props>) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  );
}

/**
 * @description Sheet의 실제 콘텐츠를 담는 컨테이너 컴포넌트입니다.
 * 화면의 특정 방향(상, 하, 좌, 우)에서 나타나며 닫기 버튼을 포함할 수 있습니다.
 *
 * @param {SheetPrimitive.Popup.Props & { side?: 'top' | 'right' | 'bottom' | 'left'; showCloseButton?: boolean; }} props - 콘텐츠 속성 및 방향 옵션
 * @returns {JSX.Element} 스타일과 방향이 적용된 콘텐츠 패널을 반환합니다.
 */
function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem] data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

/**
 * @description Sheet 상단의 제목과 부가 정보를 위한 영역입니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 헤더 영역을 반환합니다.
 */
function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-0.5 p-4', className)}
      {...props}
    />
  );
}

/**
 * @description Sheet 하단의 액션 버튼 등을 위한 영역입니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 푸터 영역을 반환합니다.
 */
function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

/**
 * @description Sheet의 제목을 정의하는 컴포넌트입니다.
 *
 * @param {SheetPrimitive.Title.Props} props - 제목 속성
 * @returns {JSX.Element} 스타일이 적용된 제목 요소를 반환합니다.
 */
function SheetTitle({ className, ...props }: Readonly<SheetPrimitive.Title.Props>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-base font-medium text-foreground', className)}
      {...props}
    />
  );
}

/**
 * @description Sheet의 상세 설명을 제공하는 컴포넌트입니다.
 *
 * @param {SheetPrimitive.Description.Props} props - 설명 속성
 * @returns {JSX.Element} 스타일이 적용된 설명 요소를 반환합니다.
 */
function SheetDescription({ className, ...props }: Readonly<SheetPrimitive.Description.Props>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
