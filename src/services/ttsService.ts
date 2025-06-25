'use server';

import OpenAI from 'openai';
import { config } from '../config/config';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import crypto from 'crypto';

// 加载环境变量
dotenv.config();

type OutputFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

interface TtsRequest {
    text: string;
    model: string;
    voice: string;
    output_format: OutputFormat;
    speed: number;
    userId?: string;
    isAdmin?: boolean;
}

interface UserViolation {
    count: number;
    lastViolation: number;
}

export class TtsService {
    private openai: OpenAI;
    private readonly outputDir: string;
    private readonly baseUrl: string;
    private readonly userViolations: Map<string, UserViolation>;
    private readonly violationThreshold: number = 3;
    private readonly violationWindow: number = 24 * 60 * 60 * 1000; // 24小时

    constructor() {
        this.openai = new OpenAI({
            apiKey: config.openaiApiKey
        });
        this.outputDir = config.audioDir;
        this.baseUrl = config.baseUrl;
        this.userViolations = new Map();
        this.ensureOutputDir();
    }

    private ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    private generateContentHash(text: string, voice: string, model: string): string {
        return crypto.createHash('md5').update(`${text}-${voice}-${model}`).digest('hex');
    }

    // 验证文件名安全性
    private validateFileName(fileName: string): string {
        // 移除路径遍历字符和危险字符
        const sanitized = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
        // 确保只使用文件名部分，移除路径
        return path.basename(sanitized);
    }

    // 验证输出格式
    private validateOutputFormat(format: string): OutputFormat {
        const validFormats: OutputFormat[] = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'];
        if (validFormats.includes(format as OutputFormat)) {
            return format as OutputFormat;
        }
        return 'mp3'; // 默认格式
    }

    private checkUserViolation(userId: string): boolean {
        const violation = this.userViolations.get(userId);
        if (!violation) return false;

        const now = Date.now();
        if (now - violation.lastViolation > this.violationWindow) {
            this.userViolations.delete(userId);
            return false;
        }

        return violation.count >= this.violationThreshold;
    }

    private recordViolation(userId: string) {
        const now = Date.now();
        const violation = this.userViolations.get(userId) || { count: 0, lastViolation: now };
        
        if (now - violation.lastViolation > this.violationWindow) {
            violation.count = 1;
        } else {
            violation.count += 1;
        }
        
        violation.lastViolation = now;
        this.userViolations.set(userId, violation);
    }

    public async generateSpeech(request: TtsRequest) {
        try {
            const { text, model, voice, output_format, speed, userId, isAdmin } = request;

            if (!text) {
                throw new Error('文本内容不能为空');
            }

            // 检查用户是否被封禁
            if (userId && !isAdmin && this.checkUserViolation(userId)) {
                throw new Error('由于重复提交相同内容，您的账号已被临时封禁24小时');
            }

            // 生成内容哈希
            const contentHash = this.generateContentHash(text, voice, model);
            const safeOutputFormat = this.validateOutputFormat(output_format);
            const existingFile = this.findExistingFile(contentHash, safeOutputFormat);

            if (existingFile) {
                // 如果不是管理员，记录违规
                if (userId && !isAdmin) {
                    this.recordViolation(userId);
                }

                return {
                    fileName: existingFile,
                    audioUrl: `${this.baseUrl}/static/audio/${existingFile}`,
                    isDuplicate: true
                };
            }

            const response = await this.openai.audio.speech.create({
                model: model || config.openaiModel,
                voice: voice || config.openaiVoice,
                input: text,
                response_format: safeOutputFormat,
                speed: speed || parseFloat(config.openaiSpeed)
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            const fileName = `${contentHash}.${safeOutputFormat}`;
            const safeFileName = this.validateFileName(fileName);
            const filePath = path.join(this.outputDir, safeFileName);

            await fs.promises.writeFile(filePath, buffer);

            return {
                fileName: safeFileName,
                audioUrl: `${this.baseUrl}/static/audio/${safeFileName}`,
                isDuplicate: false
            };
        } catch (error) {
            logger.error('生成语音失败:', error);
            throw error;
        }
    }

    private findExistingFile(contentHash: string, outputFormat: string): string | null {
        // 验证输入参数
        const safeOutputFormat = this.validateOutputFormat(outputFormat);
        // 验证contentHash格式（MD5应该是32位十六进制）
        const safeContentHash = /^[a-f0-9]{32}$/i.test(contentHash) ? contentHash : '';
        
        if (!safeContentHash) {
            return null;
        }
        
        const fileName = `${safeContentHash}.${safeOutputFormat}`;
        const safeFileName = this.validateFileName(fileName);
        const filePath = path.join(this.outputDir, safeFileName);
        return fs.existsSync(filePath) ? safeFileName : null;
    }
} 