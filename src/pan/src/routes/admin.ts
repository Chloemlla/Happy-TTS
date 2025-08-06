import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { logger } from '@/utils/logger';
import { config } from '@/config';

const router = Router();

// 模拟管理员数据（实际项目中应该使用数据库）
const adminUsers = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@happytss.com',
    password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK8i', // admin123
    isActive: true,
    role: 'admin' as const,
    lastLoginAt: null
  }
];

// 管理员登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // 验证输入
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: '用户名和密码不能为空'
      });
    }

    // 查找管理员
    const admin = adminUsers.find(user => user.username === username && user.isActive);
    if (!admin) {
      logger.warn(`Failed login attempt for username: ${username}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: '用户名或密码错误'
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, admin.password);
    if (!isValidPassword) {
      logger.warn(`Failed login attempt for username: ${username}`);
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: '用户名或密码错误'
      });
    }

    // 更新最后登录时间
    admin.lastLoginAt = new Date();

    // 设置会话
    req.session.adminId = admin.id;
    req.session.username = admin.username;
    req.session.role = admin.role;
    req.session.loginTime = new Date();

    logger.info(`Admin ${admin.username} logged in successfully`);

    res.json({
      success: true,
      message: '登录成功',
      data: {
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          lastLoginAt: admin.lastLoginAt
        }
      }
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '登录过程中发生错误'
    });
  }
});

// 管理员登出
router.get('/logout', (req: Request, res: Response) => {
  try {
    const username = req.session?.username;
    
    // 销毁会话
    req.session?.destroy((err) => {
      if (err) {
        logger.error('Session destruction error:', err);
        return res.status(500).json({
          success: false,
          error: 'Logout failed',
          message: '登出过程中发生错误'
        });
      }

      logger.info(`Admin ${username} logged out successfully`);
      res.json({
        success: true,
        message: '登出成功'
      });
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '登出过程中发生错误'
    });
  }
});

// 获取当前管理员信息
router.get('/profile', (req: Request, res: Response) => {
  try {
    if (!req.session?.adminId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: '请先登录'
      });
    }

    const admin = adminUsers.find(user => user.id === req.session.adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'Admin not found',
        message: '管理员不存在'
      });
    }

    res.json({
      success: true,
      data: {
        admin: {
          id: admin.id,
          username: admin.username,
          email: admin.email,
          role: admin.role,
          lastLoginAt: admin.lastLoginAt
        }
      }
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '获取管理员信息时发生错误'
    });
  }
});

// 检查登录状态
router.get('/check-auth', (req: Request, res: Response) => {
  try {
    if (!req.session?.adminId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: '未登录'
      });
    }

    res.json({
      success: true,
      message: '已登录',
      data: {
        isAuthenticated: true,
        admin: {
          id: req.session.adminId,
          username: req.session.username,
          role: req.session.role,
          loginTime: req.session.loginTime
        }
      }
    });
  } catch (error) {
    logger.error('Check auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '检查登录状态时发生错误'
    });
  }
});

export default router; 