import { TurnstileService } from './turnstileService';
import logger from '../utils/logger';

class SchedulerService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * 启动定时任务
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('定时任务已在运行中');
      return;
    }

    this.isRunning = true;
    
    // 每5分钟清理一次过期的临时指纹
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredFingerprints();
      } catch (error) {
        logger.error('定时清理过期指纹失败:', error);
      }
    }, 5 * 60 * 1000); // 5分钟

    logger.info('定时任务服务已启动');
    
    // 启动后立即执行一次清理
    this.cleanupExpiredFingerprints().catch(error => {
      logger.error('初始清理过期指纹失败:', error);
    });
  }

  /**
   * 停止定时任务
   */
  public stop(): void {
    if (!this.isRunning) {
      logger.warn('定时任务未在运行');
      return;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
    logger.info('定时任务服务已停止');
  }

  /**
   * 清理过期的临时指纹
   */
  private async cleanupExpiredFingerprints(): Promise<void> {
    try {
      const deletedCount = await TurnstileService.cleanupExpiredFingerprints();
      
      if (deletedCount > 0) {
        logger.info(`定时清理完成，删除了 ${deletedCount} 条过期指纹记录`);
      } else {
        logger.debug('定时清理完成，没有过期指纹需要清理');
      }
    } catch (error) {
      logger.error('清理过期指纹失败:', error);
    }
  }

  /**
   * 获取服务状态
   */
  public getStatus(): { isRunning: boolean; lastCleanup?: Date } {
    return {
      isRunning: this.isRunning,
    };
  }

  /**
   * 手动触发清理
   */
  public async manualCleanup(): Promise<{ success: boolean; deletedCount: number; error?: string }> {
    try {
      const deletedCount = await TurnstileService.cleanupExpiredFingerprints();
      logger.info(`手动清理完成，删除了 ${deletedCount} 条过期指纹记录`);
      
      return {
        success: true,
        deletedCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('手动清理失败:', error);
      
      return {
        success: false,
        deletedCount: 0,
        error: errorMessage,
      };
    }
  }
}

// 创建单例实例
const schedulerService = new SchedulerService();

export { schedulerService }; 