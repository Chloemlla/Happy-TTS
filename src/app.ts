'use server';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from './config/config';
import logger from './utils/logger';
import ttsRoutes from './routes/ttsRoutes';
import rateLimit from 'express-rate-limit';

const app = express();

// 设置信任代理
app.set('trust proxy', true);

// 创建请求限制器
const limiter = rateLimit({
  windowMs: 5000, // 5秒窗口
  max: 2, // 限制每个IP在窗口期内最多2个请求
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 应用请求限制到 TTS 路由
app.use('/api/tts', limiter);

// Static files
app.use('/static/audio', express.static(path.join(__dirname, '../finish')));

// Routes
app.use('/api/tts', ttsRoutes);

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

// Start server
app.listen(config.port, () => {
  logger.info(`Server is running on port ${config.port}`);
}); 