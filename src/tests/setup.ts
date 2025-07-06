// Jest测试设置文件

// Mock 所有限速和保护中间件，确保性能测试时全部失效
jest.mock('express-rate-limit', () => () => (req: Request, res: Response, next: NextFunction) => next());

// Mock IP检查中间件
jest.mock('../middleware/ipCheck', () => ({
  ipCheckMiddleware: (req: Request, res: Response, next: NextFunction) => next()
}));

// Mock 篡改保护中间件
jest.mock('../middleware/tamperProtection', () => ({
  tamperProtectionMiddleware: (req: Request, res: Response, next: NextFunction) => next()
}));

// Mock 自定义限速中间件
jest.mock('../middleware/rateLimit', () => ({
  rateLimitMiddleware: (req: Request, res: Response, next: NextFunction) => next()
}));

// Mock 路由限速器
jest.mock('../middleware/routeLimiters', () => ({
  createLimiter: () => (req: Request, res: Response, next: NextFunction) => next()
}));

// Mock 限速器服务
jest.mock('../services/rateLimiter', () => ({
  rateLimiter: {
    isRateLimited: () => false,
    recordRequest: () => {},
    reset: () => {}
  },
  RateLimiter: class {
    constructor() {}
    isRateLimited() { return false; }
    recordRequest() {}
    reset() {}
  }
}));

// Mock 自定义限速器中间件
jest.mock('../middleware/rateLimiter', () => ({
  createLimiter: () => (req: Request, res: Response, next: NextFunction) => next()
}));

// Mock 所有可能的限速器，确保测试时全部失效
const createDummyLimiter = () => (req: Request, res: Response, next: NextFunction) => next();

// Mock 所有 express-rate-limit 的实例
jest.mock('express-rate-limit', () => {
  return () => createDummyLimiter();
});

// Mock 所有自定义限速器
jest.mock('../middleware/routeLimiters', () => ({
  createLimiter: () => createDummyLimiter(),
  tamperLimiter: createDummyLimiter(),
  commandLimiter: createDummyLimiter(),
  libreChatLimiter: createDummyLimiter(),
  dataCollectionLimiter: createDummyLimiter(),
  logsLimiter: createDummyLimiter(),
  passkeyLimiter: createDummyLimiter()
}));

// Mock IP 服务，确保测试时所有 IP 都被允许
jest.mock('../services/ip', () => ({
  getIPInfo: async () => ({
    ip: '127.0.0.1',
    country: '测试',
    region: '测试',
    city: '测试',
    isp: '测试'
  }),
  isIPAllowed: () => true // 总是允许所有 IP
}));

// Mock config，确保测试时所有 IP 都被认为是本地 IP
jest.mock('../config/config', () => {
  const originalConfig = jest.requireActual('../config/config');
  return {
    ...originalConfig,
    config: {
      ...originalConfig.config,
      localIps: ['127.0.0.1', '::1', 'localhost', '0.0.0.0', '::ffff:127.0.0.1']
    }
  };
});

// 注意：不再 mock ../app，让 supertest 能够正确识别 Express 应用实例

import { config } from '../config/config';
import path from 'path';
import fs from 'fs';
import { NextFunction, Request, Response } from 'express';

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// 创建测试所需的目录
const testDirs = [
  path.join(process.cwd(), 'test-data'),
  path.join(process.cwd(), 'test-data/logs'),
  path.join(process.cwd(), 'test-data/sharelogs'),
  path.join(process.cwd(), 'test-data/audio'),
  path.join(process.cwd(), 'logs'),
  path.join(process.cwd(), 'finish'),
  path.join(process.cwd(), 'data')
];

testDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 设置全局测试超时
jest.setTimeout(30000);

// 配置测试环境
const testConfig = {
  // 基础配置
  port: 3001,
  environment: 'test',
  
  // TTS配置
  openaiApiKey: 'test-api-key',
  openaiModel: 'tts-1',
  openaiVoice: 'alloy',
  openaiResponseFormat: 'mp3',
  openaiSpeed: '1.0',
  
  // 目录配置
  audioDir: path.join(process.cwd(), 'test-data/audio'),
  
  // 认证配置
  adminUsername: 'admin',
  adminPassword: 'admin123',
  jwtSecret: 'test-jwt-secret',
  
  // 速率限制配置
  rateLimits: {
    tts: { windowMs: 60000, max: 10 },
    auth: { windowMs: 300000, max: 30 },
    api: { windowMs: 60000, max: 100 }
  }
};

// 导出测试配置
export { testConfig };

// 模拟console方法以避免测试输出噪音
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// 模拟环境变量
process.env.SERVER_PASSWORD = 'test-password';
process.env.OPENAI_KEY = 'test-openai-key';
process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';

// 存储所有需要清理的资源
const cleanupTasks: (() => void | Promise<void>)[] = [];

// 添加清理任务
export function addCleanupTask(task: () => void | Promise<void>) {
  cleanupTasks.push(task);
}

// 清理函数
afterEach(() => {
  jest.clearAllMocks();
});

// 在所有测试完成后清理异步操作
afterAll(async () => {
  console.log('开始清理测试资源...');
  
  // 清理LibreChatService的定时器
  try {
    const { libreChatService } = require('../services/libreChatService');
    if (libreChatService && typeof libreChatService.cleanup === 'function') {
      libreChatService.cleanup();
    }
  } catch (error) {
    // 忽略错误
  }
  
  // 清理所有注册的清理任务
  for (const task of cleanupTasks) {
    try {
      await task();
    } catch (error) {
      console.warn('清理任务执行失败:', error);
    }
  }
  
  // 清理所有定时器
  const activeTimers = jest.getTimerCount();
  if (activeTimers > 0) {
    console.log(`清理 ${activeTimers} 个活跃定时器`);
    jest.clearAllTimers();
  }
  
  // 等待所有微任务完成
  await new Promise(resolve => setImmediate(resolve));
  
  // 等待一小段时间确保所有异步操作完成
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log('测试资源清理完成');
});

// 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

// 确保在测试结束时强制退出
process.on('beforeExit', () => {
  console.log('进程即将退出，执行最终清理...');
});

// 添加优雅退出处理
process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在清理...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在清理...');
  process.exit(0);
});