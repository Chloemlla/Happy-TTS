const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  // 性能测试配置
  testTimeout: 30000,
  maxConcurrency: 1, // 串行运行性能测试
  maxWorkers: 1,     // 使用单个工作进程
  
  // 强制退出配置
  forceExit: true,   // 强制退出进程
  detectOpenHandles: true, // 检测未关闭的句柄
  
  // 覆盖率配置
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
    '/test-data/',
    '.test.ts',
  ],
  // 测试报告
  reporters: [
    'default',
  ],
  
  // 清理配置
  clearMocks: true,
  restoreMocks: true,
  
  // 异步操作配置
  testEnvironmentOptions: {
    url: 'http://localhost',
  },
};