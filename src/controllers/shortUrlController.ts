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

  /**
   * 导出所有短链数据（管理员功能）
   */
  static async exportAllShortUrls(req: Request, res: Response) {
    try {
      const result = await ShortUrlService.exportAllShortUrls();

      if (result.count === 0) {
        return res.status(404).json({
          success: false,
          error: '没有短链数据可以导出'
        });
      }

      // 如果服务层启用了加密：返回可下载的加密文本附件（包含 IV 与 Base64 密文）
      if ((result as any).encrypted) {
        const fileNameEnc = `短链数据_${new Date().toISOString().split('T')[0]}.enc.txt`;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileNameEnc)}"`);
        res.setHeader('Cache-Control', 'no-cache');

        // 生成一个简单的离线解密所需信息文件（文本格式）
        const iv = (result as any).iv;
        const cipher = result.content; // base64
        const body = [
          '# ShortUrl Export (Encrypted)',
          `IV: ${iv}`,
          'Ciphertext-Base64:',
          cipher
        ].join('\n');

        logger.info('导出所有短链数据（加密附件）成功', { count: result.count });
        return res.send(body);
      }

      // 未加密：返回可下载的明文文件
      const filename = `短链数据_${new Date().toISOString().split('T')[0]}.txt`;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Cache-Control', 'no-cache');

      logger.info('导出所有短链数据成功', { count: result.count });

      res.send(result.content);
    } catch (error) {
      logger.error('导出所有短链数据失败:', error);
      res.status(500).json({ error: '导出短链数据失败' });
    }
  }

  /**
   * 删除所有短链数据（管理员功能）
   */
  static async deleteAllShortUrls(req: Request, res: Response) {
    try {
      const result = await ShortUrlService.deleteAllShortUrls();

      logger.info('删除所有短链数据成功', { count: result.deletedCount });

      res.json({
        success: true,
        message: `成功删除 ${result.deletedCount} 个短链`,
        data: { deletedCount: result.deletedCount }
      });
    } catch (error) {
      logger.error('删除所有短链数据失败:', error);
      res.status(500).json({ error: '删除所有短链数据失败' });
    }
  }

  /**
   * 导入短链数据（管理员功能）
   */
  static async importShortUrls(req: Request, res: Response) {
    try {
      const { content } = req.body;

      // 输入验证
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: '请提供要导入的数据内容' });
      }

      const result = await ShortUrlService.importShortUrls(content.trim());

      logger.info('导入短链数据成功', {
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount
      });

      res.json({
        success: true,
        message: `导入完成：成功导入 ${result.importedCount} 个，跳过重复 ${result.skippedCount} 个，错误 ${result.errorCount} 个`,
        importedCount: result.importedCount,
        skippedCount: result.skippedCount,
        errorCount: result.errorCount,
        errors: result.errors
      });
    } catch (error) {
      logger.error('导入短链数据失败:', error);
      res.status(500).json({ error: '导入短链数据失败' });
    }
  }
}