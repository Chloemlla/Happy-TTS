import { createClient } from "redis";
import logger from "../utils/logger";

/**
 * NonceStore - 管理 nonce 的生命周期和消费状态
 *
 * 功能：
 * - 存储已发放的 nonce
 * - 跟踪 nonce 的消费状态
 * - 自动清理过期的 nonce
 * - 防止 nonce 重复使用
 */

export interface NonceRecord {
  id: string; // nonce 唯一标识
  issuedAt: number; // 发放时间戳
  consumedAt?: number; // 消费时间戳
  clientIp?: string; // 客户端 IP
  userAgent?: string; // 用户代理
  metadata?: Record<string, unknown>; // 调用方附加的绑定/风控元数据
}

export interface NonceStoreConfig {
  maxSize?: number; // 最大存储数量
  cleanupInterval?: number; // 清理间隔（毫秒）
  ttlMs?: number; // nonce 有效期
  namespace?: string; // 本地单例命名空间，避免不同业务共享 TTL
  redisPrefix?: string; // Redis key 前缀
  redisEnabled?: boolean; // 是否允许异步 Redis backing store
}

const createNonceRedisClient = (url: string) => createClient({ url });
type RedisClientInstance = ReturnType<typeof createNonceRedisClient>;

const REDIS_CONSUME_SCRIPT = `
local record = redis.call("GET", KEYS[1])
if record then
  redis.call("DEL", KEYS[1])
  local data = cjson.decode(record)
  data["consumedAt"] = tonumber(ARGV[1])
  local consumed = cjson.encode(data)
  redis.call("SET", KEYS[2], consumed, "PX", ARGV[2])
  return {1, consumed}
end
if redis.call("EXISTS", KEYS[2]) == 1 then
  return {0, "nonce_already_consumed", redis.call("GET", KEYS[2])}
end
return {0, "nonce_not_found"}
`;

class RedisNonceClientFactory {
  private static client: RedisClientInstance | null = null;
  private static clientPromise: Promise<RedisClientInstance | null> | null = null;
  private static warnedUnavailable = false;

  static async getClient(): Promise<RedisClientInstance | null> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;
    if (process.env.SMART_HUMAN_CHECK_NONCE_STORE === "memory") return null;
    if (RedisNonceClientFactory.client?.isOpen) return RedisNonceClientFactory.client;
    if (RedisNonceClientFactory.clientPromise) return RedisNonceClientFactory.clientPromise;

    RedisNonceClientFactory.clientPromise = (async () => {
      try {
        const client = createNonceRedisClient(redisUrl);
        client.on("error", (error) => {
          logger.error("[NonceStore][Redis] Redis error", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        await client.connect();
        RedisNonceClientFactory.client = client;
        logger.info("[NonceStore] Using Redis backing store for async nonce operations");
        return client;
      } catch (error) {
        if (!RedisNonceClientFactory.warnedUnavailable) {
          logger.warn("[NonceStore] Redis unavailable, falling back to in-memory nonce store", {
            error: error instanceof Error ? error.message : String(error),
          });
          RedisNonceClientFactory.warnedUnavailable = true;
        }
        return null;
      } finally {
        RedisNonceClientFactory.clientPromise = null;
      }
    })();

    return RedisNonceClientFactory.clientPromise;
  }
}

export class NonceStore {
  private store = new Map<string, NonceRecord>();
  private cleanupTimer?: NodeJS.Timeout;
  private readonly maxSize: number;
  private readonly cleanupInterval: number;
  private readonly ttlMs: number;
  private readonly redisPrefix: string;
  private readonly redisEnabled: boolean;
  private readonly consumedMarkerTtlMs: number;

  constructor(config: NonceStoreConfig = {}) {
    this.maxSize = config.maxSize || 10000;
    this.cleanupInterval = config.cleanupInterval || 60 * 1000; // 1 minute
    this.ttlMs = config.ttlMs || 5 * 60 * 1000; // 5 minutes
    this.redisPrefix = config.redisPrefix || "nonce";
    this.redisEnabled = config.redisEnabled !== false;
    this.consumedMarkerTtlMs = Math.max(this.ttlMs, 60 * 1000);

    this.startCleanupTimer();
  }

  /**
   * 存储新发放的 nonce
   */
  storeNonce(nonceId: string, clientIp?: string, userAgent?: string, metadata?: Record<string, unknown>): void {
    if (!nonceId || typeof nonceId !== "string") {
      throw new Error("无效的 nonce ID");
    }

    // 如果存储已满，先清理过期项
    if (this.store.size >= this.maxSize) {
      this.cleanup();

      // 如果清理后仍然满了，删除最旧的项
      if (this.store.size >= this.maxSize) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) {
          this.store.delete(oldestKey);
          logger.debug("[NonceStore] 因大小限制移除最旧的 nonce", {
            evictedNonceId: `${oldestKey.slice(0, 8)}...`,
            maxSize: this.maxSize,
          });
        }
      }
    }

    const record: NonceRecord = {
      id: nonceId,
      issuedAt: Date.now(),
      clientIp,
      userAgent,
      metadata,
    };

    this.store.set(nonceId, record);

    logger.debug("[NonceStore] 已存储 nonce", {
      nonceId: `${nonceId.slice(0, 8)}...`,
      clientIp,
      storeSize: this.store.size,
    });
  }

