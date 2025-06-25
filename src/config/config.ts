import dotenv from 'dotenv';
import path from 'path';

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
  adminPassword: process.env.ADMIN_PASSWORD || 'wmy',
  // 添加本地 IP 配置
  localIps: ['127.0.0.1', 'localhost', '::1'],
  // 添加基础URL配置
  baseUrl: process.env.VITE_API_URL || process.env.BASE_URL || 'https://tts-api.hapxs.com',
  // 添加生成码配置
  generationCode: process.env.GENERATION_CODE || 'wmy',
  // JWT 配置
  jwtSecret: process.env.JWT_SECRET || 'yb56beb12b35ab636b66c4f9fc168646785a8e85a',
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
  }
}; 