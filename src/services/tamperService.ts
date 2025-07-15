import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import logger from '../utils/logger';
import mongoose from './mongoService';

// MongoDB Blocked IP Schema
const BlockedIPSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  blockedAt: { type: Date, required: true },
}, { collection: 'blocked_ips' });
const BlockedIPModel = mongoose.models.BlockedIP || mongoose.model('BlockedIP', BlockedIPSchema);

interface TamperEvent {
  elementId: string;
  timestamp: string;
  url: string;
  originalContent?: string;
  tamperContent?: string;
  attempts?: number;
  ip?: string;
  userAgent?: string;
}

interface BlockedIP {
  ip: string;
  reason: string;
  timestamp: string;
  expiresAt: string;
}

class TamperService {
  private static instance: TamperService;
  private readonly DATA_DIR = join(process.cwd(), 'data');
  private readonly TAMPER_LOG_PATH = join(this.DATA_DIR, 'tamper-events.json');
  private readonly BLOCKED_IPS_PATH = join(this.DATA_DIR, 'blocked-ips.json');
  private blockedIPs: Map<string, BlockedIP> = new Map();
  
  private constructor() {
    this.initializeDataDirectory();
  }

  private async initializeDataDirectory(): Promise<void> {
    try {
      // 确保 data 目录存在
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.info('Created data directory');
      }
      await this.loadBlockedIPs();
    } catch (error) {
      logger.error('Error initializing data directory:', error);
    }
  }

  public static getInstance(): TamperService {
    if (!TamperService.instance) {
      TamperService.instance = new TamperService();
    }
    return TamperService.instance;
  }

  private async loadBlockedIPs(): Promise<void> {
    try {
      const data = await readFile(this.BLOCKED_IPS_PATH, 'utf-8');
      const blockedList: BlockedIP[] = JSON.parse(data);
      this.blockedIPs = new Map(blockedList.map(item => [item.ip, item]));
    } catch (error) {
      logger.warn('No blocked IPs file found, creating new one');
      await this.saveBlockedIPs();
    }
  }

  private async saveBlockedIPs(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const blockedList = Array.from(this.blockedIPs.values());
        // 先清空再批量插入
        await BlockedIPModel.deleteMany({});
        if (blockedList.length > 0) {
          await BlockedIPModel.insertMany(blockedList.map(ip => ({ ip, blockedAt: new Date() })));
        }
        return;
      }
    } catch (error) {
      logger.error('MongoDB 保存 Blocked IPs 失败，降级为本地文件:', error);
    }
    // 本地文件兜底
    try {
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
      }
      const blockedList = Array.from(this.blockedIPs.values());
      await writeFile(this.BLOCKED_IPS_PATH, JSON.stringify(blockedList, null, 2));
    } catch (error) {
      logger.error('Error saving blocked IPs:', error);
    }
  }

  public async recordTamperEvent(event: TamperEvent): Promise<void> {
    try {
      // 确保目录存在
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
      }

      // 读取现有事件
      let events: TamperEvent[] = [];
      try {
        const data = await readFile(this.TAMPER_LOG_PATH, 'utf-8');
        events = JSON.parse(data);
      } catch (error) {
        logger.warn('No tamper events file found, creating new one');
      }

      // 添加新事件
      events.push({
        ...event,
        timestamp: new Date().toISOString()
      });

      // 保存事件
      await writeFile(this.TAMPER_LOG_PATH, JSON.stringify(events, null, 2));

      // 检查是否需要阻止 IP
      if (event.ip) {
        await this.checkAndBlockIP(event.ip, events);
      }
    } catch (error) {
      logger.error('Error recording tamper event:', error);
    }
  }

  private async checkAndBlockIP(ip: string, events: TamperEvent[]): Promise<void> {
    // 获取最近 1 小时内该 IP 的篡改次数
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEvents = events.filter(e => 
      e.ip === ip && new Date(e.timestamp) > oneHourAgo
    );

    // 如果 1 小时内篡改次数超过 10 次，封禁 24 小时
    if (recentEvents.length >= 10) {
      const blockExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      this.blockedIPs.set(ip, {
        ip,
        reason: '频繁篡改页面内容',
        timestamp: new Date().toISOString(),
        expiresAt: blockExpiry.toISOString()
      });

      await this.saveBlockedIPs();
      logger.warn(`IP ${ip} has been blocked for tampering`);
    }
  }

  public isIPBlocked(ip: string): boolean {
    const blockedIP = this.blockedIPs.get(ip);
    if (!blockedIP) return false;

    // 检查封禁是否过期
    if (new Date(blockedIP.expiresAt) < new Date()) {
      this.blockedIPs.delete(ip);
      this.saveBlockedIPs().catch(logger.error);
      return false;
    }

    return true;
  }

  public getBlockDetails(ip: string): BlockedIP | null {
    return this.blockedIPs.get(ip) || null;
  }
}

export const tamperService = TamperService.getInstance(); 