import express from 'express';
import { AuthController } from '../controllers/authController';
import { UserStorage } from '../utils/userStorage';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';

// 模拟依赖
jest.mock('../utils/userStorage');
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

const mockUserStorage = UserStorage as jest.Mocked<typeof UserStorage>;

describe('AuthController', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // 重置所有模拟
    jest.clearAllMocks();
  });

  describe('getCurrentUser', () => {
    it('应该在没有Authorization头时返回401', async () => {
      const req = {
        ip: '192.168.1.1',
        headers: {}
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '未登录'
      });
    });

    it('应该在无效token时返回401', async () => {
      const req = {
        ip: '192.168.1.1',
        headers: {
          authorization: 'Bearer '
        }
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: '无效的认证令牌'
      });
    });

    it('应该在用户不存在时返回404', async () => {
      mockUserStorage.getUserById.mockResolvedValue(null);

      // 创建有效的JWT token
      const validToken = jwt.sign(
        { userId: 'user123', username: 'testuser' },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      const req = {
        ip: '192.168.1.1',
        headers: {
          authorization: `Bearer ${validToken}`
        }
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: '用户不存在'
      });
    });

    it('应该成功返回用户信息', async () => {
      const mockUser = {
        id: 'user123',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user' as const,
        dailyUsage: 100,
        lastUsageDate: '2024-01-01',
        createdAt: '2024-01-01',
        password: 'hashedPassword'
      };

      mockUserStorage.getUserById.mockResolvedValue(mockUser);
      mockUserStorage.getRemainingUsage.mockResolvedValue(50);

      // 创建有效的JWT token
      const validToken = jwt.sign(
        { userId: 'user123', username: 'testuser' },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      const req = {
        ip: '192.168.1.1',
        headers: {
          authorization: `Bearer ${validToken}`
        }
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(mockUserStorage.getUserById).toHaveBeenCalledWith('user123');
      expect(mockUserStorage.getRemainingUsage).toHaveBeenCalledWith('user123');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user123',
          username: 'testuser',
          role: 'user',
          remainingUsage: 50
        })
      );
      // 确保密码没有被返回
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          password: expect.anything()
        })
      );
    });
  });
}); 