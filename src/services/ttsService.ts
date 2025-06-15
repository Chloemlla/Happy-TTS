import OpenAI from 'openai';
import { config } from '../config/config';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

// 从环境变量读取配置
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL
});

type OutputFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export const generateSpeech = async (
  text: string,
  model: string = 'tts-1-hd',
  voice: string = 'nova',
  outputFormat: OutputFormat = 'mp3',
  speed: number = 1.0
) => {
  try {
    // 验证必要的环境变量
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY 环境变量未设置');
    }
    if (!process.env.OPENAI_BASE_URL) {
      throw new Error('OPENAI_BASE_URL 环境变量未设置');
    }

    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: outputFormat,
      speed
    });

    const fileName = `${Date.now()}.${outputFormat}`;
    const filePath = path.join('finish', fileName);
    
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return fileName;
  } catch (error) {
    logger.error('TTS generation error:', error);
    throw error;
  }
}; 