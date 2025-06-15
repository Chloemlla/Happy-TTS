'use server';

import OpenAI from 'openai';
import { config } from '../config/config';
import logger from '../utils/logger';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

type OutputFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

interface TtsRequest {
    text: string;
    model: string;
    voice: string;
    output_format: OutputFormat;
    speed: number;
}

export class TtsService {
    private openai: OpenAI;
    private readonly outputDir: string;

    constructor() {
        this.openai = new OpenAI({
            apiKey: config.openaiApiKey
        });
        this.outputDir = config.audioDir;
        this.ensureOutputDir();
    }

    private ensureOutputDir() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    public async generateSpeech(request: TtsRequest) {
        try {
            const { text, model, voice, output_format, speed } = request;

            if (!text) {
                throw new Error('文本内容不能为空');
            }

            const response = await this.openai.audio.speech.create({
                model: model || config.openaiModel,
                voice: voice || config.openaiVoice,
                input: text,
                response_format: output_format || config.openaiResponseFormat as OutputFormat,
                speed: speed || parseFloat(config.openaiSpeed)
            });

            const buffer = Buffer.from(await response.arrayBuffer());
            const fileName = `${Date.now()}.${output_format}`;
            const filePath = path.join(this.outputDir, fileName);

            await fs.promises.writeFile(filePath, buffer);

            return {
                fileName,
                audioUrl: `/static/audio/${fileName}`
            };
        } catch (error) {
            logger.error('生成语音失败:', error);
            throw error;
        }
    }
} 