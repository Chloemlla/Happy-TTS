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
      
      logger.info('收到短链访问请求', { code, ip: req.ip });
      
      const shortUrl = await ShortUrlService.getShortUrlByCode(code);
      if (!shortUrl) {
        logger.warn('短链不存在', { code });
        return res.status(404).json({ error: '短链不存在' });
      }
      
      logger.info('短链重定向成功', { code, target: shortUrl.target });
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
      if (!userId) {
        return res.status(401).json({ error: '未登录' });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await ShortUrlService.getUserShortUrls(userId, page, limit);
      
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

      const success = await ShortUrlService.deleteShortUrl(code, userId);
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

      if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ error: '请提供要删除的短链代码列表' });
      }

      const deletedCount = await ShortUrlService.batchDeleteShortUrls(codes, userId);
      
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