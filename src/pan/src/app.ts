import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import mongoStore from 'connect-mongo';
import dotenv from 'dotenv';
import path from 'path';
import * as csurf from 'csurf';

// 导入路由
import adminRoutes from '@/routes/admin';
import resourceRoutes from '@/routes/resources';
import cdkRoutes from '@/routes/cdks';
import statsRoutes from '@/routes/stats';

// 导入中间件
import { errorHandler } from '@/middleware/errorHandler';
import { authMiddleware } from '@/middleware/auth';

// 导入配置和服务
import { config } from '@/config';
import { databaseService } from '@/services/database';

// 导入日志
import { logger } from '@/utils/logger';

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PAN_PORT || 3001;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS配置
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// 请求日志
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// 解析请求体
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 会话配置
app.use(session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  store: mongoStore.create({
    mongoUrl: config.database.url,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 24小时
  }),
  // 修正 sameSite 类型，避免类型错误
  cookie: {
    ...config.session.cookie,
    sameSite: config.session.cookie.sameSite as boolean | 'lax' | 'strict' | 'none' | undefined,
  },
}));

// 在 session 之后注册 CSRF 中间件
app.use(csurf.default({ cookie: true }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Synapse Pan Admin',
    version: '1.0.0'
  });
});

// API路由
app.use('/admin', adminRoutes);
app.use('/admin/resources', authMiddleware, resourceRoutes);
app.use('/admin/cdks', authMiddleware, cdkRoutes);
app.use('/admin/stats', authMiddleware, statsRoutes);

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
const startServer = async () => {
  try {
    // 连接数据库
    await databaseService.connect();
    
    // 启动服务器
    app.listen(PORT, () => {
      logger.info(`🚀 Pan Admin Server running on port ${PORT}`);
      logger.info(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
      logger.info(`🔍 Health Check: http://localhost:${PORT}/health`);
      logger.info(`🗄️  Database: ${config.database.url}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;