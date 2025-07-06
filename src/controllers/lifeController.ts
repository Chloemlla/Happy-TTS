import { Request, Response } from 'express';
import { LifeService } from '../services/lifeService';
import logger from '../utils/logger';

export class LifeController {
    /**
     * 手机号码归属地查询
     */
    public static async phoneAddress(req: Request, res: Response) {
        try {
            const { phone } = req.query;
            const ip = LifeController.getClientIp(req);

            logger.info('收到手机号码归属地查询请求', {
                ip,
                phone,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!phone || typeof phone !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '手机号码参数不能为空'
                });
            }

            if (!/^1[3-9]\d{9}$/.test(phone)) {
                return res.status(400).json({
                    success: false,
                    error: '请输入有效的11位手机号码'
                });
            }

            const result = await LifeService.phoneAddress(phone);

            if (result.success) {
                res.json({
                    success: true,
                    message: '手机号码归属地查询完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '查询失败';
            
            logger.error('手机号码归属地查询失败', {
                ip: LifeController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * 油价查询
     */
    public static async oilPrice(req: Request, res: Response) {
        try {
            const { city } = req.query;
            const ip = LifeController.getClientIp(req);

            logger.info('收到油价查询请求', {
                ip,
                city,
                userAgent: req.headers['user-agent']
            });

            // 参数验证（城市参数可选）
            if (city && typeof city !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '城市参数必须是字符串'
                });
            }

            const result = await LifeService.oilPrice(city as string);

            if (result.success) {
                res.json({
                    success: true,
                    message: '油价查询完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '查询失败';
            
            logger.error('油价查询失败', {
                ip: LifeController.getClientIp(req),
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