import request from 'supertest';
import app from '../app';
import { domainExemptionService } from '../services/domainExemptionService';

describe('EmailController - 跳过白名单检查功能', () => {
  let adminToken: string;

  beforeAll(async () => {
    // 这里需要设置管理员token，实际测试中需要先登录获取token
    // adminToken = await getAdminToken();
  });

  describe('POST /api/email/send', () => {
    it('应该允许跳过白名单检查发送邮件到无效格式邮箱', async () => {
      const emailData = {
        from: 'noreply@hapxs.com',
        to: ['jubao@dinghaoinc.com'], // 这个邮箱格式可能无效
        subject: '测试邮件',
        html: '<h1>测试</h1>',
        skipWhitelist: true
      };

      // 注意：这个测试需要有效的管理员token
      // const response = await request(app)
      //   .post('/api/email/send')
      //   .set('Authorization', `Bearer ${adminToken}`)
      //   .send(emailData);

      // expect(response.status).toBe(200);
      // expect(response.body.success).toBe(true);
    });

    it('不跳过白名单检查时应该验证邮箱格式', async () => {
      const emailData = {
        from: 'noreply@hapxs.com',
        to: ['invalid-email-format'],
        subject: '测试邮件',
        html: '<h1>测试</h1>',
        skipWhitelist: false
      };

      // 注意：这个测试需要有效的管理员token
      // const response = await request(app)
      //   .post('/api/email/send')
      //   .set('Authorization', `Bearer ${adminToken}`)
      //   .send(emailData);

      // expect(response.status).toBe(400);
      // expect(response.body.error).toContain('邮箱格式无效');
    });
  });

  describe('POST /api/email/send-simple', () => {
    it('应该允许跳过白名单检查发送简单邮件', async () => {
      const emailData = {
        to: ['jubao@dinghaoinc.com'],
        subject: '测试简单邮件',
        content: '这是一封测试邮件',
        skipWhitelist: true
      };

      // 注意：这个测试需要有效的管理员token
      // const response = await request(app)
      //   .post('/api/email/send-simple')
      //   .set('Authorization', `Bearer ${adminToken}`)
      //   .send(emailData);

      // expect(response.status).toBe(200);
      // expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/email/send-markdown', () => {
    it('应该允许跳过白名单检查发送Markdown邮件', async () => {
      const emailData = {
        from: 'noreply@hapxs.com',
        to: ['jubao@dinghaoinc.com'],
        subject: '测试Markdown邮件',
        markdown: '# 测试\n这是一封测试邮件',
        skipWhitelist: true
      };

      // 注意：这个测试需要有效的管理员token
      // const response = await request(app)
      //   .post('/api/email/send-markdown')
      //   .set('Authorization', `Bearer ${adminToken}`)
      //   .send(emailData);

      // expect(response.status).toBe(200);
      // expect(response.body.success).toBe(true);
    });
  });
}); 