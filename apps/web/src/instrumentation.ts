import { logger } from '@/utils/logger';

/**
 * Next.js 서버사이드 Instrumentation
 * 서버 기동 시 한 번 호출되며, 전역 Node.js 에러 이벤트를 포착하여 로깅합니다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    process.on('uncaughtException', (err: Error) => {
      logger.fatal({ err }, `Uncaught Exception detected: ${err.message}`);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error({ err: reason }, 'Unhandled Promise Rejection detected');
    });
  }
}
