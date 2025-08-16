import { Request, Response } from 'express';
import SmartHumanCheckService from '../services/smartHumanCheckService';
import logger from '../utils/logger';

const service = new SmartHumanCheckService();

export class SmartHumanCheckController {
  /**
   * GET /nonce - 发放一次性 nonce（短时有效）
   */
  static async issueNonce(req: Request, res: Response) {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const userAgent = req.headers['user-agent'];
      
      const result = service.issueNonce(clientIp, userAgent);
      
      if (result.success) {
        res.json(result);
      } else {
        // 根据错误类型返回适当的 HTTP 状态码
        const statusCode = result.retryable ? 503 : 500;
        res.status(statusCode).json(result);
      }
    } catch (e) {
      logger.error('[SmartHumanCheck] issueNonce error', e);
      res.status(500).json({ 
        success: false, 
        error: 'server_error',
        errorCode: 'SERVER_ERROR',
        errorMessage: '服务器内部错误',
        retryable: true,
        timestamp: Date.now()
      });
    }
  }

  /**
   * GET /stats - 获取 nonce 存储统计信息（管理端点）
   */
  static async getStats(req: Request, res: Response) {
    try {
      const stats = service.getStats();
      res.json({
        success: true,
        stats,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[SmartHumanCheck] getStats error', e);
      res.status(500).json({ 
        success: false, 
        error: 'server_error',
        errorCode: 'SERVER_ERROR',
        errorMessage: '服务器内部错误',
        retryable: true,
        timestamp: Date.now()
      });
    }
  }

  /**
   * POST /verify - 验证前端 token
   * body: { token: string }
   */
  static async verifyToken(req: Request, res: Response) {
    try {
      const token = req.body?.token as string;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ 
          success: false, 
          error: 'missing_token',
          errorCode: 'MISSING_TOKEN',
          errorMessage: '缺少验证令牌',
          retryable: false,
          timestamp: Date.now()
        });
      }
      
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const result = service.verifyToken(token, ip);
      
      if (!result.success) {
        // 根据错误类型返回适当的 HTTP 状态码
        let statusCode = 400;
        if (result.retryable) {
          statusCode = result.errorCode === 'NONCE_EXPIRED' ? 410 : 429;
        }
        return res.status(statusCode).json(result);
      }
      
      res.json(result);
    } catch (e) {
      logger.error('[SmartHumanCheck] verifyToken error', e);
      res.status(500).json({ 
        success: false, 
        error: 'server_error',
        errorCode: 'SERVER_ERROR',
        errorMessage: '服务器内部错误',
        retryable: true,
        timestamp: Date.now()
      });
    }
  }
}

export default SmartHumanCheckController;
