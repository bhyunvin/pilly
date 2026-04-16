'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * @description 데이터를 표 형식으로 시각화하기 위한 테이블 컴포넌트입니다.
 * 가로 스크롤을 지원하는 컨테이너 내부에 렌더링됩니다.
 *
 * @param {React.ComponentProps<'table'>} props - 테이블 요소 속성
 * @returns {JSX.Element} 스크롤 가능한 컨테이너에 감싸진 테이블 요소를 반환합니다.
 */
function Table({ className, children, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      >
        <thead className="sr-only">
          <tr>
            <th scope="col">테이블 정보</th>
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

/**
 * @description 테이블의 상단 헤더 영역을 정의하는 컴포넌트입니다.
 */
function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

/**
 * @description 테이블의 실제 데이터가 포함되는 본문 영역입니다.
 */
function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

/**
 * @description 테이블 하단의 합계나 부가 정보를 위한 푸터 영역입니다.
 */
function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  );
}

/**
 * @description 테이블의 각 행(row)을 정의하는 컴포넌트입니다.
 */
function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

/**
 * @description 테이블 헤더의 각 열(column) 제목을 정의하는 컴포넌트입니다.
 */
function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

/**
 * @description 테이블의 각 셀(cell) 데이터를 담는 컴포넌트입니다.
 */
function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  );
}

/**
 * @description 테이블에 대한 요약 설명이나 캡션을 추가하는 컴포넌트입니다.
 */
function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
