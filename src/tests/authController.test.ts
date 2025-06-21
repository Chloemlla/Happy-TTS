import express from 'express';
import { AuthController } from '../controllers/authController';
import { UserStorage } from '../utils/userStorage';

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
    it('应该为本地IP返回管理员信息', async () => {
      const mockAdminUser = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin' as const,
        dailyUsage: 1000,
        lastUsageDate: '2024-01-01',
        createdAt: '2024-01-01',
        password: 'hashedPassword'
      };

      mockUserStorage.getUserById.mockResolvedValue(mockAdminUser);
      mockUserStorage.getRemainingUsage.mockResolvedValue(500);

      const req = {
        ip: '127.0.0.1',
        headers: {}
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(mockUserStorage.getUserById).toHaveBeenCalledWith('1');
      expect(mockUserStorage.getRemainingUsage).toHaveBeenCalledWith('1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          username: 'admin',
          role: 'admin',
          remainingUsage: 500
        })
      );
    });

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

      const req = {
        ip: '192.168.1.1',
        headers: {
          authorization: 'Bearer user123'
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

      const req = {
        ip: '192.168.1.1',
        headers: {
          authorization: 'Bearer user123'
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

  describe('isLocalIp', () => {
    it('应该正确识别本地IP', () => {
      const localIps = ['127.0.0.1', '::1', 'localhost'];
      
      localIps.forEach(ip => {
        expect(AuthController['isLocalIp'](ip)).toBe(true);
      });
    });

    it('应该正确识别非本地IP', () => {
      const nonLocalIps = ['192.168.1.1', '10.0.0.1', '172.16.0.1'];
      
      nonLocalIps.forEach(ip => {
        expect(AuthController['isLocalIp'](ip)).toBe(false);
      });
    });
  });
}); 