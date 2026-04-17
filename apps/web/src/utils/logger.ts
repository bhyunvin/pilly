import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 전역 로거 인스턴스
 * - 프로덕션: info 레벨 이상 출력
 * - 개발: debug 레벨까지 출력 및 서버측 pino-pretty 활성화
 * - 브라우저: 기본 console 메서드와 연결되어 깔끔하게 출력됨
 */
export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  browser: {
    asObject: false,
  },
});
