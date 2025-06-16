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
        this.baseUrl = config.baseUrl || 'https://tts-api.hapxs.com';
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
            const existingFile = this.findExistingFile(contentHash, output_format);

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
                response_format: output_format || config.openaiResponseFormat as OutputFormat,
                speed: speed || parseFloat(config.openaiSpeed)
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            const fileName = `${contentHash}.${output_format}`;
            const filePath = path.join(this.outputDir, fileName);

            await fs.promises.writeFile(filePath, buffer);

            return {
                fileName,
                audioUrl: `${this.baseUrl}/static/audio/${fileName}`,
                isDuplicate: false
            };
        } catch (error) {
            logger.error('生成语音失败:', error);
            throw error;
        }
    }

    private findExistingFile(contentHash: string, outputFormat: string): string | null {
        const fileName = `${contentHash}.${outputFormat}`;
        const filePath = path.join(this.outputDir, fileName);
        return fs.existsSync(filePath) ? fileName : null;
    }
} 