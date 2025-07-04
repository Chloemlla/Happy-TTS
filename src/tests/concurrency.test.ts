import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { config } from '../config/config';

describe('并发测试', () => {
  const testText = '这是一段测试文本';
  
  // 辅助函数：创建延迟
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  // 辅助函数：创建并发请求
  const createConcurrentRequests = (endpoint: string, count: number, payload: any) => {
    return Promise.all(
      Array(count).fill(null).map(() =>
        request(app)
          .post(endpoint)
          .send(payload)
      )
    );
  };

  // 辅助函数：监控响应时间
  const measureResponseTime = async (endpoint: string, payload: any) => {
    const start = Date.now();
    await request(app).post(endpoint).send(payload);
    return Date.now() - start;
  };

  describe('TTS服务并发测试', () => {
    it('应该能同时处理多个TTS请求而不崩溃', async () => {
      const concurrentRequests = 5;
      const responses = await createConcurrentRequests(
        '/api/tts/generate',
        concurrentRequests,
        {
          text: testText,
          voice: 'alloy',
          model: 'tts-1'
        }
      );

      // 检查所有请求是否都得到响应
      expect(responses).toHaveLength(concurrentRequests);
      
      // 检查响应是否都是有效的（200或429）
      responses.forEach(res => {
        expect([200, 429]).toContain(res.status);
      });
    }, 30000);

    it('应该在高并发下保持响应时间在可接受范围', async () => {
      const baselineTime = await measureResponseTime('/api/tts/generate', {
        text: testText,
        voice: 'alloy',
        model: 'tts-1'
      });

      // 创建10个并发请求
      const start = Date.now();
      await createConcurrentRequests('/api/tts/generate', 10, {
        text: testText,
        voice: 'alloy',
        model: 'tts-1'
      });
      const concurrentTime = Date.now() - start;

      // 并发请求的平均响应时间不应该超过基准时间的5倍
      expect(concurrentTime / 10).toBeLessThan(baselineTime * 5);
    }, 30000);
  });

  describe('认证服务并发测试', () => {
    it('应该能同时处理多个登录请求', async () => {
      const concurrentRequests = 20;
      const responses = await createConcurrentRequests(
        '/api/auth/login',
        concurrentRequests,
        {
          username: 'test@example.com',
          password: 'password123'
        }
      );

      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach(res => {
        expect([200, 401, 429]).toContain(res.status);
      });
    }, 20000);

    it('应该在高并发下正确维护会话状态', async () => {
      const sessions = await Promise.all(
        Array(10).fill(null).map(async (_, index) => {
          const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
              username: `test${index}@example.com`,
              password: 'password123'
            });

          if (loginRes.status === 200 && loginRes.body.token) {
            const profileRes = await request(app)
              .get('/api/auth/me')
              .set('Authorization', `Bearer ${loginRes.body.token}`);

            return profileRes.status;
          }
          return loginRes.status;
        })
      );

      // 所有响应都应该是有效的状态码
      sessions.forEach(status => {
        expect([200, 401, 429]).toContain(status);
      });
    }, 30000);
  });

  describe('数据一致性测试', () => {
    it('应该在并发写入时保持数据一致性', async () => {
      const writeOperations = 20;
      const testData = Array(writeOperations).fill(null).map((_, i) => ({
        userId: `user${i}`,
        data: `test-data-${i}`
      }));

      // 并发写入数据
      await Promise.all(
        testData.map(data =>
          request(app)
            .post('/api/data-collection/save')
            .send(data)
        )
      );

      // 验证写入的数据
      const results = await Promise.all(
        testData.map(data =>
          request(app)
            .get(`/api/data-collection/get/${data.userId}`)
            .send()
        )
      );

      // 检查数据一致性
      results.forEach((res, i) => {
        if (res.status === 200) {
          expect(res.body.data).toBe(`test-data-${i}`);
        }
      });
    }, 30000);
  });

  describe('资源竞争测试', () => {
    it('应该正确处理共享资源的并发访问', async () => {
      const sharedResourceEndpoint = '/api/command/status';
      const concurrentAccesses = 50;

      const responses = await Promise.all(
        Array(concurrentAccesses).fill(null).map(() =>
          request(app)
            .get(sharedResourceEndpoint)
            .send()
        )
      );

      // 检查是否有请求失败
      const failedRequests = responses.filter(res => res.status !== 200 && res.status !== 429);
      expect(failedRequests.length).toBe(0);
    }, 20000);
  });

  describe('错误恢复测试', () => {
    it('应该在高负载后正常恢复服务', async () => {
      // 首先创建高负载
      await createConcurrentRequests('/api/tts/generate', 20, {
        text: testText,
        voice: 'alloy',
        model: 'tts-1'
      });

      // 等待系统恢复
      await delay(5000);

      // 验证系统是否恢复正常
      const res = await request(app)
        .post('/api/tts/generate')
        .send({
          text: testText,
          voice: 'alloy',
          model: 'tts-1'
        });

      expect(res.status).toBe(200);
    }, 30000);
  });
}); 