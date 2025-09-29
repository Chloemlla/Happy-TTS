import { TurnstileService } from './turnstileService';
import { GitHubBillingService } from './githubBillingService';
import { cleanupExpiredIPData, getIPDataStats } from './ip';
import logger from '../utils/logger';

class SchedulerService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  public start(): void {
    if (this.isRunning) {
      logger.warn('定时任务服务已在运行中');
      return;
    }

    this.isRunning = true;
    
    // 启动时先执行一次清理任务
    logger.info('定时任务服务启动中，执行初始清理...');
    this.cleanupExpiredData().then(() => {
      logger.info('初始清理完成');
    }).catch((error) => {
      logger.error('初始清理失败', error);
    });
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredData();
    }, 5 * 60 * 1000); // 每5分钟执行一次

    logger.info('定时任务服务已启动，每5分钟清理一次过期数据');
  }

  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    logger.info('定时任务服务已停止');
  }

  private async cleanupExpiredData(): Promise<void> {
    try {
      // 清理过期的临时指纹
      const fingerprintCount = await TurnstileService.cleanupExpiredFingerprints();
      
      // 清理过期的访问密钥
      const accessTokenCount = await TurnstileService.cleanupExpiredAccessTokens();

      // 清理过期的IP封禁记录
      const ipBanCount = await TurnstileService.cleanupExpiredIpBans();

      // 清理过期的IP信息数据
      const ipDataCount = await cleanupExpiredIPData();

      // 清理过期的GitHub Billing缓存
      await GitHubBillingService.clearExpiredCache();

      if (fingerprintCount > 0 || accessTokenCount > 0 || ipBanCount > 0 || ipDataCount > 0) {
        logger.info(`定时清理完成: 临时指纹 ${fingerprintCount} 条, 访问密钥 ${accessTokenCount} 条, IP封禁 ${ipBanCount} 条, IP数据 ${ipDataCount} 条`);
      }

      this.lastCleanup = new Date();
    } catch (error) {
      logger.error('定时清理任务失败', error);
    }
  }

  public getStatus(): { isRunning: boolean; lastCleanup?: Date } {
    return {
      isRunning: this.isRunning,
      lastCleanup: this.lastCleanup
    };
  }

  public async manualCleanup(): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    try {
      const fingerprintCount = await TurnstileService.cleanupExpiredFingerprints();
      const accessTokenCount = await TurnstileService.cleanupExpiredAccessTokens();
      const ipBanCount = await TurnstileService.cleanupExpiredIpBans();
      
      // 清理过期的IP信息数据
      const ipDataCount = await cleanupExpiredIPData();
      
      // 清理GitHub Billing缓存
      await GitHubBillingService.clearExpiredCache();
      
      const totalCount = fingerprintCount + accessTokenCount + ipBanCount + ipDataCount;

      logger.info(`手动清理完成: 临时指纹 ${fingerprintCount} 条, 访问密钥 ${accessTokenCount} 条, IP封禁 ${ipBanCount} 条, IP数据 ${ipDataCount} 条`);

      return {
        success: true,
        deletedCount: totalCount
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('手动清理失败', error);
      return {
        success: false,
        deletedCount: 0,
        error: errorMessage
      };
    }
  }

  private lastCleanup?: Date;
}

const schedulerService = new SchedulerService();
export { schedulerService }; 