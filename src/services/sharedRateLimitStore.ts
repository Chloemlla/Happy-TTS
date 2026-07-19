import type { IncrementResponse, Options, Store } from "express-rate-limit";
import { createClient, type RedisClientType } from "redis";
import { startupConfig } from "../config/config";
import logger from "../utils/logger";
import { mongoose } from "./mongoService";

const DEFAULT_MEMORY_MAX_ENTRIES = 100_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;
const REDIS_RETRY_BACKOFF_MS = 30_000;

interface SharedRateLimitDocument {
  _id: string;
  totalHits: number;
  resetTime: Date;
  expiresAt: Date;
}

const SharedRateLimitSchema = new mongoose.Schema<SharedRateLimitDocument>(
  {
    _id: { type: String, required: true },
    totalHits: { type: Number, required: true },
    resetTime: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "shared_rate_limits", versionKey: false },
);
SharedRateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const SharedRateLimitModel =
  (mongoose.models.SharedRateLimit as mongoose.Model<SharedRateLimitDocument>) ||
  mongoose.model<SharedRateLimitDocument>("SharedRateLimit", SharedRateLimitSchema);

// Keep Redis typing aligned with redisService to avoid createClient generic variance issues.
type RedisClientInstance = RedisClientType;

type MongoCounterModel = Pick<mongoose.Model<SharedRateLimitDocument>, "findOneAndUpdate" | "deleteOne" | "deleteMany">;

export class SharedRateLimitUnavailableError extends Error {
  constructor(message = "共享限流后端不可用") {
    super(message);
    this.name = "SharedRateLimitUnavailableError";
  }
}

export class BoundedMemoryRateLimitStore implements Store {
  private static readonly globalHits = new Map<string, { totalHits: number; resetTime: Date }>();
  private static cleanupTimer: ReturnType<typeof setInterval> | null = null;

  readonly prefix: string;
  readonly localKeys = true;

  constructor(
    private readonly internalPrefix: string,
    private readonly windowMs: number,
    private readonly maxEntries = DEFAULT_MEMORY_MAX_ENTRIES,
    cleanupIntervalMs = DEFAULT_CLEANUP_INTERVAL_MS,
  ) {
    this.prefix = internalPrefix;
    if (!BoundedMemoryRateLimitStore.cleanupTimer) {
      BoundedMemoryRateLimitStore.cleanupTimer = setInterval(
        () => BoundedMemoryRateLimitStore.sweepExpired(),
        cleanupIntervalMs,
      );
      BoundedMemoryRateLimitStore.cleanupTimer.unref?.();
    }
  }

  init(_options: Options): void {}

