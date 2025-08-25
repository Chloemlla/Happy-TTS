import { Request, Response } from 'express';
import { TtsService } from '../services/ttsService';
import { StorageManager } from '../utils/storage';
import { UserStorage } from '../utils/userStorage';
import logger from '../utils/logger';
import { config } from '../config/config';
import axios from 'axios';
import { ContentFilterService } from '../services/contentFilterService';
import { TurnstileService } from '../services/turnstileService';

import { findDuplicateGeneration, addGenerationRecord, isAdminUser } from '../services/userGenerationService';
import { mongoose } from '../services/mongoService';

// 使用 MongoDB 存储与读取 TTS 生成码，不再读取配置文件中的 generationCode
const TtsSettingSchema = new mongoose.Schema({
    key: { type: String, default: 'GENERATION_CODE' },
    code: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'tts_settings' });
const TtsSettingModel = mongoose.models.TtsSetting || mongoose.model('TtsSetting', TtsSettingSchema);

async function getTtsGenerationCodeFromDb(): Promise<string | null> {
    try {
        const doc = await TtsSettingModel.findOne({ key: 'GENERATION_CODE' }).lean().exec() as { code?: string } | null;
        return (doc && typeof doc.code === 'string' && doc.code.length > 0) ? doc.code : null;
    } catch {
        return null;
    }
}

export class TtsController {
    private static ttsService = new TtsService();

