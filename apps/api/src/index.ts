import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { cors } from '@elysiajs/cors';
import { createMedicationRoutes } from './routes/medications';
import { createChatRoutes } from './routes/chat';
import { createSearchRoutes } from './routes/search';
import { createActivityRoutes } from './routes/activity';
import { createInquiryRoutes } from './routes/inquiry';
import { createProfileRoutes } from './routes/profile';
import { createAdminRoutes } from './routes/admin';
import { schedulerPlugin } from './plugins/scheduler';
import { logger } from './utils/logger';

/**
 * Pilly 백엔드 서비스의 핵심 Elysia 애플리케이션 인스턴스입니다.
 *
 * @description
 * Swagger(API 문서화), CORS, 전역 에러 핸들러, 스케줄러 등을 설정하고
 * `/api/v1` 경로 아래에 각 도메인별 라우트(프로필, 채팅, 복약, 검색 등)를 통합합니다.
 */
const app = new Elysia()
  .use(logger.into())
  .use(
    swagger({
      documentation: {
        info: {
          title: 'Pilly API Documentation',
          version: '1.0.0',
          description: 'Pilly 서비스 API 명세서',
        },
      },
    }),
  )
  .use(cors())
  /**
   * 전역 에러 핸들러입니다.
   *
   * @description
   * 애플리케이션 내부에서 발생하는 모든 에러를 포착하여 정제된 응답을 반환합니다.
   * 보안을 위해 구체적인 서버 내부 오류 정보는 노출하지 않고 로그에만 기록합니다.
   *
   * @param {string} code - 에러 코드 (예: 'NOT_FOUND', 'VALIDATION')
   * @param {Error} error - 발생한 에러 객체
   * @param {Function} set - 응답 상태 코드 설정을 위한 객체
   */
  .onError(({ code, error, set }) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[API Error] Code: ${code}, Message: ${errorMessage}`);

    // 보안: 내부 정보 유출 방지를 위한 에러 메시지 정제
    if (code === 'NOT_FOUND') {
      return { success: false, message: '요청하신 리소스를 찾을 수 없습니다.' };
    }

    if (code === 'VALIDATION') {
      set.status = 422;
      return { success: false, message: '입력값이 올바르지 않습니다.', detail: error.all };
    }

    set.status = 500;
    return {
      success: false,
      message: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    };
  })
  .use(schedulerPlugin)
  .group('/api/v1', (group) =>
    group
      .use(createProfileRoutes(new Elysia()))
      .use(createChatRoutes(new Elysia()))
      .use(createMedicationRoutes(new Elysia()))
      .use(createSearchRoutes(new Elysia()))
      .use(createActivityRoutes(new Elysia()))
      .use(createInquiryRoutes(new Elysia()))
      .use(createAdminRoutes(new Elysia())),
  )
  .listen(process.env.PORT || 3001);

logger.info(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
