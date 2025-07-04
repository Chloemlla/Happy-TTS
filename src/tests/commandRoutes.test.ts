import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { config } from '../config/config';

describe('Command Routes', () => {
  const validPassword = config.adminPassword;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/command/execute', () => {
    it('应该拒绝无效密码的请求', async () => {
      const res = await request(app)
        .post('/api/command/execute')
        .send({
          command: 'ls',
          password: 'invalid-password'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/密码错误/);
    });

    it('应该拒绝危险命令', async () => {
      const res = await request(app)
        .post('/api/command/execute')
        .send({
          command: 'rm -rf /',
          password: validPassword
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/危险命令/);
    });

    it('应该成功执行安全命令', async () => {
      const res = await request(app)
        .post('/api/command/execute')
        .send({
          command: 'echo "test"',
          password: validPassword
        });

      expect(res.status).toBe(200);
      expect(res.body.output).toBeDefined();
    });

    it('应该处理命令执行错误', async () => {
      const res = await request(app)
        .post('/api/command/execute')
        .send({
          command: 'invalid-command',
          password: validPassword
        });

      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /api/command/status', () => {
    it('应该返回服务器状态', async () => {
      const res = await request(app)
        .post('/api/command/status')
        .send({
          password: validPassword
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('memory_usage');
      expect(res.body).toHaveProperty('cpu_usage_percent');
    });

    it('应该拒绝无效密码的状态请求', async () => {
      const res = await request(app)
        .post('/api/command/status')
        .send({
          password: 'invalid-password'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/密码错误/);
    });
  });
}); 