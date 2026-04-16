import { neon } from '@neondatabase/serverless';

const runTest = async () => {
  const { DB_HOST, DB_PORT = '5432', DB_USER, DB_PASSWORD, DB_NAME } = process.env;

  if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('DB 환경변수(DB_HOST, DB_USER, DB_PASSWORD, DB_NAME)가 정의되지 않았습니다');
  }

  const dbUrl = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require&channel_binding=require`;

  console.log('🔗 Testing connection to:', DB_HOST); // 호스트만 출력

  try {
    const sql = neon(dbUrl);
    const result = await sql`SELECT 1 as result`;
    console.log('✅ Connection Successful!', result);
  } catch (error: unknown) {
    console.error('❌ Connection Failed');
    if (error instanceof Error) {
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      if ('sourceError' in error) {
        console.error('Source Error:', (error as { sourceError: unknown }).sourceError);
      }
    } else {
      console.error('Unknown error:', error);
    }
  }
};

runTest();
