import axios from 'axios';
import request from 'supertest';
import app from '../app';

// 创建配置了 baseURL 的 axios 实例
const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000
});

// 媒体解析API
describe('媒体解析 API', () => {
  it('网抑云音乐解析', async () => {
    const res = await request(app)
      .get('/api/media/music163')
      .query({ id: '2651528954' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('皮皮虾视频解析', async () => {
    const res = await request(app)
      .get('/api/media/pipixia')
      .query({ url: 'https://pipix.com/video/123456' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('社交媒体 API', () => {
  it('微博热搜', async () => {
    const res = await request(app)
      .get('/api/social/weibo-hot');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('百度热搜', async () => {
    const res = await request(app)
      .get('/api/social/baidu-hot');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('生活信息 API', () => {
  it('手机号码归属地查询', async () => {
    const res = await request(app)
      .get('/api/life/phone-address')
      .query({ phone: '13800138000' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('油价查询（全国）', async () => {
    const res = await request(app)
      .get('/api/life/oil-price');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  
  it('油价查询（指定城市）', async () => {
    const res = await request(app)
      .get('/api/life/oil-price')
      .query({ city: '北京' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('错误处理', () => {
  it('无效歌曲ID应返回400', async () => {
    const res = await request(app)
      .get('/api/media/music163')
      .query({ id: 'invalid_id' });
    expect(res.status).toBe(400);
  });
}); 