  async increment(key: string): Promise<IncrementResponse> {
    const cacheKey = this.key(key);
    const now = Date.now();
    const entry = BoundedMemoryRateLimitStore.globalHits.get(cacheKey);

    if (entry && entry.resetTime.getTime() > now) {
      entry.totalHits += 1;
      return { totalHits: entry.totalHits, resetTime: entry.resetTime };
    }

    if (!entry && BoundedMemoryRateLimitStore.globalHits.size >= this.maxEntries) {
      BoundedMemoryRateLimitStore.sweepExpired(now);
      if (BoundedMemoryRateLimitStore.globalHits.size >= this.maxEntries) {
        this.evictEarliestExpiry();
      }
    }

    const resetTime = new Date(now + this.windowMs);
    BoundedMemoryRateLimitStore.globalHits.set(cacheKey, { totalHits: 1, resetTime });
    return { totalHits: 1, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const entry = BoundedMemoryRateLimitStore.globalHits.get(this.key(key));
    if (entry) entry.totalHits = Math.max(0, entry.totalHits - 1);
  }

  async resetKey(key: string): Promise<void> {
    BoundedMemoryRateLimitStore.globalHits.delete(this.key(key));
  }

  async resetAll(): Promise<void> {
    const prefix = `${this.internalPrefix}:`;
    for (const key of BoundedMemoryRateLimitStore.globalHits.keys()) {
      if (key.startsWith(prefix)) BoundedMemoryRateLimitStore.globalHits.delete(key);
    }
  }

  static sweepExpired(now = Date.now()): number {
    let removed = 0;
    for (const [key, value] of BoundedMemoryRateLimitStore.globalHits.entries()) {
      if (value.resetTime.getTime() <= now) {
        BoundedMemoryRateLimitStore.globalHits.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  static sizeForTests(): number {
    return BoundedMemoryRateLimitStore.globalHits.size;
  }

  static resetForTests(): void {
    BoundedMemoryRateLimitStore.globalHits.clear();
  }

  private key(key: string): string {
    return `${this.internalPrefix}:${key}`;
  }

  private evictEarliestExpiry(): void {
    let earliestKey: string | undefined;
    let earliestReset = Number.POSITIVE_INFINITY;
    for (const [key, value] of BoundedMemoryRateLimitStore.globalHits.entries()) {
      const reset = value.resetTime.getTime();
      if (reset < earliestReset) {
        earliestKey = key;
        earliestReset = reset;
      }
    }
    if (earliestKey) BoundedMemoryRateLimitStore.globalHits.delete(earliestKey);
  }
}

export class MongoRateLimitStore implements Store {
  readonly prefix: string;
  readonly localKeys = false;

  constructor(
    private readonly internalPrefix: string,
    private readonly windowMs: number,
    private readonly model: MongoCounterModel = SharedRateLimitModel,
    private readonly isAvailable: () => boolean = () => mongoose.connection.readyState === 1,
  ) {
    this.prefix = internalPrefix;
  }

  init(_options: Options): void {}

  async increment(key: string): Promise<IncrementResponse> {
    if (!this.isAvailable()) throw new SharedRateLimitUnavailableError("MongoDB 限流存储未连接");

    const now = new Date();
    const nextReset = new Date(now.getTime() + this.windowMs);
    const activeWindow = { $gt: [{ $ifNull: ["$resetTime", new Date(0)] }, now] };
    const resetExpression = { $cond: [activeWindow, "$resetTime", nextReset] };

    const updatePipeline = [
      {
        $set: {
          totalHits: {
            $cond: [activeWindow, { $add: [{ $ifNull: ["$totalHits", 0] }, 1] }, 1],
          },
          resetTime: resetExpression,
          expiresAt: resetExpression,
        },
      },
    ];

    let doc: SharedRateLimitDocument | null;
    try {
      doc = await this.model.findOneAndUpdate(
        { _id: this.key(key) },
        updatePipeline,
        { upsert: true, new: true, lean: true },
      );
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
      // 并发创建同一新 key 时唯一 _id 可能产生一次竞态；重试为普通原子更新。
      doc = await this.model.findOneAndUpdate(
        { _id: this.key(key) },
        updatePipeline,
        { upsert: false, new: true, lean: true },
      );
    }

    if (!doc) throw new SharedRateLimitUnavailableError("MongoDB 限流计数更新失败");
    return {
      totalHits: Number(doc.totalHits),
      resetTime: new Date(doc.resetTime),
    };
  }

  async decrement(key: string): Promise<void> {
    if (!this.isAvailable()) throw new SharedRateLimitUnavailableError("MongoDB 限流存储未连接");
    await this.model.findOneAndUpdate(
      { _id: this.key(key), totalHits: { $gt: 0 } },
      { $inc: { totalHits: -1 } },
      { new: false },
    );
  }

  async resetKey(key: string): Promise<void> {
    if (!this.isAvailable()) throw new SharedRateLimitUnavailableError("MongoDB 限流存储未连接");
    await this.model.deleteOne({ _id: this.key(key) });
  }

  async resetAll(): Promise<void> {
    if (!this.isAvailable()) throw new SharedRateLimitUnavailableError("MongoDB 限流存储未连接");
    const escapedPrefix = this.internalPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await this.model.deleteMany({ _id: { $regex: `^${escapedPrefix}:` } });
  }

  private key(key: string): string {
    return `${this.internalPrefix}:${key}`;
  }
}

class RedisClientFactory {
  private static client: RedisClientInstance | null = null;
  private static clientPromise: Promise<RedisClientInstance | null> | null = null;
  private static retryAfter = 0;

  static async getClient(): Promise<RedisClientInstance | null> {
    if (!startupConfig.redis.url) return null;
    if (RedisClientFactory.client?.isOpen) return RedisClientFactory.client;
    if (Date.now() < RedisClientFactory.retryAfter) return null;
    if (RedisClientFactory.clientPromise) return RedisClientFactory.clientPromise;

    RedisClientFactory.clientPromise = (async () => {
      try {
        const client = createClient({ url: startupConfig.redis.url }) as RedisClientInstance;
        client.on("error", (error) => {
          logger.error("[RateLimit][Redis] Redis error", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
        await client.connect();
        RedisClientFactory.client = client;
        RedisClientFactory.retryAfter = 0;
        logger.info("[RateLimit] Using Redis shared store");
        return client;
      } catch (error) {
        RedisClientFactory.retryAfter = Date.now() + REDIS_RETRY_BACKOFF_MS;
        logger.warn("[RateLimit] Redis unavailable", {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      } finally {
        RedisClientFactory.clientPromise = null;
      }
    })();

    return RedisClientFactory.clientPromise;
  }
}

export class RedisRateLimitStore implements Store {
  readonly prefix: string;
  readonly localKeys = false;

  constructor(
    private readonly internalPrefix: string,
    private readonly windowMs: number,
    private readonly getClient: () => Promise<RedisClientInstance | null> = () => RedisClientFactory.getClient(),
  ) {
    this.prefix = internalPrefix;
  }

  init(_options: Options): void {}

  async increment(key: string): Promise<IncrementResponse> {
    const client = await this.getClient();
    if (!client) throw new SharedRateLimitUnavailableError("Redis 限流存储不可用");

    const result = (await client.eval(
      "local n=redis.call('INCR',KEYS[1]); local ttl=redis.call('PTTL',KEYS[1]); " +
        "if n==1 or ttl<0 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); ttl=tonumber(ARGV[1]); end; " +
        "return {n,ttl}",
      { keys: [this.key(key)], arguments: [String(this.windowMs)] },
    )) as [number, number];

    return { totalHits: Number(result[0]), resetTime: new Date(Date.now() + Number(result[1])) };
  }

  async decrement(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) throw new SharedRateLimitUnavailableError("Redis 限流存储不可用");
    await client.eval(
      "local n=redis.call('DECR',KEYS[1]); if n<=0 then redis.call('DEL',KEYS[1]); end; return n",
      { keys: [this.key(key)], arguments: [] },
    );
  }

  async resetKey(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) throw new SharedRateLimitUnavailableError("Redis 限流存储不可用");
    await client.del(this.key(key));
  }

  async resetAll(): Promise<void> {
    const client = await this.getClient();
    if (!client) throw new SharedRateLimitUnavailableError("Redis 限流存储不可用");
    for await (const cacheKey of client.scanIterator({ MATCH: `${this.internalPrefix}:*`, COUNT: 100 })) {
      const keys = Array.isArray(cacheKey) ? cacheKey : [cacheKey];
      if (keys.length) await client.del(keys);
    }
  }

  private key(key: string): string {
    return `${this.internalPrefix}:${key}`;
  }
}

interface ResilientStoreOptions {
  requireSharedBackend?: boolean;
  allowMongoFallbackAfterRedisError?: boolean;
  redisStore?: Store;
  mongoStore?: Store;
  memoryStore?: Store;
  redisEnabled?: boolean;
}

export class ResilientRateLimitStore implements Store {
  readonly prefix: string;
  readonly localKeys: boolean;
  private warnedMemoryFallback = false;

  constructor(
    prefix: string,
    private readonly redisStore: Store | null,
    private readonly mongoStore: Store,
    private readonly memoryStore: Store,
    private readonly requireSharedBackend: boolean,
    private readonly allowMongoFallbackAfterRedisError: boolean,
  ) {
    this.prefix = prefix;
    // Prefer shared Redis/Mongo backends; memory is only a last-resort local fallback.
    this.localKeys = false;
  }

  init(options: Options): void {
    this.redisStore?.init?.(options);
    this.mongoStore.init?.(options);
    this.memoryStore.init?.(options);
  }

  async increment(key: string): Promise<IncrementResponse> {
    return this.run("increment", key) as Promise<IncrementResponse>;
  }

  async decrement(key: string): Promise<void> {
    await this.run("decrement", key);
  }

  async resetKey(key: string): Promise<void> {
    await this.run("resetKey", key);
  }

  async resetAll(): Promise<void> {
    await this.run("resetAll");
  }

  private async run(method: "increment", key: string): Promise<IncrementResponse>;
  private async run(method: "decrement" | "resetKey", key: string): Promise<void>;
  private async run(method: "resetAll"): Promise<void>;
  private async run(method: "increment" | "decrement" | "resetKey" | "resetAll", key?: string): Promise<unknown> {
    const call = async (store: Store): Promise<unknown> => {
      const fn = store[method] as ((key?: string) => Promise<unknown>) | undefined;
      if (!fn) return undefined;
      return fn.call(store, key);
    };

    if (this.redisStore) {
      try {
        return await call(this.redisStore);
      } catch (error) {
        if (!this.allowMongoFallbackAfterRedisError) {
          throw new SharedRateLimitUnavailableError(
            `Redis 共享限流操作失败: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        logger.warn("[RateLimit] Redis operation failed; trying MongoDB shared fallback", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      return await call(this.mongoStore);
    } catch (error) {
      if (this.requireSharedBackend) {
        throw new SharedRateLimitUnavailableError(
          `Redis/MongoDB 共享限流后端不可用: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!this.warnedMemoryFallback) {
        logger.error("[RateLimit] Shared backends unavailable; using bounded process-local fallback", {
          consistency: "per-process only",
          maxEntries: DEFAULT_MEMORY_MAX_ENTRIES,
          error: error instanceof Error ? error.message : String(error),
        });
        this.warnedMemoryFallback = true;
      }
      return call(this.memoryStore);
    }
  }
}

export function createSharedRateLimitStore(
  prefix: string,
  windowMs: number,
  options: ResilientStoreOptions = {},
): Store {
  const redisEnabled = options.redisEnabled ?? Boolean(startupConfig.redis.url);
  const redisStore = redisEnabled ? options.redisStore || new RedisRateLimitStore(prefix, windowMs) : null;
  const mongoStore = options.mongoStore || new MongoRateLimitStore(prefix, windowMs);
  const memoryStore = options.memoryStore || new BoundedMemoryRateLimitStore(prefix, windowMs);
  return new ResilientRateLimitStore(
    prefix,
    redisStore,
    mongoStore,
    memoryStore,
    options.requireSharedBackend ?? false,
    options.allowMongoFallbackAfterRedisError ?? true,
  );
}
