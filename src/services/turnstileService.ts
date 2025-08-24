import axios from 'axios';
import { config } from '../config/config';
import logger from '../utils/logger';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export class TurnstileService {
  private static readonly VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  /**
   * 验证 Turnstile token
   * @param token 前端返回的 token
   * @param remoteIp 用户 IP 地址
   * @returns 验证结果
   */
  public static async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    try {
      // 检查是否配置了密钥
      if (!config.turnstile?.secretKey) {
        logger.warn('Turnstile 密钥未配置，跳过验证');
        return true;
      }

      if (!token) {
        logger.warn('Turnstile token 为空');
        return false;
      }

      const formData = new URLSearchParams();
      formData.append('secret', config.turnstile.secretKey);
      formData.append('response', token);
      
      if (remoteIp) {
        formData.append('remoteip', remoteIp);
      }

      const response = await axios.post<TurnstileResponse>(
        this.VERIFY_URL,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000, // 10秒超时
        }
      );

      const result = response.data;

      if (!result.success) {
        logger.warn('Turnstile 验证失败', {
          errorCodes: result['error-codes'],
          remoteIp,
          timestamp: result.challenge_ts,
          hostname: result.hostname,
        });
        return false;
      }

      logger.info('Turnstile 验证成功', {
        remoteIp,
        timestamp: result.challenge_ts,
        hostname: result.hostname,
      });

      return true;
    } catch (error) {
      logger.error('Turnstile 验证请求失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        remoteIp,
      });
      return false;
    }
  }

  /**
   * 检查是否启用了 Turnstile
   */
  public static isEnabled(): boolean {
    return !!config.turnstile?.secretKey;
  }
} 