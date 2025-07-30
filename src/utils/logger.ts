import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 创建日志目录
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 配置日志格式
const logFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `[${timestamp}] ${level}: ${message} ${metaString}`;
    })
);

// 创建 logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
        // 错误日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error'
        }),
        // 全部日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log')
        }),
        new winston.transports.Console({
            stderrLevels: ['error', 'warn', 'info']
        })
    ]
});

// 敏感信息过滤
const sensitiveFields = ['password', 'token', 'secret', 'key', 'adminPassword', 'jwt', 'apiKey'];
const maskSensitiveData = (obj: any): any => {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const masked: { [key: string]: any } = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      masked[key] = typeof value === 'string' ? '***' : '***';
    } else if (typeof value === 'object') {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
};

// 安全日志记录
const safeLog = (level: string, message: string, meta?: any) => {
  const safeMeta = meta ? maskSensitiveData(meta) : undefined;
  (logger as any)[level](message, safeMeta);
};

export { safeLog, maskSensitiveData };
export default logger; 