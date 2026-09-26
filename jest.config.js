const { createDefaultPreset } = require("ts-jest");
 
const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testMatch: [
    '**/__tests__/**/*.(ts|tsx|js)',
    '**/*.(test|spec).(ts|tsx|js)',
    '**/*.test.(ts|tsx|js)',
    '**/*.spec.(ts|tsx|js)'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@frontend/(.*)$': '<rootDir>/frontend/src/$1',
    // jest 30 的 unrs-resolver 不把相对导入的 `.js` 后缀映射到 `.ts` 源文件，
    // 剥离后缀让 jest 按 moduleFileExtensions 找到对应的 `.ts`。
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testPathIgnorePatterns: [
    '[\\\\/]frontend[\\\\/]src[\\\\/].*\\.(test|spec)\\.(ts|tsx|js|jsx)$',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json',
      diagnostics: {
        ignoreCodes: [1343, 151001]
      },
      useESM: false
    }],
    '^.+\\.mjs$': 'babel-jest',
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(marked|nanoid|.*\\.mjs$|@fingerprintjs|@simplewebauthn)/).*',
    '/dist/',
    '/dist-test/',
    '/coverage/',
    '/test-data/',
    '/build/',
    '/frontend/dist/',
    '/frontend/build/'
  ],
  // 性能测试配置
  testTimeout: 30000,
  maxConcurrency: 1, // 串行运行性能测试
  maxWorkers: 1,     // 使用单个工作进程
  
  // 开放句柄检测：不要 forceExit，否则会掩盖资源生命周期问题。
  detectOpenHandles: true,
  
  // 覆盖率配置
  collectCoverage: false, // opt-in via --coverage (avoids minimatch@10 + test-exclude CJS break)
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/tests/**',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    // 纯 interface/type 别名文件：消费方一律用 `import type`，编译后引用被完全擦除，
    // 模块永不会被加载，所以只能永远是 0%——这是结构性噪声而不是测试欠账。
    // 只个别排除（不用 `!src/**/types.ts` 通配）：userGenerationStorage/types.ts 等带
    // isAdminUser() 运行时代码的同名文件必须继续计入。
    '!src/services/turnstile/types.ts',
    '!src/services/librechat/types.ts',
  ],
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: {
      statements: 8,
      functions: 7,
      branches: 5,
      lines: 8,
    },
  },
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-test/',
    '/coverage/',
    '/test-data/',
    '/build/',
    '/frontend/dist/',
    '/frontend/build/',
    '/src/tests/',
    '/__tests__/',
    '\\.d\\.ts$',
    '.test.ts',
    '.test.tsx',
    '.spec.ts',
    '.spec.tsx',
    'setup.ts'
  ],
  // 测试报告
  reporters: [
    'default',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // 清理配置
  clearMocks: true,
  restoreMocks: true,
  
  // 异步操作配置
  testEnvironmentOptions: {
    url: 'http://localhost',
  },
  
  // 错误处理
  verbose: true,
  silent: false,
  
  // 模块解析
  moduleDirectories: ['node_modules', 'src', 'frontend/src']
};
