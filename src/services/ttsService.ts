'use server';

import OpenAI from 'openai';
import { config } from '../config/config';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 创建 OpenAI 客户端实例
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