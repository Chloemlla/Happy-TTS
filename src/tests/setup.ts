// Jest测试设置文件

// Mock IP检查中间件
jest.mock("../middleware/ipCheck", () => ({
  ipCheckMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock MongoDB - 改进版本
const createMockQuery = (value: unknown) => {
  const promise = Promise.resolve(value);
  return {
    exec: jest.fn().mockResolvedValue(value),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
  };
};

const mockModel = {
  find: jest.fn().mockReturnValue(createMockQuery([])),
  findById: jest.fn().mockReturnValue(createMockQuery(null)),
  findOne: jest.fn().mockReturnValue(createMockQuery(null)),
  create: jest.fn().mockResolvedValue({}),
  save: jest.fn().mockResolvedValue({}),
  deleteOne: jest.fn().mockReturnValue(createMockQuery({})),
  deleteMany: jest.fn().mockReturnValue(createMockQuery({})),
  updateOne: jest.fn().mockReturnValue(createMockQuery({})),
  updateMany: jest.fn().mockReturnValue(createMockQuery({})),
  findByIdAndUpdate: jest.fn().mockReturnValue(createMockQuery(null)),
  findByIdAndDelete: jest.fn().mockReturnValue(createMockQuery(null)),
  countDocuments: jest.fn().mockReturnValue(createMockQuery(0)),
  aggregate: jest.fn().mockReturnValue(createMockQuery([])),
  insertMany: jest.fn().mockResolvedValue([]),
  findOneAndUpdate: jest.fn().mockReturnValue(createMockQuery(null)),
  findOneAndDelete: jest.fn().mockReturnValue(createMockQuery(null)),
  exists: jest.fn().mockResolvedValue(null),
};

const mockSchema = jest.fn().mockImplementation(() => ({
  index: jest.fn().mockReturnThis(),
  pre: jest.fn().mockReturnThis(),
  post: jest.fn().mockReturnThis(),
  plugin: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  virtual: jest.fn().mockReturnValue({
    get: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
  }),
  model: jest.fn().mockReturnValue(mockModel),
  methods: {},
  statics: {},
})) as jest.Mock & { Types: Record<string, unknown> };

const mockObjectId = Object.assign(
  jest.fn().mockImplementation((value?: string) => value || "mock-object-id"),
  { isValid: jest.fn().mockReturnValue(true) },
);

mockSchema.Types = {
  Mixed: Object,
  ObjectId: mockObjectId,
};

const mockMongoose = {
  Schema: mockSchema,
  models: {},
  connect: jest.fn().mockResolvedValue({}),
  disconnect: jest.fn().mockResolvedValue({}),
  connection: {
    readyState: 1,
    on: jest.fn(),
    once: jest.fn(),
    collection: jest.fn().mockReturnValue(mockModel),
    name: "tts-test",
    host: "localhost",
    port: 27017,
  },
  model: jest.fn().mockReturnValue(mockModel),
  Types: {
    ObjectId: mockObjectId,
  },
  isValidObjectId: jest.fn().mockReturnValue(true),
  startSession: jest.fn().mockResolvedValue({
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
  }),
};

jest.mock("mongoose", () => ({
  __esModule: true,
  default: mockMongoose,
  ...mockMongoose,
}));

// Mock 篡改保护中间件
jest.mock("../middleware/tamperProtection", () => ({
  tamperProtectionMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock 自定义限速中间件
jest.mock("../middleware/rateLimit", () => ({
  rateLimitMiddleware: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock 路由限速器
jest.mock("../middleware/routeLimiters", () => ({
  createLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock 限速器服务
jest.mock("../services/rateLimiter", () => ({
  rateLimiter: {
    isRateLimited: () => false,
    recordRequest: () => {},
    reset: () => {},
  },
  RateLimiter: class {
    isRateLimited() {
      return false;
    }
    recordRequest() {}
    reset() {}
  },
}));

// Mock 自定义限速器中间件
jest.mock("../middleware/rateLimiter", () => ({
  createLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  resourceLimiter: {
    stats: (_req: Request, _res: Response, next: NextFunction) => next(),
    create: (_req: Request, _res: Response, next: NextFunction) => next(),
    initTest: (_req: Request, _res: Response, next: NextFunction) => next(),
    getById: (_req: Request, _res: Response, next: NextFunction) => next(),
    update: (_req: Request, _res: Response, next: NextFunction) => next(),
    delete: (_req: Request, _res: Response, next: NextFunction) => next(),
    getResources: (_req: Request, _res: Response, next: NextFunction) => next(),
    getCategories: (_req: Request, _res: Response, next: NextFunction) => next(),
  },
}));

// Mock 所有可能的限速器，确保测试时全部失效
const createDummyLimiter = () => (_req: Request, _res: Response, next: NextFunction) => next();

// Mock 所有 express-rate-limit 的实例
jest.mock("express-rate-limit", () => {
  const limiterFactory = () => createDummyLimiter();
  return {
    __esModule: true,
    default: limiterFactory,
    rateLimit: limiterFactory,
  };
});

// Mock 所有自定义限速器
jest.mock("../middleware/routeLimiters", () => ({
  createLimiter: () => createDummyLimiter(),
  loginLimiter: createDummyLimiter(),
  registerLimiter: createDummyLimiter(),
  authLimiter: createDummyLimiter(),
  meEndpointLimiter: createDummyLimiter(),
  ttsLimiter: createDummyLimiter(),
  historyLimiter: createDummyLimiter(),
  adminLimiter: createDummyLimiter(),
  frontendLimiter: createDummyLimiter(),
  totpLimiter: createDummyLimiter(),
  tamperLimiter: createDummyLimiter(),
  commandLimiter: createDummyLimiter(),
  libreChatLimiter: createDummyLimiter(),
  dataCollectionLimiter: createDummyLimiter(),
  logsLimiter: createDummyLimiter(),
  passkeyLimiter: createDummyLimiter(),
  ipfsLimiter: createDummyLimiter(),
  networkLimiter: createDummyLimiter(),
  dataProcessLimiter: createDummyLimiter(),
  cloudflareChallengeLimiter: createDummyLimiter(),
  mediaLimiter: createDummyLimiter(),
  socialLimiter: createDummyLimiter(),
  lifeLimiter: createDummyLimiter(),
  miniapiLimiter: createDummyLimiter(),
  antaLimiter: createDummyLimiter(),
  statusLimiter: createDummyLimiter(),
  openapiLimiter: createDummyLimiter(),
  audioFileLimiter: createDummyLimiter(),
  modlistMountLimiter: createDummyLimiter(),
  cdkMountLimiter: createDummyLimiter(),
  githubBillingLimiter: createDummyLimiter(),
  deeplxLimiter: createDummyLimiter(),
  integrityLimiter: createDummyLimiter(),
  nexaiSecurityLimiter: createDummyLimiter(),
  rootLimiter: createDummyLimiter(),
  lcCompatLimiter: createDummyLimiter(),
  ipQueryLimiter: createDummyLimiter(),
  ipLocationLimiter: createDummyLimiter(),
  ipReportLimiter: createDummyLimiter(),
  serverStatusLimiter: createDummyLimiter(),
  staticFileLimiter: createDummyLimiter(),
  docsTimeoutLimiter: createDummyLimiter(),
  globalDefaultLimiter: createDummyLimiter(),
  notFoundLimiter: createDummyLimiter(),
  getRateLimitMetricsSnapshot: () => ({
    total429Hits: 0,
    byLimiter: {},
    byCategory: {},
    hotIps: [],
    hotRoutes: [],
  }),
}));

// Mock MongoDB 服务，避免连接超时
jest.mock("../services/mongoService", () => ({
  __esModule: true,
  connectMongo: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
  waitForConnection: jest.fn().mockResolvedValue(true),
  ensureConnection: jest.fn(async (operation: () => Promise<unknown>) => operation()),
  getConnectionInfo: jest.fn().mockReturnValue({ readyState: 1, stateName: "已连接" }),
  mongoose: mockMongoose,
  default: mockMongoose,
}));

// Mock userService，避免MongoDB连接问题
jest.mock("../services/userService", () => {
  type MockUser = Record<string, any>;
  const users = new Map<string, MockUser>();

  const clone = (user: MockUser | null | undefined) => (user ? { ...user } : null);
  const seedUser = (user: MockUser) => users.set(user.id, { ...user });

  seedUser({
    id: "1",
    username: "admin",
    email: "admin@example.com",
    password: "admin123",
    role: "admin",
    dailyUsage: 0,
    lastUsageDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  seedUser({
    id: "2",
    username: "testuser",
    email: "test@example.com",
    password: "TestPass123!",
    role: "user",
    dailyUsage: 0,
    lastUsageDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });

  const findByUsername = (username: string) =>
    Array.from(users.values()).find((user) => user.username === username) || null;
  const findByEmail = (email: string) => Array.from(users.values()).find((user) => user.email === email) || null;

  const createUser = jest.fn(async (userOrUsername: MockUser | string, email?: string, password?: string) => {
    const user =
      typeof userOrUsername === "string"
        ? {
            id: `mock-user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            username: userOrUsername,
            email,
            password,
            role: "user",
            dailyUsage: 0,
            lastUsageDate: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          }
        : { ...userOrUsername };

    if (findByUsername(user.username) || findByEmail(user.email)) {
      return null;
    }

    users.set(user.id, user);
    return clone(user);
  });

  return {
    getUserByUsername: jest.fn(async (username: string) => clone(findByUsername(username))),
    getUserAuthByUsername: jest.fn(async (username: string) => clone(findByUsername(username))),
    getUserByLinuxDoId: jest.fn(async (linuxdoId: string) =>
      clone(Array.from(users.values()).find((user) => user.linuxdoId === linuxdoId)),
    ),
    getUserByEmail: jest.fn(async (email: string) => clone(findByEmail(email))),
    getUserAuthByEmail: jest.fn(async (email: string) => clone(findByEmail(email))),
    getUserById: jest.fn(async (id: string) => clone(users.get(id))),
    getAllUsers: jest.fn(async () => Array.from(users.values()).map((user) => clone(user))),
    getAdminUserList: jest.fn(async () => Array.from(users.values()).map((user) => clone(user))),
    createUser,
    updateUser: jest.fn(async (id: string, updates: MockUser) => {
      const existing = users.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...updates };
      users.set(id, updated);
      return clone(updated);
    }),
    deleteUser: jest.fn(async (id: string) => users.delete(id)),
    verifyAndMigrateUserPassword: jest.fn(async (user: MockUser, password: string) => ({
      valid: Boolean(user && user.password === password),
      user,
    })),
    incrementUserDailyUsageAtomic: jest.fn(async (id: string, dailyLimit: number) => {
      const user = users.get(id);
      if (!user || user.dailyUsage >= dailyLimit) return { success: false, user: clone(user) };
      user.dailyUsage += 1;
      users.set(id, user);
      return { success: true, user: clone(user) };
    }),
  };
});

// Mock IP 服务，确保测试时所有 IP 都被允许
jest.mock("../services/ip", () => ({
  getIPInfo: async () => ({
    ip: "127.0.0.1",
    country: "测试",
    region: "测试",
    city: "测试",
    isp: "测试",
  }),
  isIPAllowed: () => true, // 总是允许所有 IP
}));

// Mock config，确保测试时所有 IP 都被认为是本地 IP
jest.mock("../config/config", () => {
  const originalConfig = jest.requireActual("../config/config");
  return {
    ...originalConfig,
    config: {
      ...originalConfig.config,
      localIps: ["127.0.0.1", "::1", "localhost", "0.0.0.0", "::ffff:127.0.0.1"],
    },
  };
});

// 注意：不再 mock ../app，让 supertest 能够正确识别 Express 应用实例

import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";

// 设置测试环境变量
process.env.NODE_ENV = "test";

// 设置测试环境的MongoDB URI（即使不使用也要设置，避免连接尝试）
process.env.MONGO_URI = "mongodb://localhost:27017/tts-test";

// 设置其他必要的环境变量
process.env.SERVER_PASSWORD = "test-password";
process.env.OPENAI_KEY = "test-openai-key";
process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin123";
process.env.SMART_HUMAN_CHECK_SECRET = "test-smart-human-check-secret";

// 创建测试所需的目录
const testDirs = [
  path.join(process.cwd(), "test-data"),
  path.join(process.cwd(), "test-data/logs"),
  path.join(process.cwd(), "test-data/sharelogs"),
  path.join(process.cwd(), "test-data/audio"),
  path.join(process.cwd(), "logs"),
  path.join(process.cwd(), "finish"),
  path.join(process.cwd(), "data"),
];

testDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 初始化测试用户数据
const initializeTestUsers = () => {
  const usersFile = path.join(process.cwd(), "data", "users.json");
  const testUsers = [
    {
      id: "1",
      username: "admin",
      email: "admin@example.com",
      password: "admin123",
      role: "admin",
      dailyUsage: 0,
      lastUsageDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      username: "testuser",
      email: "test@example.com",
      password: "TestPass123!",
      role: "user",
      dailyUsage: 0,
      lastUsageDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];

  try {
    fs.writeFileSync(usersFile, JSON.stringify(testUsers, null, 2));
    console.log("测试用户数据初始化完成");
  } catch (error) {
    console.error("测试用户数据初始化失败:", error);
  }
};

// 在测试开始前初始化用户数据
initializeTestUsers();

// 设置全局测试超时
jest.setTimeout(30000);

// 配置测试环境
const testConfig = {
  // 基础配置
  port: 3001,
  environment: "test",

  // TTS配置
  openaiApiKey: "test-api-key",
  openaiModel: "tts-1",
  openaiVoice: "alloy",
  openaiResponseFormat: "mp3",
  openaiSpeed: "1.0",

  // 目录配置
  audioDir: path.join(process.cwd(), "test-data/audio"),

  // 认证配置
  adminUsername: "admin",
  adminPassword: "admin123",
  jwtSecret: "test-jwt-secret",

  // 速率限制配置
  rateLimits: {
    tts: { windowMs: 60000, max: 10 },
    auth: { windowMs: 300000, max: 30 },
    api: { windowMs: 60000, max: 100 },
  },
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
process.env.SERVER_PASSWORD = "test-password";
process.env.OPENAI_KEY = "test-openai-key";
process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";

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
  console.log("开始清理测试资源...");

  // 清理LibreChatService的定时器
  try {
    const { libreChatService } = require("../services/libreChatService");
    if (libreChatService && typeof libreChatService.cleanup === "function") {
      libreChatService.cleanup();
    }
  } catch (_error) {
    // 忽略错误
  }

  // 清理 NonceStore 定时器
  try {
    const { destroyNonceStore } = require("../services/nonceStore");
    if (destroyNonceStore && typeof destroyNonceStore === "function") {
      destroyNonceStore();
    }
  } catch (_error) {
    // 忽略错误
  }

  // 清理所有注册的清理任务
  for (const task of cleanupTasks) {
    try {
      await task();
    } catch (error) {
      console.warn("清理任务执行失败:", error);
    }
  }

  // 清理所有定时器
  const activeTimers = jest.getTimerCount();
  if (activeTimers > 0) {
    console.log(`清理 ${activeTimers} 个活跃定时器`);
    jest.clearAllTimers();
  }

  // 等待所有微任务完成
  await new Promise((resolve) => setImmediate(resolve));

  // 等待一小段时间确保所有异步操作完成
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log("测试资源清理完成");
});

// 处理未捕获的异常
process.on("unhandledRejection", (reason, _promise) => {
  console.error("未处理的Promise拒绝:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("未捕获的异常:", error);
});

// 确保在测试结束时强制退出
process.on("beforeExit", () => {
  console.log("进程即将退出，执行最终清理...");
});

// 添加优雅退出处理
process.on("SIGINT", () => {
  console.log("收到SIGINT信号，正在清理...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("收到SIGTERM信号，正在清理...");
  process.exit(0);
});

// Mock 其他常用模块
jest.mock("nanoid", () => ({
  nanoid: jest.fn().mockReturnValue("test-nanoid-123"),
}));

jest.mock("marked", () => ({
  marked: jest.fn().mockReturnValue("<p>test</p>"),
}));

jest.mock("dayjs", () => {
  const mockDayjs = jest.fn((_date) => ({
    format: jest.fn().mockReturnValue("2024-01-01"),
    toDate: jest.fn().mockReturnValue(new Date()),
    valueOf: jest.fn().mockReturnValue(1704067200000),
  }));
  (mockDayjs as any).extend = jest.fn();
  return mockDayjs;
});

// 注意：前端相关的模块 Mock 已移除，因为后端测试不需要
