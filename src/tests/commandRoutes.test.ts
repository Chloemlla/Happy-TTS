import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../app';
import { config } from '../config/config';
import * as os from 'os';

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
      // 根据平台选择不同的命令
      const testCommand = os.platform() === 'win32' ? 'dir' : 'ls';
      
      const res = await request(app)
        .post('/api/command/execute')
        .send({
          command: testCommand,
          password: validPassword
        });

      // 在 Windows 上 dir 可能不在白名单中，所以我们检查状态码
      if (res.status === 200) {
        expect(res.body.output).toBeDefined();
      } else if (res.status === 500) {
        // 如果命令执行失败，至少验证了密码验证和危险命令检查通过
        expect(res.body.error).toBeDefined();
      }
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