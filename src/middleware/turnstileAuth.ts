import { Request, Response, NextFunction } from 'express';
import { TurnstileService } from '../services/turnstileService';
import logger from '../utils/logger';

interface TurnstileAuthRequest extends Request {
  turnstileAuth?: {
    token: string;
    fingerprint: string;
    ipAddress: string;
    verified: boolean;
  };
}

/**
 * Turnstile访问令牌验证中间件
 * 验证请求头中的Turnstile访问令牌
 */
export const authenticateTurnstileToken = async (
  req: TurnstileAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 从请求头获取访问令牌
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Turnstile认证失败：缺少Authorization头部', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.status(401).json({
        success: false,
        error: 'Turnstile access token authentication required'
      });
      return;
    }

    const token = authHeader.substring(7); // 移除 "Bearer " 前缀

    // 从请求头获取指纹和IP
    const fingerprint = req.headers['x-fingerprint'] as string;
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    if (!fingerprint) {
      logger.warn('Turnstile认证失败：缺少指纹信息', {
        ip: ipAddress,
        userAgent: req.get('User-Agent')
      });
      res.status(401).json({
        success: false,
        error: 'Turnstile fingerprint information required'
      });
      return;
    }

    // 验证访问令牌
    const isValid = await TurnstileService.verifyAccessToken(token, fingerprint, ipAddress);

    if (!isValid) {
      logger.warn('Turnstile认证失败：访问令牌无效', {
        ip: ipAddress,
        fingerprint: fingerprint.substring(0, 8) + '...',
        token: token.substring(0, 8) + '...',
        userAgent: req.get('User-Agent')
      });
      res.status(401).json({
        success: false,
        error: 'The Turnstile access token is invalid or expired'
      });
      return;
    }

    // 将认证信息附加到请求对象
    req.turnstileAuth = {
      token,
      fingerprint,
      ipAddress,
      verified: true
    };

    logger.info('Turnstile认证成功', {
      ip: ipAddress,
      fingerprint: fingerprint.substring(0, 8) + '...',
      token: token.substring(0, 8) + '...'
    });

    next();
  } catch (error) {
    logger.error('Turnstile认证中间件错误', {
      error: error instanceof Error ? error.message : String(error),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({
      success: false,
      error: '认证服务暂时不可用'
    });
  }
};

/**
 * 可选的Turnstile认证中间件
 * 如果提供了令牌则验证，否则跳过
 */
export const optionalTurnstileAuth = async (
  req: TurnstileAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // 如果没有提供认证头部，直接跳过
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    // 如果提供了认证头部，则进行验证
    await authenticateTurnstileToken(req, res, next);
  } catch (error) {
    logger.error('可选Turnstile认证中间件错误', error);
    next(); // 出错时跳过认证
  }
};

export { TurnstileAuthRequest };
