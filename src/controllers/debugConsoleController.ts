import { Request, Response } from 'express';
import { debugConsoleService } from '../services/debugConsoleService';
import logger from '../utils/logger';

// 管理员权限检查函数
function isAdmin(req: Request): boolean {
  return !!(req.user && req.user.role === 'admin');
}

export class DebugConsoleController {
  /**
   * POST /api/debug-console/verify - 验证调试控制台访问
   */
  public static async verifyAccess(req: Request, res: Response) {
    try {
      const { keySequence, verificationCode } = req.body;
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';
      const userId = (req as any).user?.id;

      if (!keySequence || !verificationCode) {
        return res.status(400).json({
          success: false,
          error: '缺少必要参数'
        });
      }

      const result = await debugConsoleService.verifyAccess(
        keySequence,
        verificationCode,
        ip,
        userAgent,
        userId
      );

      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          config: {
            enabled: result.config?.enabled,
            maxAttempts: result.config?.maxAttempts,
            lockoutDuration: result.config?.lockoutDuration
          }
        });
      } else {
        res.status(401).json({
          success: false,
          error: result.message,
          attempts: result.attempts,
          lockoutUntil: result.lockoutUntil
        });
      }
    } catch (error) {
      logger.error('调试控制台验证失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * GET /api/debug-console/configs - 获取配置列表（管理员）
   */
  public static async getConfigs(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台配置访问权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const configs = await debugConsoleService.getConfigs();
      res.json({
        success: true,
        data: configs
      });
    } catch (error) {
      logger.error('获取调试控制台配置失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * GET /api/debug-console/configs/encrypted - 获取加密配置列表（管理员）
   */
  public static async getEncryptedConfigs(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台加密配置访问权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      // 获取用户token作为加密密钥
      const token = (req as any).user?.token || req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({
          success: false,
          error: '缺少认证token'
        });
      }

      const result = await debugConsoleService.getEncryptedConfigs(token);
      
      if (result.success) {
        res.json({
          success: true,
          data: result.encryptedData,
          iv: result.iv
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || '获取加密配置失败'
        });
      }
    } catch (error) {
      logger.error('获取调试控制台加密配置失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * PUT /api/debug-console/configs/:group - 更新配置（管理员）
   */
  public static async updateConfig(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台配置更新权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip,
          group: req.params.group
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const { group } = req.params;
      const updates = req.body;

      if (!group) {
        return res.status(400).json({
          success: false,
          error: '缺少配置组名'
        });
      }

      const result = await debugConsoleService.updateConfig(group, updates);
      
      if (result) {
        res.json({
          success: true,
          data: result,
          message: '配置更新成功'
        });
      } else {
        res.status(500).json({
          success: false,
          error: '配置更新失败'
        });
      }
    } catch (error) {
      logger.error('更新调试控制台配置失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * DELETE /api/debug-console/configs/:group - 删除配置（管理员）
   */
  public static async deleteConfig(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台配置删除权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip,
          group: req.params.group
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const { group } = req.params;

      if (!group) {
        return res.status(400).json({
          success: false,
          error: '缺少配置组名'
        });
      }

      const result = await debugConsoleService.deleteConfig(group);
      
      if (result) {
        res.json({
          success: true,
          message: '配置删除成功'
        });
      } else {
        res.status(404).json({
          success: false,
          error: '配置不存在'
        });
      }
    } catch (error) {
      logger.error('删除调试控制台配置失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * GET /api/debug-console/logs - 获取访问日志（管理员）
   */
  public static async getAccessLogs(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台访问日志权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const filters = {
        ip: req.query.ip as string,
        success: req.query.success !== undefined ? req.query.success === 'true' : undefined,
        userId: req.query.userId as string,
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined
      };

      const result = await debugConsoleService.getAccessLogs(page, limit, filters);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('获取调试控制台访问日志失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * POST /api/debug-console/init - 初始化默认配置（管理员）
   */
  public static async initDefaultConfig(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台默认配置初始化权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const defaultConfig = {
        enabled: true,
        keySequence: '91781145',
        verificationCode: '123456',
        maxAttempts: 5,
        lockoutDuration: 30 * 60 * 1000, // 30分钟
        group: 'default'
      };

      const result = await debugConsoleService.updateConfig('default', defaultConfig);
      
      if (result) {
        res.json({
          success: true,
          data: result,
          message: '默认配置初始化成功'
        });
      } else {
        res.status(500).json({
          success: false,
          error: '默认配置初始化失败'
        });
      }
    } catch (error) {
      logger.error('初始化调试控制台默认配置失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * DELETE /api/debug-console/logs/:logId - 删除单个访问日志（管理员）
   */
  public static async deleteAccessLog(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台删除访问日志权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip,
          logId: req.params.logId
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const { logId } = req.params;

      if (!logId) {
        return res.status(400).json({
          success: false,
          error: '缺少日志ID'
        });
      }

      const result = await debugConsoleService.deleteAccessLog(logId);
      
      if (result) {
        res.json({
          success: true,
          message: '访问日志删除成功'
        });
      } else {
        res.status(404).json({
          success: false,
          error: '访问日志不存在'
        });
      }
    } catch (error) {
      logger.error('删除调试控制台访问日志失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * DELETE /api/debug-console/logs - 批量删除访问日志（管理员）
   */
  public static async deleteAccessLogs(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台批量删除访问日志权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const { logIds } = req.body;

      if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: '缺少要删除的日志ID列表'
        });
      }

      const result = await debugConsoleService.deleteAccessLogs(logIds);
      
      if (result.success) {
        res.json({
          success: true,
          message: `成功删除 ${result.deletedCount} 条访问日志`,
          deletedCount: result.deletedCount
        });
      } else {
        res.status(500).json({
          success: false,
          error: '批量删除访问日志失败',
          details: result.errors
        });
      }
    } catch (error) {
      logger.error('批量删除调试控制台访问日志失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * DELETE /api/debug-console/logs/all - 删除所有访问日志（管理员）
   */
  public static async deleteAllAccessLogs(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台删除所有访问日志权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const result = await debugConsoleService.deleteAllAccessLogs();
      
      if (result.success) {
        res.json({
          success: true,
          message: `成功删除所有访问日志（共 ${result.deletedCount} 条）`,
          deletedCount: result.deletedCount
        });
      } else {
        res.status(500).json({
          success: false,
          error: '删除所有访问日志失败',
          details: result.error
        });
      }
    } catch (error) {
      logger.error('删除所有调试控制台访问日志失败:', error);
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }

  /**
   * DELETE /api/debug-console/logs/filter - 根据条件删除访问日志（管理员）
   */
  public static async deleteAccessLogsByFilter(req: Request, res: Response) {
    try {
      // 管理员权限检查
      if (!isAdmin(req)) {
        logger.warn('调试控制台根据条件删除访问日志权限检查失败：非管理员用户', {
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip
        });
        return res.status(403).json({ 
          success: false,
          error: '需要管理员权限' 
        });
      }

      const result = await debugConsoleService.deleteAccessLogsByFilter(req.body);
      
      if (result.success) {
        res.json({
          success: true,
          message: `根据条件成功删除 ${result.deletedCount} 条访问日志`,
          deletedCount: result.deletedCount
        });
      } else {
        res.status(500).json({
          success: false,
          error: '根据条件删除访问日志失败',
          details: result.error
        });
      }
    } catch (error) {
      logger.error('根据条件删除调试控制台访问日志失败:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        body: req.body,
        user: req.user?.id
      });
      res.status(500).json({
        success: false,
        error: '服务器内部错误'
      });
    }
  }
} 