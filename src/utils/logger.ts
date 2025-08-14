import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 创建日志目录
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 配置日志格式（上海时间）
const logFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: () => {
            try {
                const dtf = new Intl.DateTimeFormat('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
                // e.g. 2025/08/14 20:46:50 → replace / with - for consistency (avoid replaceAll for wider TS targets)
                return dtf.format(new Date()).replace(/\//g, '-');
            } catch {
                return new Date().toISOString();
            }
        }
    }),
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