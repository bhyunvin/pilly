import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT || 5432;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

/**
 * 환경 변수 정보를 바탕으로 구성된 데이터베이스 연결 URL입니다.
 * SSL 모드와 채널 바인딩 설정을 포함하여 보안 연결을 강제합니다.
 */
const dbUrl = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=verify-full&channel_binding=require`;

/**
 * 프로젝트 전반에서 사용되는 Drizzle ORM 데이터베이스 인스턴스입니다.
 *
 * @description
 * Neon Serverless 드라이버(HTTP 전송 방식)를 사용하여 데이터베이스에 연결합니다.
 * `schema` 옵션을 통해 사전에 정의된 테이블 및 관계 정보(schema.ts)를 인스턴스에 주입합니다.
 */
const sql = neon(dbUrl);
export const db = drizzle(sql, { schema });
