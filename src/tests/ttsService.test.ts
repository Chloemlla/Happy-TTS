import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { TtsService } from '../services/ttsService';
import { config } from '../config/config';
import fs from 'fs';
import path from 'path';

jest.mock('openai');

describe('TTS Service', () => {
  let ttsService: TtsService;
  const testText = '这是一段测试文本';
  const testVoice = 'alloy';
  const testModel = 'tts-1';
  const testOutputFormat = 'mp3';
  const testSpeed = 1.0;

  beforeEach(() => {
    jest.clearAllMocks();
    ttsService = new TtsService();
  });

  it('应该成功生成语音文件', async () => {
    const result = await ttsService.generateSpeech({
      text: testText,
      voice: testVoice,
      model: testModel,
      output_format: testOutputFormat,
      speed: testSpeed
    });

    expect(result).toBeDefined();
    expect(result.fileName).toBeDefined();
    expect(fs.existsSync(path.join(config.audioDir, result.fileName))).toBe(true);
  });

  it('应该处理空文本输入', async () => {
    await expect(ttsService.generateSpeech({
      text: '',
      voice: testVoice,
      model: testModel,
      output_format: testOutputFormat,
      speed: testSpeed
    })).rejects.toThrow('文本不能为空');
  });

  it('应该处理无效的语音模型', async () => {
    await expect(ttsService.generateSpeech({
      text: testText,
      voice: testVoice,
      model: 'invalid-model',
      output_format: testOutputFormat,
      speed: testSpeed
    })).rejects.toThrow('无效的语音模型');
  });

  it('应该处理无效的输出格式', async () => {
    await expect(ttsService.generateSpeech({
      text: testText,
      voice: testVoice,
      model: testModel,
      output_format: 'invalid-format' as any,
      speed: testSpeed
    })).rejects.toThrow('无效的输出格式');
  });

  it('应该处理无效的语速', async () => {
    await expect(ttsService.generateSpeech({
      text: testText,
      voice: testVoice,
      model: testModel,
      output_format: testOutputFormat,
      speed: 3.0
    })).rejects.toThrow('无效的语速值');
  });
}); 