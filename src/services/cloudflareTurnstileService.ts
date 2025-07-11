import axios from 'axios';
import { config } from '../config/config';
import logger from '../utils/logger';
import { enableTurnstile } from '../config';

interface TurnstileResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export class CloudflareTurnstileService {
  private static readonly VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  /**
   * 验证 Cloudflare Turnstile token
   * @param token 前端返回的 token
   * @param remoteIp 用户 IP 地址
   * @returns 验证结果
   */
  public static async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    try {
      // 如果未启用Turnstile，直接跳过
      if (!enableTurnstile) {
        logger.warn('Cloudflare Turnstile 校验已禁用，直接跳过');
        return true;
      }
      // 如果没有配置密钥，跳过验证（开发环境）
      if (!config.cloudflareTurnstile.secretKey) {
        logger.warn('Cloudflare Turnstile 密钥未配置，跳过验证');
        return true;
      }

      if (!token) {
        logger.warn('Cloudflare Turnstile token 为空');
        return false;
      }

      const formData = new URLSearchParams();
      formData.append('secret', config.cloudflareTurnstile.secretKey);
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
        logger.warn('Cloudflare Turnstile 验证失败', {
          errorCodes: result['error-codes'],
          remoteIp,
          timestamp: result.challenge_ts,
          hostname: result.hostname,
        });
        return false;
      }

      logger.info('Cloudflare Turnstile 验证成功', {
        remoteIp,
        timestamp: result.challenge_ts,
        hostname: result.hostname,
      });

      return true;
    } catch (error) {
      logger.error('Cloudflare Turnstile 验证请求失败', {
        error: error instanceof Error ? error.message : 'Unknown error',
        remoteIp,
      });
      return false;
    }
  }

  /**
   * 检查是否启用了 Cloudflare Turnstile
   */
  public static isEnabled(): boolean {
    return enableTurnstile && !!config.cloudflareTurnstile.secretKey;
  }
} 