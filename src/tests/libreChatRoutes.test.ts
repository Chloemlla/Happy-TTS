import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { config } from '../config/config';

describe('LibreChat Routes', () => {
  const validToken = 'valid-token';
  const validMessage = 'Hello, how are you?';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/libre-chat/send', () => {
    it('应该拒绝无效token的请求', async () => {
      const res = await request(app)
        .post('/api/libre-chat/send')
        .send({
          token: 'invalid-token',
          message: validMessage
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/无效的token/);
    });

    it('应该拒绝空消息', async () => {
      const res = await request(app)
        .post('/api/libre-chat/send')
        .send({
          token: validToken,
          message: ''
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/消息不能为空/);
    });

    it('应该成功发送消息', async () => {
      const res = await request(app)
        .post('/api/libre-chat/send')
        .send({
          token: validToken,
          message: validMessage
        });

      expect(res.status).toBe(200);
      expect(res.body.response).toBeDefined();
    });

    it('应该处理超长消息', async () => {
      const longMessage = 'a'.repeat(5000);
      const res = await request(app)
        .post('/api/libre-chat/send')
        .send({
          token: validToken,
          message: longMessage
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/消息过长/);
    });
  });

  describe('GET /api/libre-chat/history', () => {
    it('应该返回聊天历史', async () => {
      const res = await request(app)
        .get('/api/libre-chat/history')
        .query({ token: validToken });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.history)).toBe(true);
    });

    it('应该拒绝无效token的历史请求', async () => {
      const res = await request(app)
        .get('/api/libre-chat/history')
        .query({ token: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/无效的token/);
    });

    it('应该正确处理分页', async () => {
      const res = await request(app)
        .get('/api/libre-chat/history')
        .query({ 
          token: validToken,
          page: 1,
          limit: 10
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.history)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(res.body.currentPage).toBe(1);
    });
  });

  describe('DELETE /api/libre-chat/clear', () => {
    it('应该成功清除聊天历史', async () => {
      const res = await request(app)
        .delete('/api/libre-chat/clear')
        .send({ token: validToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/清除成功/);
    });

    it('应该拒绝无效token的清除请求', async () => {
      const res = await request(app)
        .delete('/api/libre-chat/clear')
        .send({ token: 'invalid-token' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/无效的token/);
    });
  });
}); 