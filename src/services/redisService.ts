import { createClient, type RedisClientType } from "redis";
import logger from "../utils/logger";

/**
 * Redis 服务
 * 用于缓存和存储临时数据，包括 IP 封禁信息
 */
class RedisService {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private isEnabled: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化 Redis 连接
   */
  private async initialize(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL;

      if (!redisUrl) {
        logger.info("📦 Redis URL 未配置，IP封禁将使用 MongoDB 存储");
        this.isEnabled = false;
        return;
      }

      logger.info("🔄 正在连接 Redis...");

      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error("❌ Redis 重连次数超过限制，停止重连");
              return new Error("Redis 重连失败");
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      // 错误处理
      this.client.on("error", (err) => {
        logger.error("❌ Redis 错误:", err);
        this.isConnected = false;
      });

      // 连接成功
      this.client.on("connect", () => {
        logger.info("✅ Redis 连接成功");
        this.isConnected = true;
        this.isEnabled = true;
      });

      // 断开连接
      this.client.on("disconnect", () => {
        logger.warn("⚠️ Redis 断开连接");
        this.isConnected = false;
      });

      // 重新连接
      this.client.on("reconnecting", () => {
        logger.info("🔄 Redis 正在重新连接...");
      });

      await this.client.connect();
    } catch (error) {
      logger.error("❌ Redis 初始化失败:", error);
      this.isEnabled = false;
      this.isConnected = false;
    }
  }

  /**
   * 检查 Redis 是否可用
   */
  public isAvailable(): boolean {
    return this.isEnabled && this.isConnected && this.client !== null;
  }

  /**
   * 添加 IP 到封禁列表
   * @param ip IP 地址
   * @param reason 封禁原因
   * @param durationMinutes 封禁时长（分钟）
   * @param metadata 额外元数据
   */
  public async banIP(
    ip: string,
    reason: string,
    durationMinutes: number,
    metadata?: {
      fingerprint?: string;
      userAgent?: string;
      violationCount?: number;
    },
  ): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const key = `ipban:${ip}`;
      const expiresAt = Date.now() + durationMinutes * 60 * 1000;

      const data = {
        ip,
        reason,
        bannedAt: Date.now(),
        expiresAt,
        ...metadata,
      };

      // 存储封禁信息
      await this.client?.set(key, JSON.stringify(data), {
        PX: durationMinutes * 60 * 1000, // 设置过期时间（毫秒）
      });

      logger.info(`🚫 [Redis] IP 已封禁: ${ip}, 原因: ${reason}, 时长: ${durationMinutes}分钟`);
      return true;
    } catch (error) {
      logger.error("❌ [Redis] 封禁 IP 失败:", error);
      return false;
    }
  }

  /**
   * 检查 IP 是否被封禁
   * @param ip IP 地址
   * @returns 封禁信息，如果未封禁则返回 null
   */
  public async checkIPBan(ip: string): Promise<{
    ip: string;
    reason: string;
    bannedAt: number;
    expiresAt: number;
    fingerprint?: string;
    userAgent?: string;
    violationCount?: number;
  } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const key = `ipban:${ip}`;
      const data = await this.client?.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data);
    } catch (error) {
      logger.error("❌ [Redis] 检查 IP 封禁失败:", error);
      return null;
    }
  }

  /**
   * 解除 IP 封禁
   * @param ip IP 地址
   */
  public async unbanIP(ip: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const key = `ipban:${ip}`;
      const result = await this.client?.del(key);

      if (result && result > 0) {
        logger.info(`✅ [Redis] IP 已解封: ${ip}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("❌ [Redis] 解封 IP 失败:", error);
      return false;
    }
  }

  /**
   * 获取所有被封禁的 IP 列表
   */
  public async getAllBannedIPs(): Promise<
    Array<{
      ip: string;
      reason: string;
      bannedAt: number;
      expiresAt: number;
      fingerprint?: string;
      userAgent?: string;
      violationCount?: number;
    }>
  > {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const keys = await this.client?.keys("ipban:*");
      const bannedIPs = [];

      for (const key of keys ?? []) {
        const data = await this.client?.get(key);
        if (data) {
          bannedIPs.push(JSON.parse(data));
        }
      }

      return bannedIPs;
    } catch (error) {
      logger.error("❌ [Redis] 获取封禁 IP 列表失败:", error);
      return [];
    }
  }

  /**
   * 清理所有过期的封禁记录（Redis 会自动处理，此方法用于手动清理）
   */
  public async cleanupExpiredBans(): Promise<number> {
    if (!this.isAvailable()) {
      return 0;
    }

    try {
      const keys = await this.client?.keys("ipban:*");
      let cleaned = 0;

      for (const key of keys ?? []) {
        const data = await this.client?.get(key);
        if (data) {
          const ban = JSON.parse(data);
          if (ban.expiresAt < Date.now()) {
            await this.client?.del(key);
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        logger.info(`🧹 [Redis] 清理了 ${cleaned} 个过期的封禁记录`);
      }

      return cleaned;
    } catch (error) {
      logger.error("❌ [Redis] 清理过期封禁记录失败:", error);
      return 0;
    }
  }

  /**
   * 关闭 Redis 连接
   */
  public async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        logger.info("👋 Redis 连接已关闭");
      } catch (error) {
        logger.error("❌ 关闭 Redis 连接失败:", error);
      }
    }
  }
}

// 导出单例
export const redisService = new RedisService();
