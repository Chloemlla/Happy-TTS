import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileTimeConfig } from "../config/config";
import { logger } from "./logger";
import { mongoose } from "./mongoService";

export const MAX_REQUESTS_PER_MINUTE = 60;
export const MAX_REQUESTS_PER_HOUR = 1000;
export const MAX_REQUESTS_PER_DAY = 10000;

// G5-27: 内存表加上界，避免 IPv6/伪造流量下无界增长 OOM。
const MAX_IN_MEMORY_IPS = 10000;

interface WindowCounter {
  count: number;
  windowStart: number;
}

interface RateLimitEntry {
  minute: WindowCounter;
  hour: WindowCounter;
  day: WindowCounter;
}

// MongoDB 速率限制 Schema
// G5-27: 存「计数 + 窗口起点」而不是完整时间戳数组，避免每次请求整份数组写回 Mongo。
const RateLimitSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true },
    minute: { type: { count: Number, windowStart: Number }, default: () => ({ count: 0, windowStart: 0 }) },
    hour: { type: { count: Number, windowStart: Number }, default: () => ({ count: 0, windowStart: 0 }) },
    day: { type: { count: Number, windowStart: Number }, default: () => ({ count: 0, windowStart: 0 }) },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "rate_limits" },
);
// G5-27: 集合加 TTL 索引，历史 IP 记录自动过期，避免启动时整表读入内存。
RateLimitSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
const RateLimitModel = mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema);

interface RateLimitData {
  [ip: string]: RateLimitEntry;
}

const WINDOWS: Array<{ key: keyof RateLimitEntry; ms: number; max: number }> = [
  { key: "minute", ms: 60_000, max: MAX_REQUESTS_PER_MINUTE },
  { key: "hour", ms: 3_600_000, max: MAX_REQUESTS_PER_HOUR },
  { key: "day", ms: 86_400_000, max: MAX_REQUESTS_PER_DAY },
];

export class RateLimiter {
  private data: RateLimitData = {};
  private dataFile: string;
  private loadPromise: Promise<void> | null = null;
  // FIFO 插入顺序跟踪，用于满载时 O(1) 淘汰最旧 IP。
  private keyOrder: string[] = [];

  constructor() {
    // For pkg executables, use absolute path relative to executable location
    if ((process as any).pkg) {
      this.dataFile = join(process.cwd(), "data", "lc_data.json");
    } else {
      this.dataFile = join(compileTimeConfig.dataDir, "lc_data.json");
    }
    this.loadPromise = this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const docs = await RateLimitModel.find().lean();
        const next: RateLimitData = {};
        this.keyOrder = [];
        for (const doc of docs) {
          const ip = (doc as any).ip as string;
          if (!ip) continue;
          next[ip] = {
            minute: { count: Number((doc as any).minute?.count || 0), windowStart: Number((doc as any).minute?.windowStart || 0) },
            hour: { count: Number((doc as any).hour?.count || 0), windowStart: Number((doc as any).hour?.windowStart || 0) },
            day: { count: Number((doc as any).day?.count || 0), windowStart: Number((doc as any).day?.windowStart || 0) },
          };
          this.keyOrder.push(ip);
        }
        this.data = next;
        return;
      }
    } catch (error) {
      logger.error("MongoDB 加载速率限制数据失败，降级为本地文件:", error);
    }
    if (existsSync(this.dataFile)) {
      try {
        this.data = JSON.parse(readFileSync(this.dataFile, "utf-8"));
        this.keyOrder = Object.keys(this.data);
      } catch (error) {
        logger.error("加载速率限制数据失败", error);
        this.data = {};
        this.keyOrder = [];
      }
    } else {
      this.saveData();
    }
  }

  private ensureLoaded(): Promise<void> {
    return this.loadPromise ?? Promise.resolve();
  }

  // 只写入受影响的 IP：单次请求不应该重写全部 IP 的记录。
  private async saveData(ip?: string): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const targets = ip === undefined ? Object.keys(this.data) : [ip];
        for (const target of targets) {
          const entry = this.data[target];
          if (!entry) continue;
          await RateLimitModel.findOneAndUpdate(
            { ip: target },
            { ...entry, updatedAt: new Date() },
            { upsert: true },
          );
        }
        return;
      }
    } catch (error) {
      logger.error("MongoDB 保存速率限制数据失败，降级为本地文件:", error);
    }
    try {
      // Get the directory from the data file path
      const dir = (process as any).pkg ? join(process.cwd(), "data") : compileTimeConfig.dataDir;
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.dataFile, JSON.stringify(this.data));
    } catch (error) {
      logger.error("保存速率限制数据失败", error);
    }
  }

  private getOrCreateEntry(ip: string): RateLimitEntry {
    let entry = this.data[ip];
    if (entry) return entry;

    // G5-27: 内存表满载时淘汰最旧插入的 IP（O(1)），避免无界增长。
    if (this.keyOrder.length >= MAX_IN_MEMORY_IPS) {
      const oldest = this.keyOrder.shift();
      if (oldest) delete this.data[oldest];
    }

    entry = {
      minute: { count: 0, windowStart: 0 },
      hour: { count: 0, windowStart: 0 },
      day: { count: 0, windowStart: 0 },
    };
    this.data[ip] = entry;
    this.keyOrder.push(ip);
    return entry;
  }

  async isRateLimited(ip: string): Promise<boolean> {
    await this.ensureLoaded();

    const now = Date.now();
    const entry = this.getOrCreateEntry(ip);
    let limited = false;

    for (const window of WINDOWS) {
      const counter = entry[window.key];
      // 窗口过期则重置计数
      if (now - counter.windowStart > window.ms) {
        counter.count = 0;
        counter.windowStart = now;
      }
      counter.count += 1;
      if (counter.count > window.max) {
        limited = true;
      }
    }

    await this.saveData(ip);

    return limited;
  }
}

export const rateLimiter = new RateLimiter();
