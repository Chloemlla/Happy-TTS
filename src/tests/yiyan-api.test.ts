import request from 'supertest';
import app from '../app';

describe('随机一言古诗词 API', () => {
  it('随机一言 (hitokoto) 应该返回成功', async () => {
    const res = await request(app)
      .get('/api/network/yiyan')
      .query({ type: 'hitokoto' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('code');
    expect(res.body.data).toHaveProperty('msg');
  });

  it('随机古诗词 (poetry) 应该返回成功', async () => {
    const res = await request(app)
      .get('/api/network/yiyan')
      .query({ type: 'poetry' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('code');
    expect(res.body.data).toHaveProperty('msg');
  });

  it('空类型参数应该返回 400 错误', async () => {
    const res = await request(app)
      .get('/api/network/yiyan');
    
    expect(res.status).toBe(400);
  });

  it('无效类型参数应该返回 400 错误', async () => {
    const res = await request(app)
      .get('/api/network/yiyan')
      .query({ type: 'invalid' });
    
    expect(res.status).toBe(400);
  });

  it('批量测试一言 (连续5次)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .get('/api/network/yiyan')
        .query({ type: 'hitokoto' });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('data');
    }
  });
}); 