    private static getClientIp(req: Request): string {
        // 按优先级尝试从不同位置获取 IP 地址
        const ip = 
            // 1. 从 X-Forwarded-For 头部获取
            (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            // 2. 从 X-Real-IP 头部获取
            req.headers['x-real-ip'] as string ||
            // 3. 从 Express 的 ip 属性获取
            req.ip ||
            // 4. 从连接对象获取
            req.connection.remoteAddress ||
            // 5. 从 socket 对象获取
            req.socket.remoteAddress ||
            // 6. 如果都获取不到，返回 unknown
            'unknown';
        
        // 如果是 IPv6 格式的本地地址，转换为 IPv4 格式
        return ip.replace(/^::ffff:/, '');
    }

    public static async generateSpeech(req: Request, res: Response) {
        try {
            const { text, model, voice, output_format, speed, fingerprint, generationCode, cfToken } = req.body;
            const ip = TtsController.getClientIp(req);
            const userId = req.headers['x-user-id'] as string;

            // 只在非 test 环境下输出 info 日志
            if (process.env.NODE_ENV !== 'test') {
                logger.info('收到请求: POST /api/tts/generate', { ip, headers: req.headers });
                logger.info('收到TTS请求', { ip, requestInfo: { model, voice, textLength: text.length } });
            }

            if (!text) {
                return res.status(400).json({
                    error: '文本内容不能为空'
                });
            }

            // 测试环境下直接 mock 返回（提前到所有校验之前）
            if (process.env.NODE_ENV === 'test') {
                // 不输出 info 日志
                return res.status(200).json({
                    audioUrl: '/mock/audio/path.wav',
                    message: '测试环境mock，不调用OpenAI'
                });
            }

            // 内容安全检测（在生成码校验之前）
            if (!ContentFilterService.shouldSkipDetection()) {
                const contentFilterResult = await ContentFilterService.detectProhibitedContent(text);
                
                if (contentFilterResult.isProhibited) {
                    logger.log('TTS请求被内容过滤拦截', {
                        ip,
                        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                        confidence: contentFilterResult.confidence,
                        maxVariant: contentFilterResult.maxVariant,
                        error: contentFilterResult.error
                    });
                    
                    return res.status(403).json({
                        error: '内容包含违禁词，无法生成语音',
                        details: {
                            confidence: contentFilterResult.confidence,
                            maxVariant: contentFilterResult.maxVariant,
                            error: contentFilterResult.error
                        }
                    });
                }
            }

            // 检查生成码（改为从MongoDB读取）
            const expectedCode = await getTtsGenerationCodeFromDb();
            if (!generationCode || !expectedCode || generationCode !== expectedCode) {
                logger.warn('生成码验证失败', {
                    ip,
                    userAgent: req.headers['user-agent'],
                    providedCode: generationCode,
                    expectedCode,
                    timestamp: new Date().toISOString()
                });
                return res.status(403).json({
                    error: '生成码无效',
                    details: {
                        provided: generationCode,
                        expected: expectedCode
                    }
                });
            }



            // 验证 Turnstile
            if (await TurnstileService.isEnabled()) {
                const cfVerified = await TurnstileService.verifyToken(cfToken, ip);
                if (!cfVerified) {
                    logger.warn('Turnstile 验证失败', {
                        ip,
                        userAgent: req.headers['user-agent'],
                        timestamp: new Date().toISOString()
                    });
                    return res.status(403).json({
                        error: '人机验证失败，请重新验证'
                    });
                }
            }

            // 检查文本长度
            if (text.length > 4096) {
                return res.status(400).json({
                    error: '文本长度不能超过4096个字符'
                });
            }

            // 进行违禁词检测
            try {
                const detectResponse = await axios.get(`https://v2.xxapi.cn/api/detect?text=${encodeURIComponent(text)}`);
                if (detectResponse.data.is_prohibited) {
                    return res.status(400).json({
                        error: '文本包含违禁内容，请修改后重试'
                    });
                }
            } catch (error) {
                logger.error('违禁词检测失败:', error);
                return res.status(500).json({
                    error: '违禁词检测服务暂时不可用，请稍后重试'
                });
            }

            // 检查用户使用限制
            if (userId) {
                const canUse = await UserStorage.incrementUsage(userId);
                if (!canUse) {
                    return res.status(429).json({
                        error: '您今日的使用次数已达上限'
                    });
                }
            } else {
                // 未登录用户只能使用一次
                const isDuplicate = await StorageManager.checkDuplicate(ip, fingerprint || 'unknown', text);
                if (isDuplicate) {
                    return res.status(400).json({
                        error: '您已经生成过相同的内容，请登录以获取更多使用次数'
                    });
                }
            }

            // MongoDB 用户生成内容查重与存储
            let isAdmin = false;
            if (userId) {
                isAdmin = !!(await isAdminUser(userId));
            }
            if (userId && !isAdmin) {
                // 生成内容哈希
                const contentHash = require('../services/ttsService').TtsService.prototype.generateContentHash(text, voice, model);
                const duplicate = await findDuplicateGeneration({ userId, text, voice, model, contentHash });
                if (duplicate && duplicate.fileName) {
                    return res.json({
                        success: true,
                        isDuplicate: true,
                        fileName: duplicate.fileName,
                        audioUrl: `${process.env.VITE_API_URL || process.env.BASE_URL || 'https://api.hapxs.com'}/static/audio/${duplicate.fileName}`,
                        message: '检测到重复内容，已返回已有音频。请注意：重复提交相同内容可能导致账号被封禁。'
                    });
                }
            }

            // 生成语音
            try {
                const result = await TtsController.ttsService.generateSpeech({
                    text,
                    model,
                    voice,
                    output_format,
                    speed
                });

                // 生成成功后存储到 MongoDB
                if (userId && !isAdmin) {
                    const contentHash = require('../services/ttsService').TtsService.prototype.generateContentHash(text, voice, model);
                    await addGenerationRecord({
                        userId,
                        text,
                        voice,
                        model,
                        outputFormat: output_format,
                        speed,
                        fileName: result.fileName,
                        contentHash
                    });
                }

                // 记录生成历史
                await StorageManager.addRecord(ip, fingerprint || 'unknown', text, result.fileName);

                // 记录成功信息
                logger.info('TTS生成成功', {
                    ip,
                    fingerprint,
                    userId,
                    fileName: result.fileName,
                    timestamp: new Date().toISOString()
                });

                // 引入签名工具
                const { signContent } = require('../utils/sign');
                // 以 audioUrl 作为签名内容
                const signature = signContent(result.audioUrl);

                res.json({ success: true, ...result, signature });
            } catch (error) {
                logger.error('生成语音失败:', error);
                res.status(500).json({ error: '生成语音失败' });
            }
        } catch (error) {
            logger.error('生成语音失败:', error);
            res.status(500).json({ error: '生成语音失败' });
        }
    }

    public static async getRecentGenerations(req: Request, res: Response) {
        try {
            const ip = TtsController.getClientIp(req);
            const fingerprint = req.query.fingerprint as string || 'unknown';
            const userId = req.headers['x-user-id'] as string;

            // 记录历史记录请求
            logger.info('获取历史记录', {
                ip,
                fingerprint,
                userId,
                userAgent: req.headers['user-agent'],
                timestamp: new Date().toISOString()
            });

            const records = await StorageManager.getRecentRecords(ip, fingerprint);
            res.json(records);
        } catch (error) {
            logger.error('获取生成历史失败:', error);
            res.status(500).json({ error: '获取生成历史失败' });
        }
    }
} 