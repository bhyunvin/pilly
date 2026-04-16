import { createPinoLogger } from '@bogeychan/elysia-logger';

export const logger = createPinoLogger({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
    },
  },
});
