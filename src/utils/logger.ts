import winston from 'winston';
import path from 'path';

// 创建日志目录
const logDir = path.join(process.cwd(), 'logs');

// 配置日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

// 创建 logger 实例
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
        // 错误日志
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error'
        }),
        // 所有日志
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log')
        })
    ]
});

// 在开发环境下同时输出到控制台
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

export default logger; 