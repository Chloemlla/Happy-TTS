import { describe, expect, it, jest, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { config } from '../config/config';

describe('性能测试', () => {
  // 使用测试环境的配置
  const testConfig = {
    validToken: 'test-token',
    testText: '这是一段测试文本',
    testVoice: config.openaiVoice,
    testModel: config.openaiModel
  };
  
  // 辅助函数：创建延迟
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // 辅助函数：生成随机文本
  const generateRandomText = (length: number) => {
    const characters = '你好世界这是一段测试文本用于性能测试';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  // 辅助函数：并发请求
  const makeConcurrentRequests = async (endpoint: string, requestCount: number, requestBody: any) => {
    const requests = Array(requestCount).fill(null).map(() =>
      request(app)
        .post(endpoint)
        .send(requestBody)
    );
    return Promise.all(requests);
  };

  describe('TTS服务负载测试', () => {
    it('应该能处理大量连续的TTS请求', async () => {
      const requestCount = 50;
      const results = [];
      
      for (let i = 0; i < requestCount; i++) {
        const res = await request(app)
          .post('/api/tts/generate')
          .send({
            text: generateRandomText(100),
            voice: testConfig.testVoice,
            model: testConfig.testModel
          });
        
        results.push(res.status);
        await delay(100); // 添加小延迟避免请求过于密集
      }

      const successCount = results.filter(status => status === 200).length;
      expect(successCount).toBeGreaterThan(requestCount * 0.9); // 90%成功率
    }, 30000);

    it('应该能处理并发TTS请求', async () => {
      const concurrentRequests = 10;
      const responses = await makeConcurrentRequests(
        '/api/tts/generate',
        concurrentRequests,
        {
          text: testConfig.testText,
          voice: testConfig.testVoice,
          model: testConfig.testModel
        }
      );

      const successCount = responses.filter(res => res.status === 200).length;
      expect(successCount).toBeGreaterThan(concurrentRequests * 0.8); // 80%成功率
    }, 20000);
  });

  describe('LibreChat服务负载测试', () => {
    it('应该能处理大量连续的聊天请求', async () => {
      const requestCount = 100;
      const results = [];

      for (let i = 0; i < requestCount; i++) {
        const res = await request(app)
          .post('/api/libre-chat/send')
          .send({
            token: testConfig.validToken,
            message: generateRandomText(50)
          });

        results.push(res.status);
        await delay(50);
      }

      const successCount = results.filter(status => status === 200).length;
      expect(successCount).toBeGreaterThan(requestCount * 0.9);
    }, 30000);

    it('应该能处理并发聊天请求', async () => {
      const concurrentRequests = 20;
      const responses = await makeConcurrentRequests(
        '/api/libre-chat/send',
        concurrentRequests,
        {
          token: testConfig.validToken,
          message: testConfig.testText
        }
      );

      const successCount = responses.filter(res => res.status === 200).length;
      expect(successCount).toBeGreaterThan(concurrentRequests * 0.8);
    }, 20000);
  });

  describe('认证服务负载测试', () => {
    it('应该能处理大量连续的认证请求', async () => {
      const requestCount = 100;
      const results = [];

      for (let i = 0; i < requestCount; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            username: `test${i}@example.com`,
            password: 'testpassword'
          });

        results.push(res.status);
        await delay(50);
      }

      // 即使登录失败也应该正常响应
      const validResponses = results.filter(status => status === 401 || status === 200).length;
      expect(validResponses).toBe(requestCount);
    }, 30000);

    it('应该能处理并发认证请求', async () => {
      const concurrentRequests = 20;
      const responses = await makeConcurrentRequests(
        '/api/auth/login',
        concurrentRequests,
        {
          username: 'test@example.com',
          password: 'testpassword'
        }
      );

      // 检查所有请求都得到了响应
      expect(responses.length).toBe(concurrentRequests);
      // 所有响应都应该是401（未授权）或200（成功）
      expect(responses.every(res => res.status === 401 || res.status === 200)).toBe(true);
    }, 20000);
  });

  describe('速率限制测试', () => {
    it('应该正确实施速率限制', async () => {
      const requestCount = 50;
      const results = [];

      // 快速发送大量请求
      for (let i = 0; i < requestCount; i++) {
        const res = await request(app)
          .post('/api/tts/generate')
          .send({
            text: testConfig.testText,
            voice: testConfig.testVoice,
            model: testConfig.testModel
          });

        results.push(res.status);
      }

      // 应该有一些请求被限制
      const limitedRequests = results.filter(status => status === 429).length;
      expect(limitedRequests).toBeGreaterThan(0);
    }, 20000);

    it('应该在限制后恢复服务', async () => {
      // 等待速率限制重置
      await delay(60000);

      const res = await request(app)
        .post('/api/tts/generate')
        .send({
          text: testConfig.testText,
          voice: testConfig.testVoice,
          model: testConfig.testModel
        });

      expect(res.status).toBe(200);
    }, 70000);
  });

  describe('内存使用测试', () => {
    it('应该在高负载下保持稳定的内存使用', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const requestCount = 100;

      // 发送大量请求
      await Promise.all([
        makeConcurrentRequests('/api/tts/generate', requestCount / 2, {
          text: testConfig.testText,
          voice: testConfig.testVoice,
          model: testConfig.testModel
        }),
        makeConcurrentRequests('/api/libre-chat/send', requestCount / 2, {
          token: testConfig.validToken,
          message: testConfig.testText
        })
      ]);

      // 等待垃圾回收
      global.gc && global.gc();
      await delay(1000);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // 内存增长不应超过50MB
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 60000);
  });
}); 