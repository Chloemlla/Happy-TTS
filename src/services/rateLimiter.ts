import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileTimeConfig } from "../config/config";
import { logger } from "./logger";
import { mongoose } from "./mongoService";

export const MAX_REQUESTS_PER_MINUTE = 60;
export const MAX_REQUESTS_PER_HOUR = 1000;
export const MAX_REQUESTS_PER_DAY = 10000;

// MongoDB 速率限制 Schema
const RateLimitSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true },
    minute: { type: [Number], default: [] },
    hour: { type: [Number], default: [] },
    day: { type: [Number], default: [] },
  },
  { collection: "rate_limits" },
);
const RateLimitModel = mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema);

interface RateLimitData {
  [ip: string]: {
    minute: number[];
    hour: number[];
    day: number[];
  };
}

export class RateLimiter {
  private data: RateLimitData = {};
  private dataFile: string;

  constructor() {
    // For pkg executables, use absolute path relative to executable location
    if ((process as any).pkg) {
      this.dataFile = join(process.cwd(), "data", "lc_data.json");
    } else {
      this.dataFile = join(compileTimeConfig.dataDir, "lc_data.json");
    }
    this.loadData();
  }

  private async loadData() {
    try {
      if (mongoose.connection.readyState === 1) {
        const docs = await RateLimitModel.find().lean();
        this.data = {};
        for (const doc of docs) {
          this.data[doc.ip] = { minute: doc.minute, hour: doc.hour, day: doc.day };
        }
        return;
      }
    } catch (error) {
      logger.error("MongoDB 加载速率限制数据失败，降级为本地文件:", error);
    }
    if (existsSync(this.dataFile)) {
      try {
        this.data = JSON.parse(readFileSync(this.dataFile, "utf-8"));
      } catch (error) {
        logger.error("加载速率限制数据失败", error);
        this.data = {};
      }
    } else {
      this.saveData();
    }
  }

  // 只写入受影响的 IP：单次请求不应该重写全部 IP 的记录。
  private async saveData(ip?: string) {
    try {
      if (mongoose.connection.readyState === 1) {
        const targets = ip === undefined ? Object.keys(this.data) : [ip];
        for (const target of targets) {
          const entry = this.data[target];
          if (!entry) continue;
          await RateLimitModel.findOneAndUpdate({ ip: target }, entry, { upsert: true });
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

  // 时间戳按追加顺序单调递增，过期项必然是前缀，原地 splice 即可。
  private static pruneBefore(timestamps: number[], cutoff: number) {
    let expired = 0;
    while (expired < timestamps.length && timestamps[expired] <= cutoff) {
      expired++;
    }
    if (expired > 0) {
      timestamps.splice(0, expired);
    }
  }

  private cleanupOldTimestamps(ip: string) {
    const now = Date.now();
    const entry = this.data[ip];
    if (entry) {
      RateLimiter.pruneBefore(entry.minute, now - 60000);
      RateLimiter.pruneBefore(entry.hour, now - 3600000);
      RateLimiter.pruneBefore(entry.day, now - 86400000);
    }
  }

  async isRateLimited(ip: string): Promise<boolean> {
    this.cleanupOldTimestamps(ip);

    if (!this.data[ip]) {
      this.data[ip] = {
        minute: [],
        hour: [],
        day: [],
      };
    }

    const now = Date.now();
    this.data[ip].minute.push(now);
    this.data[ip].hour.push(now);
    this.data[ip].day.push(now);

    await this.saveData(ip);

    return (
      this.data[ip].minute.length > MAX_REQUESTS_PER_MINUTE ||
      this.data[ip].hour.length > MAX_REQUESTS_PER_HOUR ||
      this.data[ip].day.length > MAX_REQUESTS_PER_DAY
    );
  }
}

export const rateLimiter = new RateLimiter();
