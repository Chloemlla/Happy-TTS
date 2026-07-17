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
  coverageProvider: 'v8',
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-test/',
    '/coverage/',
    '/test-data/',
    '/build/',
    '/frontend/dist/',
    '/frontend/build/',
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
