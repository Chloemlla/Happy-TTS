import { Request, Response } from 'express';
import { ShortUrlService } from '../services/shortUrlService';
import logger from '../utils/logger';

export class ShortUrlController {
  /**
   * 重定向到目标URL
   */
  static async redirectToTarget(req: Request, res: Response) {
    try {
      const { code } = req.params;
      
      // 输入验证
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        logger.warn('无效的短链代码', { code });
        return res.status(400).json({ error: '无效的短链代码' });
      }
      
      const trimmedCode = code.trim();
      
      // 验证代码格式
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        logger.warn('短链代码格式无效', { code: trimmedCode });
        return res.status(400).json({ error: '无效的短链代码格式' });
      }
      
      logger.info('收到短链访问请求', { code: trimmedCode, ip: req.ip });
      
      const shortUrl = await ShortUrlService.getShortUrlByCode(trimmedCode);
      if (!shortUrl) {
        logger.warn('短链不存在', { code: trimmedCode });
        return res.status(404).json({ error: '短链不存在' });
      }
      
      logger.info('短链重定向成功', { code: trimmedCode, target: shortUrl.target });
      res.redirect(shortUrl.target);
    } catch (error) {
      logger.error('短链重定向失败:', error);
      res.status(500).json({ error: '重定向失败' });
    }
  }

  /**
   * 获取用户的短链列表
   */
  static async getUserShortUrls(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        return res.status(401).json({ error: '未登录或用户ID无效' });
      }

      // 输入验证和清理
      const page = Math.max(1, parseInt(String(req.query.page || '1')) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '10')) || 10));

      const result = await ShortUrlService.getUserShortUrls(userId.trim(), page, limit);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('获取用户短链列表失败:', error);
      res.status(500).json({ error: '获取短链列表失败' });
    }
  }

  /**
   * 删除短链
   */
  static async deleteShortUrl(req: Request, res: Response) {
    try {
      const { code } = req.params;
      const userId = (req as any).user?.id;

      // 输入验证
      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        return res.status(400).json({ error: '无效的短链代码' });
      }
      
      const trimmedCode = code.trim();
      
      // 验证代码格式
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedCode)) {
        return res.status(400).json({ error: '无效的短链代码格式' });
      }

      const success = await ShortUrlService.deleteShortUrl(trimmedCode, userId);
      if (!success) {
        return res.status(404).json({ error: '短链不存在或无权限删除' });
      }

      res.json({
        success: true,
        message: '短链删除成功'
      });
    } catch (error) {
      logger.error('删除短链失败:', error);
      res.status(500).json({ error: '删除短链失败' });
    }
  }

  /**
   * 批量删除短链
   */
  static async batchDeleteShortUrls(req: Request, res: Response) {
    try {
      const { codes } = req.body;
      const userId = (req as any).user?.id;

      // 输入验证
      if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ error: '请提供要删除的短链代码列表' });
      }

      // 验证代码列表
      const validCodes = codes.filter(code => 
        typeof code === 'string' && 
        code.trim().length > 0 && 
        /^[a-zA-Z0-9_-]+$/.test(code.trim())
      );

      if (validCodes.length === 0) {
        return res.status(400).json({ error: '没有有效的短链代码' });
      }

      // 限制批量删除的数量
      if (validCodes.length > 100) {
        return res.status(400).json({ error: '批量删除数量不能超过100个' });
      }

      const deletedCount = await ShortUrlService.batchDeleteShortUrls(validCodes, userId);
      
      res.json({
        success: true,
        message: `成功删除 ${deletedCount} 个短链`,
        data: { deletedCount }
      });
    } catch (error) {
      logger.error('批量删除短链失败:', error);
      res.status(500).json({ error: '批量删除短链失败' });
    }
  }
} 