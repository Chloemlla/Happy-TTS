import { Request, Response } from 'express';
import { MediaService } from '../services/mediaService';
import logger from '../utils/logger';

export class MediaController {
    /**
     * 网抑云音乐解析
     */
    public static async music163(req: Request, res: Response) {
        try {
            const { id } = req.query;
            const ip = MediaController.getClientIp(req);

            logger.info('收到网抑云音乐解析请求', {
                ip,
                id,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!id || typeof id !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '歌曲ID参数不能为空'
                });
            }

            if (!/^\d+$/.test(id)) {
                return res.status(400).json({
                    success: false,
                    error: '歌曲ID必须是数字'
                });
            }

            const result = await MediaService.music163(id);

            if (result.success) {
                res.json({
                    success: true,
                    message: '网抑云音乐解析完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '解析失败';
            
            logger.error('网抑云音乐解析失败', {
                ip: MediaController.getClientIp(req),
                error: errorMessage
            });

            res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    }

    /**
     * 皮皮虾视频解析
     */
    public static async pipixia(req: Request, res: Response) {
        try {
            const { url } = req.query;
            const ip = MediaController.getClientIp(req);

            logger.info('收到皮皮虾视频解析请求', {
                ip,
                url,
                userAgent: req.headers['user-agent']
            });

            // 参数验证
            if (!url || typeof url !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: '视频链接参数不能为空'
                });
            }

            if (!url.includes('pipix.com') && !url.includes('douyin.com')) {
                return res.status(400).json({
                    success: false,
                    error: '请输入有效的皮皮虾或抖音视频链接'
                });
            }

            const result = await MediaService.pipixia(url);

            if (result.success) {
                res.json({
                    success: true,
                    message: '皮皮虾视频解析完成',
                    data: result.data
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '解析失败';
            
            logger.error('皮皮虾视频解析失败', {
                ip: MediaController.getClientIp(req),
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