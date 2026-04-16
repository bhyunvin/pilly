import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import * as dotenv from 'dotenv';

// .env 로드 (절대 경로 혹은 bun 로드 활용)
dotenv.config({ path: '../../.env' });

const runMigrate = async () => {
  const { DB_HOST, DB_PORT = '5432', DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('DB 환경변수(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)가 정의되지 않았습니다');
  }

  const dbUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require&channel_binding=require`;
  const sql = neon(dbUrl);
  const db = drizzle(sql);

  console.log('⏳ Running migrations...');

  const start = Date.now();

  await migrate(db, { migrationsFolder: 'drizzle' });

  const end = Date.now();

  console.log(`✅ Migrations completed in ${end - start}ms`);

  process.exit(0);
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
});
