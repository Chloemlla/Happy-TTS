import { OpenAI } from 'openai';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

export interface TTSOptions {
  text: string;
  model: 'tts-1' | 'tts-1-hd';
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  outputFormat: 'mp3' | 'opus' | 'aac' | 'flac';
  speed?: number;
  customFileName?: string;
}

export async function generateSpeech(options: TTSOptions): Promise<string> {
  const {
    text,
    model,
    voice,
    outputFormat,
    speed = 1.0,
    customFileName,
  } = options;

  try {
    const response = await openai.audio.speech.create({
      model,
      voice,
      input: text,
      response_format: outputFormat,
      speed,
    });

    const fileName = customFileName || `${uuidv4()}.${outputFormat}`;
    const filePath = join(config.paths.finish, fileName);

    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));

    return filePath;
  } catch (error) {
    console.error('TTS generation error:', error);
    throw new Error('生成语音时出现错误，请向站点管理员报告。');
  }
} 