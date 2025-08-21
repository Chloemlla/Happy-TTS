// frontend/vitest.setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// 模拟 import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: true,
    VITE_API_URL: 'http://localhost:3000'
  },
  writable: true
});

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: any) => React.createElement('div', {}, children),
}));

// Mock crypto-js
vi.mock('crypto-js', () => ({
  default: {
    MD5: jest.fn().mockReturnValue({ toString: () => 'mock-md5-hash' }),
    SHA256: jest.fn().mockReturnValue({ toString: () => 'mock-sha256-hash' }),
    AES: {
      encrypt: jest.fn().mockReturnValue({ toString: () => 'mock-encrypted' }),
      decrypt: jest.fn().mockReturnValue({ toString: () => 'mock-decrypted' })
    }
  }
}));

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    }))
  }
}));