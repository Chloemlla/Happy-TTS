// Jest测试设置文件

// 设置测试环境变量
process.env.NODE_ENV = 'test';

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

// 设置测试超时
jest.setTimeout(10000);

// 清理函数
afterEach(() => {
  jest.clearAllMocks();
}); 