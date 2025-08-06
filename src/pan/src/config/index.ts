import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // 服务器配置
  server: {
    port: process.env.PAN_PORT || 3001,
    host: process.env.PAN_HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
  },

  // 数据库配置
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017/synapse-pan',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },

  // 会话配置
  session: {
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24小时
    },
  },

  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'your-jwt-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // 文件上传配置
  upload: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    uploadDir: 'uploads',
  },

  // CDK配置
  cdk: {
    length: 16,
    charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    batchSize: 100,
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/pan.log',
  },

  // 安全配置
  security: {
    bcryptRounds: 12,
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 100, // 限制每个IP 15分钟内最多100个请求
    },
  },
};

export default config; 