/**
 * KV 存储抽象层
 * 替代 fs 文件读写 + Redis
 */

/** 通用 KV 操作封装 */
export class KVStore {
  constructor(private kv: KVNamespace) {}

  async get<T = any>(key: string): Promise<T | null> {
    const val = await this.kv.get(key, 'text');
    if (val === null) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as unknown as T;
    }
  }

  async put(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    const opts: KVNamespacePutOptions = {};
    if (ttlSeconds) opts.expirationTtl = ttlSeconds;
    await this.kv.put(key, str, opts);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(prefix?: string, limit = 1000): Promise<string[]> {
    const result = await this.kv.list({ prefix, limit });
    return result.keys.map((k) => k.name);
  }
}

/**
 * 速率限制器 - 基于 KV
 * 替代 express-rate-limit + Redis
 */
export class RateLimiter {
  constructor(
    private kv: KVNamespace,
    private windowMs: number,
    private maxRequests: number,
    private prefix = 'rl'
  ) {}

  async isLimited(identifier: string): Promise<{ limited: boolean; remaining: number }> {
    const key = `${this.prefix}:${identifier}`;
    const windowSec = Math.ceil(this.windowMs / 1000);

    const current = await this.kv.get(key, 'text');
    const count = current ? parseInt(current, 10) : 0;

    if (count >= this.maxRequests) {
      return { limited: true, remaining: 0 };
    }

    // 递增计数
    await this.kv.put(key, String(count + 1), { expirationTtl: windowSec });
    return { limited: false, remaining: this.maxRequests - count - 1 };
  }
}
