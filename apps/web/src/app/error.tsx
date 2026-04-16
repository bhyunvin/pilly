'use client';

import { useEffect } from 'react';
import { logger } from '@/utils/logger';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    logger.error({ err: error }, `React Error Boundary caught an error: ${error.message}`);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-bold mb-4">문제가 발생했습니다</h2>
      <p className="text-slate-500 mb-8 max-w-md">
        예기치 않은 시스템 오류가 발생했습니다. 문제가 지속되면 고객센터로 문의해 주세요.
      </p>
      <Button onClick={() => reset()} variant="default">
        다시 시도하기
      </Button>
    </div>
  );
}
