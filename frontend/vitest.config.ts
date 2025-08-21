import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    }
    // Vitest 的 test 配置不支持 define 选项，需在 vite.config.ts 里配置 define，或在 setupFiles 里手动 mock import.meta.env
    // 这里移除 define，避免类型错误
  }
}); 