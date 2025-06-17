import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import config from '../config';
import { logger } from './logger';

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

  private loadData() {
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

  private saveData() {
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

  isRateLimited(ip: string): boolean {
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

    this.saveData();

    return (
      this.data[ip].minute.length > config.limits.maxRequestsPerMinute ||
      this.data[ip].hour.length > config.limits.maxRequestsPerHour ||
      this.data[ip].day.length > config.limits.maxRequestsPerDay
    );
  }
}

export const rateLimiter = new RateLimiter(); 