import { OpenAI } from 'openai';
import { writeFile } from 'fs/promises';
import { join, basename } from 'path';
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

// 验证文件名安全性
function validateFileName(fileName: string): string {
  // 移除路径遍历字符和危险字符
  const sanitized = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
  // 确保只使用文件名部分，移除路径
  return basename(sanitized);
}

// 验证输出格式
function validateOutputFormat(format: string): 'mp3' | 'opus' | 'aac' | 'flac' {
  const validFormats = ['mp3', 'opus', 'aac', 'flac'];
  if (validFormats.includes(format)) {
    return format as 'mp3' | 'opus' | 'aac' | 'flac';
  }
  return 'mp3'; // 默认格式
}

// 生成安全的文件名
function generateSafeFileName(customFileName?: string, outputFormat?: string): string {
  const safeOutputFormat = validateOutputFormat(outputFormat || 'mp3');
  
  if (customFileName) {
    const validatedFileName = validateFileName(customFileName);
    // 确保文件名有正确的扩展名
    if (!validatedFileName.includes('.')) {
      return `${validatedFileName}.${safeOutputFormat}`;
    }
    return validatedFileName;
  }
  
  // 使用UUID生成文件名
  return `${uuidv4()}.${safeOutputFormat}`;
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

    // 安全处理文件名
    const safeFileName = generateSafeFileName(customFileName, outputFormat);
    const filePath = join(config.paths.finish, safeFileName);

    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));

    return filePath;
  } catch (error) {
    console.error('TTS generation error:', error);
    throw new Error('生成语音时出现错误，请向站点管理员报告。');
  }
} 