import { describe, expect, it, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { config } from '../config/config';
import { UserStorage } from '../utils/userStorage';

// 保存 server 实例以便在测试结束后关闭
let server: any;

describe('性能测试', () => {
  // 使用测试环境的配置
  const testConfig = {
    validToken: '1', // 管理员token
    testText: '这是一段测试文本，用于性能压力测试',
    testVoice: config.openaiVoice,
    testModel: config.openaiModel,
    adminUsername: 'admin',
    adminPassword: 'admin123'
  };
  
  // 辅助函数：创建延迟
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // 辅助函数：生成随机文本
  const generateRandomText = (length: number) => {
    const characters = '你好世界这是一段测试文本用于性能测试ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  // 辅助函数：并发请求
  const makeConcurrentRequests = async (endpoint: string, requestCount: number, requestBody: any, headers: any = {}) => {
    const requests = Array(requestCount).fill(null).map(() =>
      request(app)
        .post(endpoint)
        .set(headers)
        .send(requestBody)
    );
    return Promise.all(requests);
  };

  // 辅助函数：测量响应时间
  const measureResponseTime = async (endpoint: string, requestBody: any, headers: any = {}) => {
    const start = Date.now();
    const response = await request(app)
      .post(endpoint)
      .set(headers)
      .send(requestBody);
    const end = Date.now();
    return { response, duration: end - start };
  };

  // 辅助函数：批量测量响应时间
  const batchMeasureResponseTime = async (endpoint: string, requestCount: number, requestBody: any, headers: any = {}) => {
    const measurements = [];
    for (let i = 0; i < requestCount; i++) {
      const measurement = await measureResponseTime(endpoint, requestBody, headers);
      measurements.push(measurement);
      await delay(10); // 小延迟避免过于密集
    }
    return measurements;
  };

  // 辅助函数：计算统计信息
  const calculateStats = (durations: number[]) => {
    const sorted = durations.sort((a, b) => a - b);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    
    return { avg, median, p95, p99, min, max, count: durations.length };
  };

  beforeAll(async () => {
    // 确保测试环境准备就绪
    console.log('开始性能压力测试...');
    
    // 启动服务器并保存实例
    const PORT = Number(config.port) || 3001;
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`测试服务器运行在 http://0.0.0.0:${PORT}`);
    });
  });

  afterAll(async () => {
    console.log('性能压力测试完成');
    
    // 关闭服务器
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err: any) => {
          if (err) {
            console.error('关闭服务器时出错:', err);
            reject(err);
          } else {
            console.log('测试服务器已关闭');
            resolve();
          }
        });
      });
    }
  });

  beforeEach(async () => {
    // 每个测试前的清理工作
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // 每个测试后的清理工作
    await delay(1000); // 给系统一些恢复时间
  });

  describe('TTS服务压力测试', () => {
    describe('连续请求压力测试', () => {
      it('应该能处理1000次连续TTS请求', async () => {
        const requestCount = 1000;
      const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续TTS请求测试...`);
      
      for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
        const res = await request(app)
          .post('/api/tts/generate')
          .send({
              text: generateRandomText(50 + (i % 100)), // 变长文本
            voice: testConfig.testVoice,
            model: testConfig.testModel
          });
        
          const duration = Date.now() - start;
        results.push(res.status);
          durations.push(duration);
          
          if (i % 100 === 0) {
            console.log(`完成 ${i}/${requestCount} 请求`);
          }
          
          await delay(10); // 小延迟
      }

      const successCount = results.filter(status => status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('TTS连续请求统计:', stats);
        console.log(`成功率: ${(successCount / requestCount * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(requestCount * 0.95); // 95%成功率
        expect(stats.avg).toBeLessThan(5000); // 平均响应时间小于5秒
        expect(stats.p95).toBeLessThan(10000); // 95%请求响应时间小于10秒
      }, 300000); // 5分钟超时

      it('应该能处理不同长度的文本', async () => {
        const textLengths = [10, 50, 100, 200, 500, 1000, 2000, 4000];
        const results = [];
        
        for (const length of textLengths) {
          const text = generateRandomText(length);
          const start = Date.now();
          
          const res = await request(app)
            .post('/api/tts/generate')
            .send({
              text,
              voice: testConfig.testVoice,
              model: testConfig.testModel
            });
          
          const duration = Date.now() - start;
          results.push({ length, status: res.status, duration });
          
          await delay(100);
        }
        
        const successCount = results.filter(r => r.status === 200).length;
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        
        console.log('不同长度文本测试结果:', results);
        console.log(`平均响应时间: ${avgDuration}ms`);
        
        expect(successCount).toBeGreaterThan(textLengths.length * 0.8); // 80%成功率
        expect(avgDuration).toBeLessThan(8000); // 平均响应时间小于8秒
      }, 120000);

      it('应该能处理不同语音模型', async () => {
        const voices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
        const results = [];
        
        for (const voice of voices) {
          const start = Date.now();
          
          const res = await request(app)
            .post('/api/tts/generate')
            .send({
              text: testConfig.testText,
              voice,
              model: testConfig.testModel
            });
          
          const duration = Date.now() - start;
          results.push({ voice, status: res.status, duration });
          
          await delay(100);
        }
        
        const successCount = results.filter(r => r.status === 200).length;
        console.log('不同语音模型测试结果:', results);
        
        expect(successCount).toBeGreaterThan(voices.length * 0.8); // 80%成功率
      }, 60000);
    });

    describe('并发请求压力测试', () => {
      it('应该能处理100个并发TTS请求', async () => {
        const concurrentRequests = 100;
        console.log(`开始${concurrentRequests}个并发TTS请求测试...`);
        
        const start = Date.now();
      const responses = await makeConcurrentRequests(
        '/api/tts/generate',
        concurrentRequests,
        {
          text: testConfig.testText,
          voice: testConfig.testVoice,
          model: testConfig.testModel
        }
      );
        const totalDuration = Date.now() - start;

      const successCount = responses.filter(res => res.status === 200).length;
        const avgResponseTime = totalDuration / concurrentRequests;
        
        console.log(`并发测试完成，总耗时: ${totalDuration}ms`);
        console.log(`平均响应时间: ${avgResponseTime}ms`);
        console.log(`成功率: ${(successCount / concurrentRequests * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(concurrentRequests * 0.9); // 90%成功率
        expect(avgResponseTime).toBeLessThan(10000); // 平均响应时间小于10秒
      }, 120000);

      it('应该能处理500个并发TTS请求', async () => {
        const concurrentRequests = 500;
        console.log(`开始${concurrentRequests}个并发TTS请求测试...`);
        
        const start = Date.now();
        const responses = await makeConcurrentRequests(
          '/api/tts/generate',
          concurrentRequests,
          {
            text: testConfig.testText,
            voice: testConfig.testVoice,
            model: testConfig.testModel
          }
        );
        const totalDuration = Date.now() - start;

        const successCount = responses.filter(res => res.status === 200).length;
        const avgResponseTime = totalDuration / concurrentRequests;
        
        console.log(`高并发测试完成，总耗时: ${totalDuration}ms`);
        console.log(`平均响应时间: ${avgResponseTime}ms`);
        console.log(`成功率: ${(successCount / concurrentRequests * 100).toFixed(2)}%`);
        
      expect(successCount).toBeGreaterThan(concurrentRequests * 0.8); // 80%成功率
        expect(avgResponseTime).toBeLessThan(15000); // 平均响应时间小于15秒
      }, 300000);

      it('应该能处理混合负载并发请求', async () => {
        const concurrentRequests = 200;
        const mixedRequests = [];
        
        // 创建混合请求：不同长度文本、不同语音
        for (let i = 0; i < concurrentRequests; i++) {
          const textLength = 50 + (i % 200);
          const voice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'][i % 6];
          
          mixedRequests.push({
            text: generateRandomText(textLength),
            voice,
            model: testConfig.testModel
          });
        }
        
        console.log(`开始${concurrentRequests}个混合负载并发TTS请求测试...`);
        
        const start = Date.now();
        const requests = mixedRequests.map(req =>
          request(app)
            .post('/api/tts/generate')
            .send(req)
        );
        
        const responses = await Promise.all(requests);
        const totalDuration = Date.now() - start;

        const successCount = responses.filter(res => res.status === 200).length;
        const avgResponseTime = totalDuration / concurrentRequests;
        
        console.log(`混合负载测试完成，总耗时: ${totalDuration}ms`);
        console.log(`平均响应时间: ${avgResponseTime}ms`);
        console.log(`成功率: ${(successCount / concurrentRequests * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(concurrentRequests * 0.85); // 85%成功率
        expect(avgResponseTime).toBeLessThan(12000); // 平均响应时间小于12秒
      }, 240000);
    });

    describe('响应时间压力测试', () => {
      it('应该测量TTS服务的响应时间分布', async () => {
        const requestCount = 500;
        console.log(`开始${requestCount}次TTS响应时间测量...`);
        
        const measurements = await batchMeasureResponseTime(
          '/api/tts/generate',
          requestCount,
          {
            text: testConfig.testText,
            voice: testConfig.testVoice,
            model: testConfig.testModel
          }
        );
        
        const durations = measurements.map(m => m.duration);
        const stats = calculateStats(durations);
        
        console.log('TTS响应时间统计:', stats);
        
        expect(stats.avg).toBeLessThan(5000); // 平均响应时间小于5秒
        expect(stats.p95).toBeLessThan(10000); // 95%请求响应时间小于10秒
        expect(stats.p99).toBeLessThan(15000); // 99%请求响应时间小于15秒
        expect(stats.max).toBeLessThan(30000); // 最大响应时间小于30秒
      }, 300000);

      it('应该测试TTS服务的响应时间稳定性', async () => {
        const batchSize = 50;
        const batches = 10;
        const allStats = [];
        
        for (let batch = 0; batch < batches; batch++) {
          console.log(`测试批次 ${batch + 1}/${batches}`);
          
          const measurements = await batchMeasureResponseTime(
            '/api/tts/generate',
            batchSize,
            {
              text: testConfig.testText,
              voice: testConfig.testVoice,
              model: testConfig.testModel
            }
          );
          
          const durations = measurements.map(m => m.duration);
          const stats = calculateStats(durations);
          allStats.push(stats);
          
          await delay(2000); // 批次间延迟
        }
        
        const avgStats = {
          avg: allStats.reduce((sum, s) => sum + s.avg, 0) / allStats.length,
          p95: allStats.reduce((sum, s) => sum + s.p95, 0) / allStats.length,
          p99: allStats.reduce((sum, s) => sum + s.p99, 0) / allStats.length
        };
        
        console.log('响应时间稳定性测试结果:', avgStats);
        
        expect(avgStats.avg).toBeLessThan(5000);
        expect(avgStats.p95).toBeLessThan(10000);
        expect(avgStats.p99).toBeLessThan(15000);
      }, 600000);
    });
  });

  describe('LibreChat服务压力测试', () => {
    describe('连续请求压力测试', () => {
      it('应该能处理500次连续聊天请求', async () => {
        const requestCount = 500;
      const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续LibreChat请求测试...`);

      for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
        const res = await request(app)
          .post('/api/libre-chat/send')
          .send({
            token: testConfig.validToken,
              message: generateRandomText(30 + (i % 50))
          });

          const duration = Date.now() - start;
        results.push(res.status);
          durations.push(duration);
          
          if (i % 50 === 0) {
            console.log(`完成 ${i}/${requestCount} 请求`);
          }
          
          await delay(20);
      }

      const successCount = results.filter(status => status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('LibreChat连续请求统计:', stats);
        console.log(`成功率: ${(successCount / requestCount * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(requestCount * 0.9); // 90%成功率
        expect(stats.avg).toBeLessThan(3000); // 平均响应时间小于3秒
        expect(stats.p95).toBeLessThan(8000); // 95%请求响应时间小于8秒
      }, 300000);

      it('应该能处理不同长度的消息', async () => {
        const messageLengths = [10, 50, 100, 200, 500, 1000];
        const results = [];
        
        for (const length of messageLengths) {
          const message = generateRandomText(length);
          const start = Date.now();
          
          const res = await request(app)
            .post('/api/libre-chat/send')
            .send({
              token: testConfig.validToken,
              message
            });
          
          const duration = Date.now() - start;
          results.push({ length, status: res.status, duration });
          
          await delay(100);
        }
        
        const successCount = results.filter(r => r.status === 200).length;
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        
        console.log('不同长度消息测试结果:', results);
        console.log(`平均响应时间: ${avgDuration}ms`);
        
        expect(successCount).toBeGreaterThan(messageLengths.length * 0.8);
        expect(avgDuration).toBeLessThan(5000);
      }, 120000);
    });

    describe('并发请求压力测试', () => {
      it('应该能处理200个并发聊天请求', async () => {
        const concurrentRequests = 200;
        console.log(`开始${concurrentRequests}个并发LibreChat请求测试...`);
        
        const start = Date.now();
      const responses = await makeConcurrentRequests(
        '/api/libre-chat/send',
        concurrentRequests,
        {
          token: testConfig.validToken,
          message: testConfig.testText
        }
      );
        const totalDuration = Date.now() - start;

      const successCount = responses.filter(res => res.status === 200).length;
        const avgResponseTime = totalDuration / concurrentRequests;
        
        console.log(`LibreChat并发测试完成，总耗时: ${totalDuration}ms`);
        console.log(`平均响应时间: ${avgResponseTime}ms`);
        console.log(`成功率: ${(successCount / concurrentRequests * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(concurrentRequests * 0.85);
        expect(avgResponseTime).toBeLessThan(8000);
      }, 180000);
    });
  });

  describe('认证服务压力测试', () => {
    describe('登录压力测试', () => {
      it('应该能处理1000次连续登录请求', async () => {
        const requestCount = 1000;
      const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续登录请求测试...`);

      for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
        const res = await request(app)
          .post('/api/auth/login')
          .send({
              username: `testuser${i}@example.com`,
              password: 'testpassword123'
          });

          const duration = Date.now() - start;
        results.push(res.status);
          durations.push(duration);
          
          if (i % 100 === 0) {
            console.log(`完成 ${i}/${requestCount} 请求`);
      }

          await delay(10);
        }

      const validResponses = results.filter(status => status === 401 || status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('登录请求统计:', stats);
        console.log(`有效响应率: ${(validResponses / requestCount * 100).toFixed(2)}%`);
        
        expect(validResponses).toBe(requestCount); // 100%有效响应
        expect(stats.avg).toBeLessThan(1000); // 平均响应时间小于1秒
        expect(stats.p95).toBeLessThan(2000); // 95%请求响应时间小于2秒
      }, 300000);

      it('应该能处理500个并发登录请求', async () => {
        const concurrentRequests = 500;
        console.log(`开始${concurrentRequests}个并发登录请求测试...`);
        
        const start = Date.now();
      const responses = await makeConcurrentRequests(
        '/api/auth/login',
        concurrentRequests,
        {
            username: 'testuser@example.com',
            password: 'testpassword123'
          }
        );
        const totalDuration = Date.now() - start;

        const validResponses = responses.filter(res => res.status === 401 || res.status === 200).length;
        const avgResponseTime = totalDuration / concurrentRequests;
        
        console.log(`登录并发测试完成，总耗时: ${totalDuration}ms`);
        console.log(`平均响应时间: ${avgResponseTime}ms`);
        console.log(`有效响应率: ${(validResponses / concurrentRequests * 100).toFixed(2)}%`);
        
        expect(validResponses).toBe(concurrentRequests); // 100%有效响应
        expect(avgResponseTime).toBeLessThan(3000); // 平均响应时间小于3秒
      }, 180000);
    });

    describe('注册压力测试', () => {
      it('应该能处理500次连续注册请求', async () => {
        const requestCount = 500;
        const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续注册请求测试...`);
        
        for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
          const res = await request(app)
            .post('/api/auth/register')
            .send({
              username: `perftestuser${i}`,
              email: `perftestuser${i}@example.com`,
              password: 'testpassword123'
            });
          
          const duration = Date.now() - start;
          results.push(res.status);
          durations.push(duration);
          
          if (i % 50 === 0) {
            console.log(`完成 ${i}/${requestCount} 请求`);
          }
          
          await delay(20);
        }

        const validResponses = results.filter(status => status === 400 || status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('注册请求统计:', stats);
        console.log(`有效响应率: ${(validResponses / requestCount * 100).toFixed(2)}%`);
        
        expect(validResponses).toBe(requestCount); // 100%有效响应
        expect(stats.avg).toBeLessThan(1500); // 平均响应时间小于1.5秒
        expect(stats.p95).toBeLessThan(3000); // 95%请求响应时间小于3秒
      }, 300000);
    });
  });

  describe('TOTP服务压力测试', () => {
    describe('TOTP状态查询压力测试', () => {
      it('应该能处理200次连续TOTP状态查询', async () => {
        const requestCount = 200;
        const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续TOTP状态查询测试...`);
        
        for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
          const res = await request(app)
            .get('/api/totp/status')
            .set('Authorization', `Bearer ${testConfig.validToken}`);
          
          const duration = Date.now() - start;
          results.push(res.status);
          durations.push(duration);
          
          await delay(10);
        }

        const successCount = results.filter(status => status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('TOTP状态查询统计:', stats);
        console.log(`成功率: ${(successCount / requestCount * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(requestCount * 0.95);
        expect(stats.avg).toBeLessThan(500); // 平均响应时间小于500ms
        expect(stats.p95).toBeLessThan(1000); // 95%请求响应时间小于1秒
      }, 120000);

      it('应该能处理100个并发TOTP状态查询', async () => {
        const concurrentRequests = 100;
        console.log(`开始${concurrentRequests}个并发TOTP状态查询测试...`);
        
        const start = Date.now();
        const requests = Array(concurrentRequests).fill(null).map(() =>
          request(app)
            .get('/api/totp/status')
            .set('Authorization', `Bearer ${testConfig.validToken}`)
        );
        
        const responses = await Promise.all(requests);
        const totalDuration = Date.now() - start;

        const successCount = responses.filter(res => res.status === 200).length;
        const avgResponseTime = totalDuration / concurrentRequests;
        
        console.log(`TOTP状态查询并发测试完成，总耗时: ${totalDuration}ms`);
        console.log(`平均响应时间: ${avgResponseTime}ms`);
        console.log(`成功率: ${(successCount / concurrentRequests * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(concurrentRequests * 0.95);
        expect(avgResponseTime).toBeLessThan(2000);
      }, 60000);
    });
  });

  describe('Passkey服务压力测试', () => {
    describe('Passkey凭证查询压力测试', () => {
      it('应该能处理200次连续Passkey凭证查询', async () => {
        const requestCount = 200;
      const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续Passkey凭证查询测试...`);

      for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
        const res = await request(app)
            .get('/api/passkey/credentials')
            .set('Authorization', `Bearer ${testConfig.validToken}`);
          
          const duration = Date.now() - start;
          results.push(res.status);
          durations.push(duration);
          
          await delay(10);
        }

        const successCount = results.filter(status => status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('Passkey凭证查询统计:', stats);
        console.log(`成功率: ${(successCount / requestCount * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(requestCount * 0.95);
        expect(stats.avg).toBeLessThan(500);
        expect(stats.p95).toBeLessThan(1000);
      }, 120000);
    });
  });

  describe('用户管理服务压力测试', () => {
    describe('用户信息查询压力测试', () => {
      it('应该能处理500次连续用户信息查询', async () => {
        const requestCount = 500;
        const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续用户信息查询测试...`);
        
        for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
          const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${testConfig.validToken}`);
          
          const duration = Date.now() - start;
        results.push(res.status);
          durations.push(duration);
          
          if (i % 50 === 0) {
            console.log(`完成 ${i}/${requestCount} 请求`);
          }
          
          await delay(10);
        }

        const successCount = results.filter(status => status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('用户信息查询统计:', stats);
        console.log(`成功率: ${(successCount / requestCount * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(requestCount * 0.95);
        expect(stats.avg).toBeLessThan(300); // 平均响应时间小于300ms
        expect(stats.p95).toBeLessThan(500); // 95%请求响应时间小于500ms
      }, 180000);

      it('应该能处理200个并发用户信息查询', async () => {
        const concurrentRequests = 200;
        console.log(`开始${concurrentRequests}个并发用户信息查询测试...`);
        
        const start = Date.now();
        const requests = Array(concurrentRequests).fill(null).map(() =>
          request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${testConfig.validToken}`)
        );
        
        const responses = await Promise.all(requests);
        const totalDuration = Date.now() - start;

        const successCount = responses.filter(res => res.status === 200).length;
        const avgResponseTime = totalDuration / concurrentRequests;
        
        console.log(`用户信息查询并发测试完成，总耗时: ${totalDuration}ms`);
        console.log(`平均响应时间: ${avgResponseTime}ms`);
        console.log(`成功率: ${(successCount / concurrentRequests * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(concurrentRequests * 0.95);
        expect(avgResponseTime).toBeLessThan(1000);
      }, 60000);
    });
  });

  describe('TTS历史记录压力测试', () => {
    describe('历史记录查询压力测试', () => {
      it('应该能处理300次连续历史记录查询', async () => {
        const requestCount = 300;
        const results = [];
        const durations = [];
        
        console.log(`开始${requestCount}次连续TTS历史记录查询测试...`);
        
        for (let i = 0; i < requestCount; i++) {
          const start = Date.now();
      const res = await request(app)
            .get('/api/tts/history')
            .set('Authorization', `Bearer ${testConfig.validToken}`);
          
          const duration = Date.now() - start;
          results.push(res.status);
          durations.push(duration);
          
          if (i % 50 === 0) {
            console.log(`完成 ${i}/${requestCount} 请求`);
          }
          
          await delay(10);
        }

        const successCount = results.filter(status => status === 200).length;
        const stats = calculateStats(durations);
        
        console.log('TTS历史记录查询统计:', stats);
        console.log(`成功率: ${(successCount / requestCount * 100).toFixed(2)}%`);
        
        expect(successCount).toBeGreaterThan(requestCount * 0.95);
        expect(stats.avg).toBeLessThan(800); // 平均响应时间小于800ms
        expect(stats.p95).toBeLessThan(1500); // 95%请求响应时间小于1.5秒
      }, 180000);
    });
  });

  describe('系统资源压力测试', () => {
    describe('内存使用压力测试', () => {
      it('应该在持续高负载下保持稳定的内存使用', async () => {
        const initialMemory = process.memoryUsage();
        const requestCount = 1000;
        const batchSize = 100;
        const batches = requestCount / batchSize;
        
        console.log('开始内存使用压力测试...');
        console.log('初始内存使用:', {
          heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(initialMemory.heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(initialMemory.external / 1024 / 1024) + 'MB'
        });
        
        for (let batch = 0; batch < batches; batch++) {
          console.log(`执行批次 ${batch + 1}/${batches}`);
          
          // 混合请求：TTS + LibreChat + 用户查询
      await Promise.all([
            makeConcurrentRequests('/api/tts/generate', batchSize / 3, {
          text: testConfig.testText,
          voice: testConfig.testVoice,
          model: testConfig.testModel
        }),
            makeConcurrentRequests('/api/libre-chat/send', batchSize / 3, {
          token: testConfig.validToken,
          message: testConfig.testText
            }),
            makeConcurrentRequests('/api/auth/me', batchSize / 3, {}, {
              'Authorization': `Bearer ${testConfig.validToken}`
        })
      ]);

          // 强制垃圾回收
          if (global.gc) {
            global.gc();
          }
          
      await delay(1000);
        }
        
        const finalMemory = process.memoryUsage();
        const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
        
        console.log('最终内存使用:', {
          heapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(finalMemory.heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(finalMemory.external / 1024 / 1024) + 'MB'
        });
        console.log(`内存增长: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
        
        // 内存增长不应超过100MB
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        
        // 堆内存使用率不应超过80%
        const heapUsageRatio = finalMemory.heapUsed / finalMemory.heapTotal;
        expect(heapUsageRatio).toBeLessThan(0.8);
      }, 600000); // 10分钟超时
    });

    describe('CPU使用压力测试', () => {
      it('应该在持续高负载下保持稳定的CPU使用', async () => {
        const requestCount = 500;
        const startTime = Date.now();
        const startCpu = process.cpuUsage();
        
        console.log('开始CPU使用压力测试...');
        
        // 创建高CPU负载的请求
        const requests = Array(requestCount).fill(null).map((_, i) =>
          request(app)
            .post('/api/tts/generate')
            .send({
              text: generateRandomText(200 + (i % 300)), // 较长文本增加处理时间
              voice: testConfig.testVoice,
              model: testConfig.testModel
            })
        );
        
        await Promise.all(requests);
        
        const endTime = Date.now();
        const endCpu = process.cpuUsage(startCpu);
        const totalTime = endTime - startTime;
        
        const cpuUsagePercent = (endCpu.user + endCpu.system) / (totalTime * 1000) * 100;
        
        console.log(`CPU使用测试完成，总耗时: ${totalTime}ms`);
        console.log(`CPU使用率: ${cpuUsagePercent.toFixed(2)}%`);
        console.log(`CPU时间: ${endCpu.user + endCpu.system}ms`);
        
        // CPU使用率不应超过90%
        expect(cpuUsagePercent).toBeLessThan(90);
        
        // 总处理时间应该合理
        expect(totalTime).toBeLessThan(300000); // 5分钟内完成
      }, 300000);
    });
  });

  describe('混合负载压力测试', () => {
    it('应该能处理复杂的混合负载场景', async () => {
      const testDuration = 60000; // 1分钟测试
      const startTime = Date.now();
      const results: Record<string, { success: number; total: number; durations: number[] }> = {
        tts: { success: 0, total: 0, durations: [] },
        librechat: { success: 0, total: 0, durations: [] },
        auth: { success: 0, total: 0, durations: [] },
        totp: { success: 0, total: 0, durations: [] },
        passkey: { success: 0, total: 0, durations: [] },
        user: { success: 0, total: 0, durations: [] }
      };
      
      console.log('开始混合负载压力测试...');
      
      while (Date.now() - startTime < testDuration) {
        // 随机选择服务进行测试
        const services = [
          {
            name: 'tts',
            request: () => request(app).post('/api/tts/generate').send({
              text: generateRandomText(100),
              voice: testConfig.testVoice,
              model: testConfig.testModel
            })
          },
          {
            name: 'librechat',
            request: () => request(app).post('/api/libre-chat/send').send({
              token: testConfig.validToken,
              message: generateRandomText(50)
            })
          },
          {
            name: 'auth',
            request: () => request(app).post('/api/auth/login').send({
              username: `mixedtest${Math.random()}@example.com`,
              password: 'testpassword123'
            })
          },
          {
            name: 'totp',
            request: () => request(app).get('/api/totp/status').set('Authorization', `Bearer ${testConfig.validToken}`)
          },
          {
            name: 'passkey',
            request: () => request(app).get('/api/passkey/credentials').set('Authorization', `Bearer ${testConfig.validToken}`)
          },
          {
            name: 'user',
            request: () => request(app).get('/api/auth/me').set('Authorization', `Bearer ${testConfig.validToken}`)
          }
        ];
        
        // 并发执行多个随机服务
        const concurrentRequests = 10;
        const selectedServices = [];
        for (let i = 0; i < concurrentRequests; i++) {
          selectedServices.push(services[Math.floor(Math.random() * services.length)]);
        }
        
        const promises = selectedServices.map(async (service) => {
          const start = Date.now();
          try {
            const res = await service.request();
            const duration = Date.now() - start;
            
            results[service.name].total++;
            if (res.status === 200) {
              results[service.name].success++;
            }
            results[service.name].durations.push(duration);
          } catch (error) {
            results[service.name].total++;
            results[service.name].durations.push(5000); // 假设5秒超时
          }
        });
        
        await Promise.all(promises);
        await delay(100); // 小延迟
      }
      
      // 计算统计信息
      const summary: Record<string, { successRate: string; totalRequests: number; avgResponseTime: string; p95ResponseTime: string }> = {};
      for (const [service, data] of Object.entries(results)) {
        if (data.total > 0) {
          const stats = calculateStats(data.durations);
          summary[service] = {
            successRate: (data.success / data.total * 100).toFixed(2) + '%',
            totalRequests: data.total,
            avgResponseTime: Math.round(stats.avg) + 'ms',
            p95ResponseTime: Math.round(stats.p95) + 'ms'
          };
        }
      }
      
      console.log('混合负载测试结果:', summary);
      
      // 验证所有服务都有合理的成功率
      for (const [service, data] of Object.entries(results)) {
        if (data.total > 0) {
          const successRate = data.success / data.total;
          expect(successRate).toBeGreaterThan(0.8); // 80%成功率
        }
      }
    }, 120000); // 2分钟超时
  });

  describe('极限压力测试', () => {
    it('应该能处理极限并发负载', async () => {
      const concurrentRequests = 1000;
      console.log(`开始极限压力测试: ${concurrentRequests}个并发请求...`);
      
      const start = Date.now();
      
      // 创建极限并发请求
      const requests = Array(concurrentRequests).fill(null).map((_, i) => {
        const serviceType = i % 4;
        switch (serviceType) {
          case 0:
            return request(app).post('/api/tts/generate').send({
              text: generateRandomText(50),
              voice: testConfig.testVoice,
              model: testConfig.testModel
            });
          case 1:
            return request(app).post('/api/libre-chat/send').send({
              token: testConfig.validToken,
              message: generateRandomText(30)
            });
          case 2:
            return request(app).get('/api/auth/me').set('Authorization', `Bearer ${testConfig.validToken}`);
          case 3:
            return request(app).post('/api/auth/login').send({
              username: `extremetest${i}@example.com`,
              password: 'testpassword123'
            });
        }
      });
      
      const responses = await Promise.all(requests);
      const totalDuration = Date.now() - start;
      
      const successCount = responses.filter(res => res && res.status === 200).length;
      const validCount = responses.filter(res => res && [200, 401, 400].includes(res.status)).length;
      const avgResponseTime = totalDuration / concurrentRequests;
      
      console.log(`极限压力测试完成:`);
      console.log(`总耗时: ${totalDuration}ms`);
      console.log(`平均响应时间: ${avgResponseTime}ms`);
      console.log(`成功率: ${(successCount / concurrentRequests * 100).toFixed(2)}%`);
      console.log(`有效响应率: ${(validCount / concurrentRequests * 100).toFixed(2)}%`);
      
      // 极限测试的期望值相对宽松
      expect(validCount).toBeGreaterThan(concurrentRequests * 0.7); // 70%有效响应
      expect(avgResponseTime).toBeLessThan(30000); // 平均响应时间小于30秒
      expect(totalDuration).toBeLessThan(120000); // 总耗时小于2分钟
    }, 180000); // 3分钟超时
  });
}); 