import request from 'supertest';
import app from '../app';

describe('网络检测和数据处理 API', () => {
  it('TCP连接检测', async () => {
    const res = await request(app)
      .get('/api/network/tcp')
      .query({ host: 'www.baidu.com', port: '80' });
    expect(res.body).toBeDefined();
  });

  it('Ping检测', async () => {
    const res = await request(app)
      .get('/api/network/ping')
      .query({ url: 'www.baidu.com' });
    expect(res.body).toBeDefined();
  });

  it('网站测速', async () => {
    const res = await request(app)
      .get('/api/network/speed')
      .query({ url: 'https://www.baidu.com' });
    expect(res.body).toBeDefined();
  });

  it('端口扫描', async () => {
    const res = await request(app)
      .get('/api/network/portscan')
      .query({ address: '127.0.0.1' });
    expect(res.body).toBeDefined();
  });

  it('精准IP查询', async () => {
    const res = await request(app)
      .get('/api/network/ipquery')
      .query({ ip: '8.8.8.8' });
    expect(res.body).toBeDefined();
  });

  it('随机一言', async () => {
    const res = await request(app)
      .get('/api/network/yiyan')
      .query({ type: 'hitokoto' });
    expect(res.body).toBeDefined();
  });

  it('随机古诗词', async () => {
    const res = await request(app)
      .get('/api/network/yiyan')
      .query({ type: 'poetry' });
    expect(res.body).toBeDefined();
  });

  it('Base64编码', async () => {
    const res = await request(app)
      .get('/api/data/base64/encode')
      .query({ text: 'Hello World!' });
    expect(res.body).toBeDefined();
  });

  it('Base64解码', async () => {
    const res = await request(app)
      .get('/api/data/base64/decode')
      .query({ text: 'SGVsbG8gV29ybGQh' });
    expect(res.body).toBeDefined();
  });

  it('MD5哈希加密', async () => {
    const res = await request(app)
      .get('/api/data/md5')
      .query({ text: 'Hello World!' });
    expect(res.body).toBeDefined();
  });
}); 