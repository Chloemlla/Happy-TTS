import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import config from '../config';
import { logger } from './logger';
import mongoose from './mongoService';

// MongoDB 速率限制 Schema
const RateLimitSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  minute: { type: [Number], default: [] },
  hour: { type: [Number], default: [] },
  day: { type: [Number], default: [] },
}, { collection: 'rate_limits' });
const RateLimitModel = mongoose.models.RateLimit || mongoose.model('RateLimit', RateLimitSchema);

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
    this.dataFile = config.paths.lcData;
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
      logger.error('MongoDB 加载速率限制数据失败，降级为本地文件:', error);
    }
    if (existsSync(this.dataFile)) {
      try {
        this.data = JSON.parse(readFileSync(this.dataFile, 'utf-8'));
      } catch (error) {
        logger.error('Failed to load rate limit data', error);
        this.data = {};
      }
    } else {
      this.saveData();
    }
  }

  private async saveData() {
    try {
      if (mongoose.connection.readyState === 1) {
        for (const ip of Object.keys(this.data)) {
          await RateLimitModel.findOneAndUpdate(
            { ip },
            this.data[ip],
            { upsert: true }
          );
        }
        return;
      }
    } catch (error) {
      logger.error('MongoDB 保存速率限制数据失败，降级为本地文件:', error);
    }
    try {
      const dir = config.paths.data;
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error('Failed to save rate limit data', error);
    }
  }

  private cleanupOldTimestamps(ip: string) {
    const now = Date.now();
    const minuteAgo = now - 60000;
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;

    if (this.data[ip]) {
      this.data[ip].minute = this.data[ip].minute.filter(t => t > minuteAgo);
      this.data[ip].hour = this.data[ip].hour.filter(t => t > hourAgo);
      this.data[ip].day = this.data[ip].day.filter(t => t > dayAgo);
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

    await this.saveData();

    return (
      this.data[ip].minute.length > config.limits.maxRequestsPerMinute ||
      this.data[ip].hour.length > config.limits.maxRequestsPerHour ||
      this.data[ip].day.length > config.limits.maxRequestsPerDay
    );
  }
}

export const rateLimiter = new RateLimiter(); 