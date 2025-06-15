import { Request, Response } from 'express';
import { TtsService } from '../services/ttsService';
import { StorageManager } from '../utils/storage';
import logger from '../utils/logger';

export class TtsController {
    private static ttsService = new TtsService();

    private static getClientIp(req: Request): string {
        // 尝试从不同位置获取 IP 地址
        const ip = req.ip || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  'unknown';
        
        // 如果是 IPv6 格式的本地地址，转换为 IPv4 格式
        return ip.replace(/^::ffff:/, '');
    }

    public static async generateSpeech(req: Request, res: Response) {
        try {
            const { text, model, voice, output_format, speed } = req.body;
            const ip = TtsController.getClientIp(req);

            if (!text) {
                return res.status(400).json({
                    error: '文本内容不能为空'
                });
            }

            // 检查是否有重复内容
            const isDuplicate = await StorageManager.checkDuplicate(ip, text);
            if (isDuplicate) {
                return res.status(400).json({
                    error: '您在过去24小时内已经生成过相同的内容'
                });
            }

            const result = await TtsController.ttsService.generateSpeech({
                text,
                model,
                voice,
                output_format,
                speed
            });

            // 记录生成历史
            await StorageManager.addRecord(ip, text, result.fileName);

            res.json(result);
        } catch (error) {
            logger.error('生成语音失败:', error);
            res.status(500).json({ error: '生成语音失败' });
        }
    }

    public static async getRecentGenerations(req: Request, res: Response) {
        try {
            const ip = TtsController.getClientIp(req);
            const records = await StorageManager.getRecentRecords(ip);
            res.json(records);
        } catch (error) {
            logger.error('获取生成历史失败:', error);
            res.status(500).json({ error: '获取生成历史失败' });
        }
    }
} 