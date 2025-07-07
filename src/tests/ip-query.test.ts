import request from 'supertest';
import app from '../app';

describe('精准IP查询 API', () => {
  const testCases = [
    { ip: '180.76.76.76', name: '百度DNS服务器' },
    { ip: '223.5.5.5', name: '阿里DNS服务器' },
    { ip: '119.29.29.29', name: '腾讯DNS服务器' },
    { ip: '8.8.8.8', name: 'Google DNS服务器' }
  ];

  testCases.forEach(tc => {
    it(`${tc.name} (${tc.ip}) 查询应成功`, async () => {
      const res = await request(app)
        .get('/api/network/ipquery')
        .query({ ip: tc.ip });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      if (res.body.data && res.body.data.data && res.body.data.data.ip) {
        expect(res.body.data.data.ip).toBe(tc.ip);
      }
    });
  });

  it('空IP参数应返回400', async () => {
    const res = await request(app)
      .get('/api/network/ipquery');
    
    expect(res.status).toBe(400);
  });

  it('无效IP格式应返回400', async () => {
    const res = await request(app)
      .get('/api/network/ipquery')
      .query({ ip: 'invalid-ip' });
    
    expect(res.status).toBe(400);
  });
}); 