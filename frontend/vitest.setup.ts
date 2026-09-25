// frontend/vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// 模拟 import.meta.env
Object.defineProperty(import.meta, 'env', {
  value: {
    DEV: true,
    VITE_API_URL: 'http://localhost:3000'
  },
  writable: true
});

/**
 * framer-motion 的替身：按标签惰性生成透传组件。
 *
 * 原先的 mock 只列出 motion.div，组件里一旦出现 motion.button / motion.p 就会拿到 undefined，
 * React 抛 "Element type is invalid"，整个套件在用例之前就死掉（VerificationMethodSelector
 * 的 10 个用例就是这么全挂的）。Proxy 保证任何 motion.<tag> 都可渲染。
 *
 * React 用 vi.importActual 在工厂内部取：vi.mock 会被提到 import 之前，
 * 闭包引用顶层 const 会踩 "Cannot access before initialization"。
 */
const MOTION_ONLY_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileInView',
  'whileDrag',
  'variants',
  'custom',
  'layout',
  'layoutId',
  'drag',
  'dragConstraints',
  'dragListeners',
  'onAnimationComplete',
  'onDragStart',
  'onDrag',
  'onDragEnd',
]);

async function createMotionMock() {
  const React = await vi.importActual<typeof import('react')>('react');

  const passthroughCache = new Map<string, unknown>();
  const passthrough = (tag: string) => {
    if (!passthroughCache.has(tag)) {
      const Component = ({ children, ...props }: any) => {
        const domProps: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(props)) {
          // 去掉 framer-motion 专有属性，否则 React 会对每个 whileHover/whileTap 报警告。
          if (MOTION_ONLY_PROPS.has(key) || key.startsWith('while')) continue;
          domProps[key] = value;
        }
        return React.createElement(tag, domProps, children);
      };
      Component.displayName = `motion.${tag}`;
      passthroughCache.set(tag, Component);
    }
    return passthroughCache.get(tag);
  };

  const motion = new Proxy({} as Record<string, unknown>, {
    get: (_target, key: string) => (key === 'create' ? () => passthrough('div') : passthrough(key)),
  });

  return {
    motion,
    m: motion,
    LazyMotion: ({ children }: any) => React.createElement(React.Fragment, null, children),
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
    useTransform: (_value: unknown, fn: any) => (typeof fn === 'function' ? fn(0) : 0),
    useMotionValue: (initial: unknown) => ({ get: () => initial, set: vi.fn() }),
    MotionConfig: ({ children }: any) => React.createElement(React.Fragment, null, children),
    domAnimation: {},
    domMax: {},
    LayoutGroup: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
}

vi.mock('framer-motion', async () => createMotionMock());

// Mock crypto-js
vi.mock('crypto-js', () => ({
  default: {
    MD5: vi.fn().mockReturnValue({ toString: () => 'mock-md5-hash' }),
    SHA256: vi.fn().mockReturnValue({ toString: () => 'mock-sha256-hash' }),
    AES: {
      encrypt: vi.fn().mockReturnValue({ toString: () => 'mock-encrypted' }),
      decrypt: vi.fn().mockReturnValue({ toString: () => 'mock-decrypted' })
    }
  }
}));

/**
 * axios 的替身。
 *
 * 关键是有 interceptors：src/api/api.ts 在模块加载时就调 api.interceptors.request.use(...)，
 * 旧 mock 的 create() 只回了 get/post/put/delete，于是导入 ../api 的任何测试都在
 * "Cannot read properties of undefined (reading 'request')" 上直接死掉（整文件加载失败）。
 * 具名导出 AxiosHeaders / AxiosError 也要给：api.ts 里 `config.headers instanceof AxiosHeaders`
 * 拿到 undefined 会抛 "Right-hand side of 'instanceof' is not callable"。
 */
class MockAxiosHeaders {
  constructor(init?: Record<string, unknown>) {
    Object.assign(this, init ?? {});
  }

  set(key: string, value: unknown) {
    (this as Record<string, unknown>)[key] = value;
    return this;
  }

  get(key: string) {
    return (this as Record<string, unknown>)[key];
  }

  delete(key: string) {
    delete (this as Record<string, unknown>)[key];
    return this;
  }
}

class MockAxiosError extends Error {
  isAxiosError = true;

  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AxiosError';
    this.status = status;
  }
}

const createMockInstance = () => {
  const noop = vi.fn().mockResolvedValue({ data: {} });
  return {
    get: noop,
    post: noop,
    put: noop,
    delete: noop,
    patch: noop,
    request: noop,
    head: noop,
    options: noop,
    defaults: { headers: { common: {}, get: {}, post: {}, put: {}, delete: {} } },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn(), clear: vi.fn() },
    },
  };
};

vi.mock('axios', () => {
  const axiosDefault = Object.assign(vi.fn(), createMockInstance(), {
    create: vi.fn(() => createMockInstance()),
    isAxiosError: vi.fn(() => false),
    all: vi.fn((values: unknown[]) => Promise.all(values)),
    spread: vi.fn((callback: any) => (args: any) => callback(...args)),
  });

  return {
    default: axiosDefault,
    axios: axiosDefault,
    AxiosHeaders: MockAxiosHeaders,
    AxiosError: MockAxiosError,
    isCancel: vi.fn(() => false),
    CanceledError: MockAxiosError,
  };
});
