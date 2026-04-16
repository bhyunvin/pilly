import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * @description 콘텐츠를 구조화하여 보여주는 카드 컴포넌트입니다.
 * 정보의 그룹화 및 시각적 구분을 위해 사용되며, 헤더, 제목, 내용, 푸터 등의 서브 컴포넌트를 포함합니다.
 *
 * @param {React.ComponentProps<'div'> & { size?: 'default' | 'sm' }} props - div 속성 및 카드 크기 옵션
 * @returns {JSX.Element} 스타일이 적용된 카드 컨테이너를 반환합니다.
 */
function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10 has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        className,
      )}
      {...props}
    />
  );
}

/**
 * @description 카드의 상단 영역을 정의하는 헤더 컴포넌트입니다.
 * 제목과 설명을 그룹화하며, 하단 테두리를 가질 수 있습니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 카드 헤더 컨테이너를 반환합니다.
 */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3',
        className,
      )}
      {...props}
    />
  );
}

/**
 * @description 카드의 주 제목을 정의하는 컴포넌트입니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 스타일이 적용된 카드 제목 요소를 반환합니다.
 */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
        className,
      )}
      {...props}
    />
  );
}

/**
 * @description 카드의 부가 설명을 제공하는 컴포넌트입니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 스타일이 적용된 카드 설명 요소를 반환합니다.
 */
function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * @description 카드 헤더 내부에 위치하는 액션 버튼이나 아이콘을 위한 영역입니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 카드 액션 컨테이너를 반환합니다.
 */
function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

/**
 * @description 카드의 주요 본문 내용을 담는 영역입니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 카드 콘텐츠 컨테이너를 반환합니다.
 */
function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-4 group-data-[size=sm]/card:px-3', className)}
      {...props}
    />
  );
}

/**
 * @description 카드의 하단 영역을 정의하며, 주로 액션 버튼이나 추가 정보를 배치합니다.
 * 상단에 테두리가 있으며 배경색이 다르게 지정될 수 있습니다.
 *
 * @param {React.ComponentProps<'div'>} props - div 속성
 * @returns {JSX.Element} 카드 푸터 컨테이너를 반환합니다.
 */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
