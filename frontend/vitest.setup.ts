// frontend/vitest.setup.ts
import '@testing-library/jest-dom';

// 模拟 import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: true,
    VITE_API_URL: 'http://localhost:3000'
  },
  writable: true
});