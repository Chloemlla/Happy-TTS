import { Request, Response } from 'express';
import { NetworkService } from '../services/networkService';
import logger from '../utils/logger';

export class NetworkController {
    /**
     * TCP连接检测
     */
    public static async tcpPing(req: Request, res: Response) {
        try {
            const { address, port } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到TCP连接检测请求', {
                ip,
                address,
                port,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!address || typeof address !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '地址参数不能为空'
                });
            }

            if (!port || isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
                return res.status(400).json({
                    success: false,
                    error: '端口参数必须是1-65535之间的数字'
                });
            }

            const result = await NetworkService.tcpPing(address, Number(port));

            if (result.success) {
                res.json({
                    success: true,
                    message: 'TCP连接检测完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '检测失败';
            
            logger.error('TCP连接检测失败', {
                ip: NetworkController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * Ping检测
     */
    public static async ping(req: Request, res: Response) {
        try {
            const { url } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到Ping检测请求', {
                ip,
                url,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!url || typeof url !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'URL参数不能为空'
                });
            }

            const result = await NetworkService.ping(url);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Ping检测完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '检测失败';
            
            logger.error('Ping检测失败', {
                ip: NetworkController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * 网站测速
     */
    public static async speedTest(req: Request, res: Response) {
        try {
            const { url } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到网站测速请求', {
                ip,
                url,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!url || typeof url !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'URL参数不能为空'
                });
            }

            const result = await NetworkService.speedTest(url);

            if (result.success) {
                res.json({
                    success: true,
                    message: '网站测速完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '测速失败';
            
            logger.error('网站测速失败', {
                ip: NetworkController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * 端口扫描
     */
    public static async portScan(req: Request, res: Response) {
        try {
            const { address } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到端口扫描请求', {
                ip,
                address,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!address || typeof address !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '地址参数不能为空'
                });
            }

            const result = await NetworkService.portScan(address);

            if (result.success) {
                res.json({
                    success: true,
                    message: '端口扫描完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '扫描失败';
            
            logger.error('端口扫描失败', {
                ip: NetworkController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * 精准IP查询
     */
    public static async ipQuery(req: Request, res: Response) {
        try {
            const { ip } = req.query;
            const clientIp = NetworkController.getClientIp(req);

            logger.info('收到精准IP查询请求', {
                clientIp,
                queryIp: ip,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!ip || typeof ip !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'IP参数不能为空'
                });
            }

            // 简单的IP格式验证
            const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            if (!ipRegex.test(ip)) {
                return res.status(400).json({
                    success: false,
                    error: 'IP地址格式不正确'
                });
            }

            const result = await NetworkService.ipQuery(ip);

            if (result.success) {
                res.json({
                    success: true,
                    message: '精准IP查询完成',
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
            
            logger.error('精准IP查询失败', {
                ip: NetworkController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * 随机一言古诗词
     */
    public static async randomQuote(req: Request, res: Response) {
        try {
            const { type } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到随机一言古诗词请求', {
                ip,
                type,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!type || typeof type !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '类型参数不能为空'
                });
            }

            // 验证类型参数
            if (type !== 'hitokoto' && type !== 'poetry') {
                return res.status(400).json({
                    success: false,
                    error: '类型参数必须是 hitokoto(一言) 或 poetry(古诗词)'
                });
            }

            const result = await NetworkService.randomQuote(type as 'hitokoto' | 'poetry');

            if (result.success) {
                res.json({
                    success: true,
                    message: '随机一言古诗词获取完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '获取失败';
            
            logger.error('随机一言古诗词获取失败', {
                ip: NetworkController.getClientIp(req),
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