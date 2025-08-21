import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { config } from '../../config/config';

export const testConfig = {
  validToken: 'test-token',
  testText: '这是一段测试文本',
  testVoice: config.openaiVoice,
  testModel: config.openaiModel,
  testUser: {
    id: 'test-user-id',
    username: 'test@example.com',
    password: 'test-password'
  }
};

// 创建测试JWT token
export const createTestToken = (userId: string = testConfig.testUser.id) => {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '1h' });
};

// 创建模拟请求对象
export const createMockRequest = (overrides: Partial<Request> = {}): Partial<Request> => ({
  ip: '127.0.0.1',
  headers: {},
  body: {},
  ...overrides
});

// 创建模拟响应对象
export const createMockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// 测试目录配置
const TEST_DIRECTORIES = [
  path.join(process.cwd(), 'test-data'),
  path.join(process.cwd(), 'test-data/logs'),
  path.join(process.cwd(), 'test-data/sharelogs'),
  path.join(process.cwd(), 'test-data/audio')
];

// 创建测试目录
export const createTestDirectories = () => {
  TEST_DIRECTORIES.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// 清理测试文件
export const cleanupTestFiles = (directory: string) => {
  if (fs.existsSync(directory)) {
    fs.readdirSync(directory).forEach(file => {
      const filePath = path.join(directory, file);
      fs.unlinkSync(filePath);
    });
  }
};

// 测试数据清理
export const cleanupTestData = async () => {
  TEST_DIRECTORIES.forEach(dir => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
};

// 生成随机文本
export const generateRandomText = (length: number) => {
  const characters = '你好世界这是一段测试文本用于性能测试';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// 创建延迟
export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 创建并发请求
export const createConcurrentRequests = (count: number, requestFn: () => Promise<any>) => {
  return Promise.all(Array(count).fill(null).map(() => requestFn()));
};

// 监控响应时间
export const measureResponseTime = async (requestFn: () => Promise<any>) => {
  const start = Date.now();
  await requestFn();
  return Date.now() - start;
}; 