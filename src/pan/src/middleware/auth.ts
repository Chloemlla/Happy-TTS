import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '@/types';
import { logger } from '@/utils/logger';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // 检查会话是否存在
    if (!req.session || !(req.session as any).adminId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: '请先登录'
      });
    }

    // 这里可以添加额外的验证逻辑，比如检查管理员是否仍然有效
    // 暂时直接通过，后续可以添加数据库验证

    logger.info(`Admin ${(req.session as any).username} accessed ${req.method} ${req.path}`);
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '认证过程中发生错误'
    });
  }
};

export const adminRoleMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session || (req.session as any).role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '权限不足'
      });
    }
    next();
  } catch (error) {
    logger.error('Admin role middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '权限验证过程中发生错误'
    });
  }
};

export const superAdminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.session || (req.session as any).role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: '需要超级管理员权限'
      });
    }
    next();
  } catch (error) {
    logger.error('Super admin middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: '权限验证过程中发生错误'
    });
  }
};