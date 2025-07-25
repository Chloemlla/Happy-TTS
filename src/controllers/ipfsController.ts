import { Request, Response } from 'express';
import { IPFSService } from '../services/ipfsService';
import logger from '../utils/logger';

export class IPFSController {
    /**
     * 上传图片到IPFS
     */
    public static async uploadImage(req: Request, res: Response) {
        try {
            const ip = IPFSController.getClientIp(req);
            
            logger.info('收到IPFS上传请求', {
                ip,
                userAgent: req.headers['user-agent'],
                timestamp: new Date().toISOString()
            });

            // 检查是否有文件上传
            if (!req.file) {
                return res.status(400).json({
                    error: '请选择要上传的图片文件'
                });
            }

            const { buffer, originalname, mimetype } = req.file;

            // 使用IPFS服务上传文件
            const shortLinkFlag = req.body && req.body.source === 'imgupload';
            const userId = (req as any).user?.id || 'admin';
            const username = (req as any).user?.username || 'admin';
            const result = await IPFSService.uploadFile(buffer, originalname, mimetype, { shortLink: !!shortLinkFlag, userId, username });

            logger.info('IPFS上传成功', {
                ip,
                filename: originalname,
                fileSize: buffer.length,
                cid: result.cid,
                web2url: result.web2url
            });

            // 返回成功响应
            res.json({
                success: true,
                message: '图片上传成功',
                data: {
                    cid: result.cid,
                    url: result.url,
                    web2url: result.web2url,
                    fileSize: result.fileSize,
                    filename: originalname,
                    shortUrl: result.shortUrl // 新增短链字段
                }
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '上传失败';
            
            logger.error('IPFS上传失败', {
                ip: IPFSController.getClientIp(req),
                error: errorMessage,
                timestamp: new Date().toISOString()
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