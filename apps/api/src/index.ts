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

const app = new Elysia()
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
  .onError(({ code, error, set }) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[API Error] Code: ${code}, Message: ${errorMessage}`);

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

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

export type App = typeof app;
