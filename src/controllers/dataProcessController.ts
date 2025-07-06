import { Request, Response } from 'express';
import { DataProcessService } from '../services/dataProcessService';
import logger from '../utils/logger';

export class DataProcessController {
    /**
     * Base64编码
     */
    public static async base64Encode(req: Request, res: Response) {
        try {
            const { text } = req.query;
            const ip = DataProcessController.getClientIp(req);

            logger.info('收到Base64编码请求', {
                ip,
                textLength: text ? String(text).length : 0,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!text || typeof text !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '文本参数不能为空'
                });
            }

            if (text.length > 10000) {
                return res.status(400).json({
                    success: false,
                    error: '文本长度不能超过10000个字符'
                });
            }

            const result = await DataProcessService.base64Encode(text);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Base64编码完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '编码失败';
            
            logger.error('Base64编码失败', {
                ip: DataProcessController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * Base64解码
     */
    public static async base64Decode(req: Request, res: Response) {
        try {
            const { text } = req.query;
            const ip = DataProcessController.getClientIp(req);

            logger.info('收到Base64解码请求', {
                ip,
                textLength: text ? String(text).length : 0,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!text || typeof text !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '文本参数不能为空'
                });
            }

            if (text.length > 10000) {
                return res.status(400).json({
                    success: false,
                    error: '文本长度不能超过10000个字符'
                });
            }

            const result = await DataProcessService.base64Decode(text);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Base64解码完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '解码失败';
            
            logger.error('Base64解码失败', {
                ip: DataProcessController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * MD5哈希加密
     */
    public static async md5Hash(req: Request, res: Response) {
        try {
            const { text } = req.query;
            const ip = DataProcessController.getClientIp(req);

            logger.info('收到MD5哈希加密请求', {
                ip,
                textLength: text ? String(text).length : 0,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!text || typeof text !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '文本参数不能为空'
                });
            }

            if (text.length > 10000) {
                return res.status(400).json({
                    success: false,
                    error: '文本长度不能超过10000个字符'
                });
            }

            const result = await DataProcessService.md5Hash(text);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'MD5哈希加密完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '加密失败';
            
            logger.error('MD5哈希加密失败', {
                ip: DataProcessController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * 获取客户端IP地址
     */
    private static getClientIp(req: Request): string {
        const ip = 
            (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            req.headers['x-real-ip'] as string ||
            req.ip ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            'unknown';
        
        return ip.replace(/^::ffff:/, '');
    }
} 