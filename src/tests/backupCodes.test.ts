import request from 'supertest';
import express from 'express';
import totpRoutes from '../routes/totpRoutes';
import { UserStorage } from '../utils/userStorage';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';

// 创建测试应用
const app = express();
app.use(express.json());
app.use('/api/totp', totpRoutes);

// 模拟用户数据
const mockUser = {
  id: 'test-user-id',
  username: 'testuser',
  email: 'test@example.com',
  role: 'user',
  dailyUsage: 0,
  lastUsageDate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  totpEnabled: true,
  totpSecret: 'JBSWY3DPEHPK3PXP',
  backupCodes: ['ABC12345', 'DEF67890', 'GHI11111', 'JKL22222', 'MNO33333']
};

// 生成测试用的JWT token
const generateTestToken = (userId: string) => {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '1h' });
};

// 模拟 UserStorage
jest.mock('../utils/userStorage', () => ({
  UserStorage: {
    getUserById: jest.fn()
  }
}));

describe('备用恢复码功能测试', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/totp/backup-codes', () => {
    it('应该成功获取用户的备用恢复码', async () => {
      // 模拟用户存在且已启用TOTP
      (UserStorage.getUserById as jest.Mock).mockResolvedValue(mockUser);

      const token = generateTestToken('test-user-id');

      const response = await request(app)
        .get('/api/totp/backup-codes')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toEqual({
        backupCodes: ['ABC12345', 'DEF67890', 'GHI11111', 'JKL22222', 'MNO33333'],
        remainingCount: 5,
        message: '备用恢复码获取成功'
      });
    });

    it('应该拒绝未授权的请求', async () => {
      const response = await request(app)
        .get('/api/totp/backup-codes')
        .expect(401);

      expect(response.body).toEqual({
        error: '未授权'
      });
    });

    it('应该拒绝TOTP未启用的用户', async () => {
      const userWithoutTOTP = { ...mockUser, totpEnabled: false };
      (UserStorage.getUserById as jest.Mock).mockResolvedValue(userWithoutTOTP);

      const token = generateTestToken('test-user-id');

      const response = await request(app)
        .get('/api/totp/backup-codes')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      expect(response.body).toEqual({
        error: 'TOTP未启用'
      });
    });

    it('应该处理没有备用恢复码的情况', async () => {
      const userWithoutBackupCodes = { ...mockUser, backupCodes: [] };
      (UserStorage.getUserById as jest.Mock).mockResolvedValue(userWithoutBackupCodes);

      const token = generateTestToken('test-user-id');

      const response = await request(app)
        .get('/api/totp/backup-codes')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);

      expect(response.body).toEqual({
        error: '没有可用的备用恢复码'
      });
    });

    it('应该处理用户不存在的情况', async () => {
      (UserStorage.getUserById as jest.Mock).mockResolvedValue(null);

      const token = generateTestToken('non-existent-user');

      const response = await request(app)
        .get('/api/totp/backup-codes')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body).toEqual({
        error: '无效的Token'
      });
    });
  });
}); 