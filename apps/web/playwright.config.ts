import { defineConfig, devices } from '@playwright/test';

// 테스트 수행 시 포트 4001 사용을 위해 환경변수 우선 적용
const PORT = process.env.PORT || '4001';

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
  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // 컴포넌트 내 fetch가 3000번이 아닌 테스트 서버 포트를 바라보게 강제함
      NEXT_PUBLIC_API_URL: `http://localhost:${PORT}`,
    },
  },
});
