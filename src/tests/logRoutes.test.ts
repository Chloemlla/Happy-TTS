import request from 'supertest';
import app from '../app';
import fs from 'fs';
import path from 'path';
import { UserStorage } from '../utils/userStorage';

describe('logRoutes API', () => {
  let adminPassword = '';
  let logId = '';
  const testLog = 'Jest test log content.';
  const sharelogsDir = path.join(process.cwd(), 'data', 'sharelogs');
  const testFilePath = path.join(__dirname, 'testlog.txt');

  beforeAll(async () => {
    // 获取管理员密码
    const users = await UserStorage.getAllUsers();
    const admin = users.find(u => u.role === 'admin');
    adminPassword = admin?.password || 'admin';
    // 确保sharelogs目录存在
    if (!fs.existsSync(sharelogsDir)) {
      fs.mkdirSync(sharelogsDir, { recursive: true });
    }
    // 创建测试文件
    fs.writeFileSync(testFilePath, testLog, 'utf-8');
  });

  afterAll(() => {
    // 清理测试日志文件
    if (logId) {
      const files = fs.readdirSync(sharelogsDir);
      const fileName = files.find(f => f.startsWith(logId));
      if (fileName) {
        const filePath = path.join(sharelogsDir, fileName);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  });

  it('管理员密码正确时上传日志成功并返回访问链接', async () => {
    const res = await request(app)
      .post('/api/sharelog')
      .attach('file', testFilePath)
      .field('adminPassword', adminPassword);
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.link).toContain('/logshare?id=');
    logId = res.body.id;
  });

  it('管理员密码错误时上传失败', async () => {
    const res = await request(app)
      .post('/api/sharelog')
      .attach('file', testFilePath)
      .field('adminPassword', 'wrongpass');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/密码错误/);
  });

  it('查询日志内容成功', async () => {
    const res = await request(app)
      .post(`/api/sharelog/${logId}`)
      .send({ adminPassword });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe(testLog);
  });

  it('查询不存在的日志返回404', async () => {
    const res = await request(app)
      .post('/api/sharelog/notexistid')
      .send({ adminPassword });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/日志不存在/);
  });
}); 