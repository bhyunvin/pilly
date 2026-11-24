import { defineConfig, devices } from '@playwright/test';

// 테스트 수행 시 포트 4001(Next.js), 4002(SSR Mock API) 사용
const PORT = process.env.PORT || '4001';
const MOCK_API_PORT = process.env.MOCK_API_PORT || '4002';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/helpers/mockSsrApiServer.mjs',
      url: `http://127.0.0.1:${MOCK_API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        MOCK_API_PORT,
      },
    },
    {
      command: `bun run dev --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${MOCK_API_PORT}`,
        NEXT_PUBLIC_NEON_AUTH_URL: `http://localhost:${PORT}/api/auth`,
      },
    },
  ],
});
