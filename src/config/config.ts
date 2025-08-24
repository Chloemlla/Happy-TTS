import dotenv from 'dotenv';
import path from 'path';
import { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } from './env';

// 加载环境变量
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'tts-1',
  openaiVoice: process.env.OPENAI_VOICE || 'alloy',
  openaiResponseFormat: process.env.OPENAI_RESPONSE_FORMAT || 'mp3',
  openaiSpeed: process.env.OPENAI_SPEED || '1.0',
  audioDir: path.join(process.cwd(), 'finish'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  // 生产环境强制要求管理员密码
  adminPassword: process.env.NODE_ENV === 'production' 
    ? (process.env.ADMIN_PASSWORD || (() => { throw new Error('生产环境必须设置 ADMIN_PASSWORD 环境变量') })())
    : (process.env.ADMIN_PASSWORD || 'admin'),
  // 添加本地 IP 配置
  localIps: ['127.0.0.1', 'localhost', '::1'],
  // 添加基础URL配置
  baseUrl: process.env.VITE_API_URL || process.env.BASE_URL || 'https://api.hapxs.com',
  // 添加生成码配置
  generationCode: process.env.GENERATION_CODE || 'admin',
  // 生产环境强制要求 JWT 密钥
  jwtSecret: process.env.NODE_ENV === 'production'
    ? (process.env.JWT_SECRET || (() => { throw new Error('生产环境必须设置 JWT_SECRET 环境变量') })())
    : (process.env.JWT_SECRET || 'yb56beb12b35ab636b66c4f9fc168646785a8e85a'),
  jwtExpiresIn: '24h',
  // 密码加密配置
  bcryptSaltRounds: 12,
  // 登录限制配置
  loginRateLimit: {
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 5 // 最多5次尝试
  },
  // 注册限制配置
  registerRateLimit: {
    windowMs: 60 * 60 * 1000, // 1小时
    max: 3 // 最多3次尝试
  },
  // 用户数据存储方式: 'file' 或 'mongo'
  userStorageMode: process.env.USER_STORAGE_MODE || 'file',
  // Turnstile 配置
  turnstile: {
    secretKey: process.env.TURNSTILE_SECRET_KEY || '',
    siteKey: process.env.TURNSTILE_SITE_KEY || '',
  },

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root',
    database: MYSQL_DATABASE,
  },
}; 