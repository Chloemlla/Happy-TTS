// Jest测试设置文件

import { config } from '../config/config';
import path from 'path';
import fs from 'fs';

// 设置测试环境变量
process.env.NODE_ENV = 'test';

// 创建测试所需的目录
const testDirs = [
  path.join(process.cwd(), 'test-data'),
  path.join(process.cwd(), 'test-data/logs'),
  path.join(process.cwd(), 'test-data/sharelogs'),
  path.join(process.cwd(), 'test-data/audio')
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

// 清理函数
afterEach(() => {
  jest.clearAllMocks();
}); 