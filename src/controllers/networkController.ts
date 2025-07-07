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
     * 抖音热榜查询
     */
    public static async douyinHot(req: Request, res: Response) {
        try {
            const ip = NetworkController.getClientIp(req);

            logger.info('收到抖音热榜查询请求', {
                ip,
                userAgent: req.headers['user-agent']
            });

            const result = await NetworkService.douyinHot();

            if (result.success) {
                res.json({
                    success: true,
                    message: '抖音热榜获取完成',
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
            
            logger.error('抖音热榜获取失败', {
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
     * 字符串Hash加密
     */
    public static async hashEncrypt(req: Request, res: Response) {
        try {
            const { type, text } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到字符串Hash加密请求', {
                ip,
                type,
                textLength: text ? String(text).length : 0,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!type || typeof type !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '加密算法类型参数不能为空'
                });
            }

            if (!text || typeof text !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '加密文本参数不能为空'
                });
            }

            const validTypes = ['md4', 'md5', 'sha1', 'sha256', 'sha512'];
            if (!validTypes.includes(type)) {
                return res.status(400).json({
                    success: false,
                    error: `不支持的加密算法: ${type}。支持的算法: ${validTypes.join(', ')}`
                });
            }

            const result = await NetworkService.hashEncrypt(type as 'md4' | 'md5' | 'sha1' | 'sha256' | 'sha512', text);

            if (result.success) {
                res.json({
                    success: true,
                    message: '字符串Hash加密完成',
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '加密失败';
            
            logger.error('字符串Hash加密失败', {
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
     * Base64编码与解码
     */
    public static async base64Operation(req: Request, res: Response) {
        try {
            const { type, text } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到Base64操作请求', {
                ip,
                type,
                textLength: text ? String(text).length : 0,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!type || typeof type !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '操作类型参数不能为空'
                });
            }

            if (!text || typeof text !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '操作文本参数不能为空'
                });
            }

            if (type !== 'encode' && type !== 'decode') {
                return res.status(400).json({
                    success: false,
                    error: '操作类型必须是 encode(编码) 或 decode(解码)'
                });
            }

            const result = await NetworkService.base64Operation(type as 'encode' | 'decode', text);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'Base64操作完成',
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '操作失败';
            
            logger.error('Base64操作失败', {
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
     * BMI身体指数计算
     */
    public static async bmiCalculate(req: Request, res: Response) {
        try {
            const { height, weight } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到BMI计算请求', {
                ip,
                height,
                weight,
                userAgent: req.headers['user-agent']
            });

            if (!height || typeof height !== 'string' || !weight || typeof weight !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '身高和体重参数不能为空'
                });
            }

            const result = await NetworkService.bmiCalculate(height, weight);

            if (result.success) {
                res.json({
                    success: true,
                    message: 'BMI计算完成',
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'BMI计算失败';
            logger.error('BMI计算失败', {
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
     * FLAC转MP3音频转换
     */
    public static async flacToMp3(req: Request, res: Response) {
        try {
            const { url, return: returnType } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到FLAC转MP3请求', {
                ip,
                url,
                returnType,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!url || typeof url !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'URL参数不能为空'
                });
            }

            // 验证return参数
            const validReturnTypes = ['json', '302'];
            const returnValue = returnType && typeof returnType === 'string' && validReturnTypes.includes(returnType) 
                ? returnType as 'json' | '302' 
                : 'json';

            const result = await NetworkService.flacToMp3(url, returnValue);

            if (result.success) {
                // 如果请求返回类型是302，直接重定向
                if (returnValue === '302' && result.data && typeof result.data === 'string') {
                    return res.redirect(result.data);
                }

                res.json({
                    success: true,
                    message: 'FLAC转MP3转换完成',
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '转换失败';
            
            logger.error('FLAC转MP3转换失败', {
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
     * 随机驾考题目
     */
    public static async randomJiakao(req: Request, res: Response) {
        try {
            const { subject } = req.query;
            const ip = NetworkController.getClientIp(req);

            logger.info('收到随机驾考题目请求', {
                ip,
                subject,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!subject || typeof subject !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '科目参数不能为空'
                });
            }

            if (subject !== '1' && subject !== '4') {
                return res.status(400).json({
                    success: false,
                    error: '科目参数必须是 1(科目1) 或 4(科目4)'
                });
            }

            const result = await NetworkService.randomJiakao(subject as '1' | '4');

            if (result.success) {
                res.json({
                    success: true,
                    message: '随机驾考题目获取完成',
                    data: result.data
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '获取失败';
            
            logger.error('随机驾考题目获取失败', {
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