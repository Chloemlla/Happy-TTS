import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { ContentFilterService } from '../services/contentFilterService';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ContentFilterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('detectProhibitedContent', () => {
    it('应该检测到违禁内容', async () => {
      // Mock API响应 - 检测到违禁内容
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          text: '测试违禁词',
          is_prohibited: true,
          confidence: 0.95,
          status: 'success',
          max_variant: '测试违禁词',
          triggered_variants: [
            { variant: '测试违禁词', probability: 0.95 }
          ]
        }
      });

      const result = await ContentFilterService.detectProhibitedContent('测试违禁词');

      expect(result.isProhibited).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.maxVariant).toBe('测试违禁词');
      expect(result.triggeredVariants).toHaveLength(1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/detect',
        expect.objectContaining({
          params: { text: '测试违禁词' },
          timeout: 5000
        })
      );
    });

    it('应该通过正常内容', async () => {
      // Mock API响应 - 正常内容
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          text: '你好世界',
          is_prohibited: false,
          confidence: 0.1,
          status: 'success'
        }
      });

      const result = await ContentFilterService.detectProhibitedContent('你好世界');

      expect(result.isProhibited).toBe(false);
      expect(result.confidence).toBe(0.1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://v2.xxapi.cn/api/detect',
        expect.objectContaining({
          params: { text: '你好世界' }
        })
      );
    });

    it('应该处理空文本', async () => {
      const result = await ContentFilterService.detectProhibitedContent('');

      expect(result.isProhibited).toBe(false);
      expect(result.confidence).toBe(0);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('应该处理API调用失败', async () => {
      // Mock API调用失败
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await ContentFilterService.detectProhibitedContent('测试文本');

      expect(result.isProhibited).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.error).toBe('内容检测服务暂时不可用，请稍后重试');
    });

    it('应该处理超时', async () => {
      // Mock超时错误
      mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 5000ms exceeded'));

      const result = await ContentFilterService.detectProhibitedContent('测试文本');

      expect(result.isProhibited).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.error).toBe('内容检测服务暂时不可用，请稍后重试');
    });
  });

  describe('batchDetect', () => {
    it('应该批量检测多个文本', async () => {
      // Mock多个API响应
      mockedAxios.get
        .mockResolvedValueOnce({
          data: { text: '正常文本1', is_prohibited: false, confidence: 0.1, status: 'success' }
        })
        .mockResolvedValueOnce({
          data: { text: '违禁文本', is_prohibited: true, confidence: 0.9, status: 'success' }
        })
        .mockResolvedValueOnce({
          data: { text: '正常文本2', is_prohibited: false, confidence: 0.2, status: 'success' }
        });

      const texts = ['正常文本1', '违禁文本', '正常文本2'];
      const results = await ContentFilterService.batchDetect(texts);

      expect(results).toHaveLength(3);
      expect(results[0].isProhibited).toBe(false);
      expect(results[1].isProhibited).toBe(true);
      expect(results[2].isProhibited).toBe(false);
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('shouldSkipDetection', () => {
    it('应该在测试环境下跳过检测', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      expect(ContentFilterService.shouldSkipDetection()).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('应该在设置了SKIP_CONTENT_FILTER时跳过检测', () => {
      const originalEnv = process.env.SKIP_CONTENT_FILTER;
      process.env.SKIP_CONTENT_FILTER = 'true';

      expect(ContentFilterService.shouldSkipDetection()).toBe(true);

      process.env.SKIP_CONTENT_FILTER = originalEnv;
    });

    it('应该在正常环境下进行检测', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(ContentFilterService.shouldSkipDetection()).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });
  });
}); 