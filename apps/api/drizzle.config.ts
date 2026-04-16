import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// 루트 디렉토리의 .env 로드
dotenv.config({ path: '../../.env' });

const { DB_HOST, DB_PORT = '5432', DB_USER, DB_PASSWORD, DB_NAME } = process.env;
const dbUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require&channel_binding=require`;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: dbUrl,
  },
});
