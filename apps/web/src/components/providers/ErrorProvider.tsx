'use client';

import { useEffect, type ReactNode } from 'react';
import { logger } from '@/utils/logger';

interface ErrorProviderProps {
  children: ReactNode;
}

/**
 * 전역 에러감지 Provider
 * 브라우저 런타임에서 발생하는 포착되지 않은 에러 및 Promise Rejection을 자동으로 로깅합니다.
 */
export function ErrorProvider({ children }: Readonly<ErrorProviderProps>) {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logger.error({ err: event.error }, `Global uncaught error: ${event.message}`);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logger.error({ err: event.reason }, 'Global unhandled promise rejection');
    };

    globalThis.addEventListener('error', handleError);
    globalThis.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      globalThis.removeEventListener('error', handleError);
      globalThis.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return <>{children}</>;
}
