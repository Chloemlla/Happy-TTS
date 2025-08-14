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
      const nonce = service.issueNonce();
      res.json({ success: true, nonce });
    } catch (e) {
      logger.error('[SmartHumanCheck] issueNonce error', e);
      res.status(500).json({ success: false, error: 'server_error' });
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
        return res.status(400).json({ success: false, error: 'missing_token' });
      }
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const result = service.verifyToken(token, ip);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (e) {
      logger.error('[SmartHumanCheck] verifyToken error', e);
      res.status(500).json({ success: false, error: 'server_error' });
    }
  }
}

export default SmartHumanCheckController;
