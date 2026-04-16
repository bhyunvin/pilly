import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/**.spec.ts'],
    // ESM 관련 호환성 문제 해결을 위해 일부 패키지 인라인화
    server: {
      deps: {
        inline: [/@base-ui\/react/, /lucide-react/],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