  /**
   * 异步存储 nonce。配置 REDIS_URL 时优先写入 Redis；Redis 不可用时回退到本地 Map。
   */
  async storeNonceAsync(
    nonceId: string,
    clientIp?: string,
    userAgent?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.redisEnabled) {
      this.storeNonce(nonceId, clientIp, userAgent, metadata);
      return;
    }

    const client = await RedisNonceClientFactory.getClient();
    if (!client) {
      this.storeNonce(nonceId, clientIp, userAgent, metadata);
      return;
    }

    const record: NonceRecord = {
      id: nonceId,
      issuedAt: Date.now(),
      clientIp,
      userAgent,
      metadata,
    };

    await client.set(this.activeRedisKey(nonceId), JSON.stringify(record), { PX: this.ttlMs });
  }

  /**
   * 消费 nonce（标记为已使用）
   */
  consume(nonceId: string): { success: boolean; reason?: string; record?: NonceRecord } {
    if (!nonceId || typeof nonceId !== "string") {
      return { success: false, reason: "invalid_nonce_id" };
    }

    const record = this.store.get(nonceId);

    if (!record) {
      return { success: false, reason: "nonce_not_found" };
    }

    // 检查是否已过期
    const now = Date.now();
    if (now - record.issuedAt > this.ttlMs) {
      this.store.delete(nonceId);
      logger.debug("[NonceStore] 消费时移除过期的 nonce", {
        nonceId: `${nonceId.slice(0, 8)}...`,
        age: now - record.issuedAt,
      });
      return { success: false, reason: "nonce_expired" };
    }

    // 检查是否已被消费
    if (record.consumedAt) {
      logger.warn("[NonceStore] 尝试重复使用已消费的 nonce", {
        nonceId: `${nonceId.slice(0, 8)}...`,
        originalConsumedAt: record.consumedAt,
        clientIp: record.clientIp,
      });
      return { success: false, reason: "nonce_already_consumed", record };
    }

    // 标记为已消费
    record.consumedAt = now;
    this.store.set(nonceId, record);

    logger.debug("[NonceStore] 已消费 nonce", {
      nonceId: `${nonceId.slice(0, 8)}...`,
      issuedAt: record.issuedAt,
      consumedAt: record.consumedAt,
      clientIp: record.clientIp,
    });

    return { success: true, record };
  }

  /**
   * 异步消费 nonce。Redis 路径用 Lua 脚本实现 GET+DEL+consumed marker 的原子操作。
   */
  async consumeAsync(nonceId: string): Promise<{ success: boolean; reason?: string; record?: NonceRecord }> {
    if (!nonceId || typeof nonceId !== "string") {
      return { success: false, reason: "invalid_nonce_id" };
    }
    if (!this.redisEnabled) return this.consume(nonceId);

    const client = await RedisNonceClientFactory.getClient();
    if (!client) return this.consume(nonceId);

    try {
      const result = (await (client as any).eval(REDIS_CONSUME_SCRIPT, {
        keys: [this.activeRedisKey(nonceId), this.consumedRedisKey(nonceId)],
        arguments: [String(Date.now()), String(this.consumedMarkerTtlMs)],
      })) as unknown;

      if (!Array.isArray(result)) {
        return { success: false, reason: "redis_consume_error" };
      }

      const [ok, reasonOrRecord, consumedRecord] = result;
      if (Number(ok) === 1) {
        return { success: true, record: parseNonceRecord(reasonOrRecord) };
      }

      return {
        success: false,
        reason: String(reasonOrRecord || "nonce_not_found"),
        record: consumedRecord ? parseNonceRecord(consumedRecord) : undefined,
      };
    } catch (error) {
      logger.warn("[NonceStore][Redis] consume failed, falling back to in-memory store", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.consume(nonceId);
    }
  }

  /**
   * 检查 nonce 是否存在且有效
   */
  exists(nonceId: string): boolean {
    const record = this.store.get(nonceId);
    if (!record) return false;

    const now = Date.now();
    return now - record.issuedAt <= this.ttlMs;
  }

  /**
   * 获取 nonce 记录
   */
  get(nonceId: string): NonceRecord | undefined {
    return this.store.get(nonceId);
  }

  /**
   * 清理过期的 nonce
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [nonceId, record] of this.store.entries()) {
      if (now - record.issuedAt > this.ttlMs) {
        this.store.delete(nonceId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug("[NonceStore] 已清理过期的 nonce", {
        cleanedCount,
        remainingCount: this.store.size,
      });
    }

    return cleanedCount;
  }

  async cleanupAsync(): Promise<number> {
    if (!this.redisEnabled) return this.cleanup();
    const client = await RedisNonceClientFactory.getClient();
    if (!client) return this.cleanup();
    // Redis key TTL 自动清理，保留方法用于统一接口。
    return 0;
  }

  /**
   * 获取存储统计信息
   */
  getStats(): {
    totalCount: number;
    consumedCount: number;
    activeCount: number;
    expiredCount: number;
    oldestNonceAge?: number;
    newestNonceAge?: number;
    averageAge?: number;
  } {
    const now = Date.now();
    let consumedCount = 0;
    let activeCount = 0;
    let expiredCount = 0;
    let oldestAge = 0;
    let newestAge = Number.MAX_SAFE_INTEGER;
    let totalAge = 0;

    for (const record of this.store.values()) {
      const age = now - record.issuedAt;
      totalAge += age;

      if (age > oldestAge) oldestAge = age;
      if (age < newestAge) newestAge = age;

      if (now - record.issuedAt > this.ttlMs) {
        expiredCount++;
      } else if (record.consumedAt) {
        consumedCount++;
      } else {
        activeCount++;
      }
    }

    const result: any = {
      totalCount: this.store.size,
      consumedCount,
      activeCount,
      expiredCount,
    };

    if (this.store.size > 0) {
      result.oldestNonceAge = oldestAge;
      result.newestNonceAge = newestAge === Number.MAX_SAFE_INTEGER ? 0 : newestAge;
      result.averageAge = Math.round(totalAge / this.store.size);
    }

    return result;
  }

  async getStatsAsync(): Promise<ReturnType<NonceStore["getStats"]> & { backend?: "redis" | "memory" }> {
    if (!this.redisEnabled) return { ...this.getStats(), backend: "memory" };
    const client = await RedisNonceClientFactory.getClient();
    if (!client) return { ...this.getStats(), backend: "memory" };

    const now = Date.now();
    let consumedCount = 0;
    let activeCount = 0;
    let oldestAge = 0;
    let newestAge = Number.MAX_SAFE_INTEGER;
    let totalAge = 0;

    const scan = async (pattern: string, consumed: boolean) => {
      for await (const keyOrKeys of client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
        for (const key of keys) {
          const raw = await client.get(key);
          const record = parseNonceRecord(raw);
          const age = record ? now - record.issuedAt : 0;
          if (age > oldestAge) oldestAge = age;
          if (age < newestAge) newestAge = age;
          totalAge += age;
          if (consumed) consumedCount++;
          else activeCount++;
        }
      }
    };

    await scan(`${this.redisPrefix}:active:*`, false);
    await scan(`${this.redisPrefix}:consumed:*`, true);

    const totalCount = activeCount + consumedCount;
    return {
      totalCount,
      consumedCount,
      activeCount,
      expiredCount: 0,
      oldestNonceAge: totalCount > 0 ? oldestAge : undefined,
      newestNonceAge: totalCount > 0 ? (newestAge === Number.MAX_SAFE_INTEGER ? 0 : newestAge) : undefined,
      averageAge: totalCount > 0 ? Math.round(totalAge / totalCount) : undefined,
      backend: "redis",
    };
  }

  /**
   * 启动定时清理
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * 健康检查
   */
  healthCheck(): {
    healthy: boolean;
    issues: string[];
    stats: ReturnType<NonceStore["getStats"]>;
  } {
    const stats = this.getStats();
    const issues: string[] = [];

    // 检查存储使用率
    const usageRatio = stats.totalCount / this.maxSize;
    if (usageRatio > 0.9) {
      issues.push(`Storage usage high: ${Math.round(usageRatio * 100)}%`);
    }

    // 检查过期项比例
    if (stats.totalCount > 0) {
      const expiredRatio = stats.expiredCount / stats.totalCount;
      if (expiredRatio > 0.3) {
        issues.push(`High expired nonce ratio: ${Math.round(expiredRatio * 100)}%`);
      }
    }

    // 检查清理定时器
    if (!this.cleanupTimer) {
      issues.push("清理定时器未运行");
    }

    return {
      healthy: issues.length === 0,
      issues,
      stats,
    };
  }

  /**
   * 停止定时清理
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.store.clear();
    logger.debug("[NonceStore] 已销毁存储和清理定时器");
  }

  private activeRedisKey(nonceId: string): string {
    return `${this.redisPrefix}:active:${nonceId}`;
  }

  private consumedRedisKey(nonceId: string): string {
    return `${this.redisPrefix}:consumed:${nonceId}`;
  }
}

function parseNonceRecord(raw: unknown): NonceRecord | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as NonceRecord;
  } catch {
    return undefined;
  }
}

// 单例实例。按 namespace 隔离，避免 SmartHumanCheck 与 replay protection 共享 TTL。
const nonceStoreInstances = new Map<string, NonceStore>();

export function getNonceStore(config?: NonceStoreConfig): NonceStore {
  const key = config?.namespace || "default";
  const existing = nonceStoreInstances.get(key);
  if (existing) return existing;

  const created = new NonceStore(config);
  nonceStoreInstances.set(key, created);
  return created;
}

export function destroyNonceStore(namespace?: string): void {
  if (namespace) {
    const store = nonceStoreInstances.get(namespace);
    if (store) {
      store.destroy();
      nonceStoreInstances.delete(namespace);
    }
    return;
  }

  for (const store of nonceStoreInstances.values()) {
    store.destroy();
  }
  nonceStoreInstances.clear();
}
