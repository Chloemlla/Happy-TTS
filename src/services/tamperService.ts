import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import logger from "../utils/logger";
import { mongoose } from "./mongoService";

// MongoDB Blocked IP Schema
const BlockedIPSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true, unique: true },
    reason: { type: String, default: "频繁篡改页面内容" },
    blockedAt: { type: Date, required: true },
    expiresAt: { type: Date },
  },
  { collection: "blocked_ips" },
);
const BlockedIPModel = mongoose.models.BlockedIP || mongoose.model("BlockedIP", BlockedIPSchema);

interface TamperEvent {
  id?: string;
  // 基础信息
  elementId?: string;
  timestamp: string;
  clientTimestamp?: string;
  url: string;
  ip?: string;
  userAgent?: string;

  // 篡改类型和检测方法
  eventType?: string;
  tamperType?: "dom" | "network" | "proxy" | "injection";
  detectionMethod?: string;

  // 内容相关
  originalContent?: string;
  tamperContent?: string;
  filePath?: string;
  checksum?: string;

  // 统计信息
  attempts?: number;

  // 额外信息
  additionalInfo?: Record<string, any>;
  severity?: "low" | "medium" | "high" | "critical";
  signed?: boolean;
}

interface BlockedIP {
  ip: string;
  reason: string;
  timestamp: string;
  expiresAt: string;
}

function resolveMaxEvents(): number {
  const configured = Number(process.env.TAMPER_MAX_EVENTS);
  if (!Number.isFinite(configured)) return 2000;
  return Math.max(100, Math.floor(configured));
}

class TamperService {
  private static instance: TamperService;
  private readonly DATA_DIR = join(process.cwd(), "data");
  private readonly TAMPER_LOG_PATH = join(this.DATA_DIR, "tamper-events.json");
  private readonly BLOCKED_IPS_PATH = join(this.DATA_DIR, "blocked-ips.json");
  private readonly MAX_EVENTS = resolveMaxEvents();
  private readonly MAX_CONTENT_LENGTH = 2000;
  private blockedIPs: Map<string, BlockedIP> = new Map();

  private constructor() {
    this.initializeDataDirectory();
  }

  private async initializeDataDirectory(): Promise<void> {
    try {
      // 确保 data 目录存在
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
        logger.info("已创建数据目录");
      }
      await this.loadBlockedIPs();
    } catch (error) {
      logger.error("初始化数据目录失败:", error);
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
      if (mongoose.connection.readyState === 1) {
        const docs = await BlockedIPModel.find({}).lean();
        this.blockedIPs = new Map(
          docs.map((doc: any) => [
            doc.ip,
            {
              ip: doc.ip,
              reason: doc.reason || "频繁篡改页面内容",
              timestamp: doc.blockedAt?.toISOString() || new Date().toISOString(),
              expiresAt: doc.expiresAt?.toISOString() || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            },
          ]),
        );
        return;
      }
    } catch (error) {
      logger.warn("MongoDB 加载 Blocked IPs 失败，降级为本地文件:", error);
    }
    // 本地文件兜底
    try {
      const data = await readFile(this.BLOCKED_IPS_PATH, "utf-8");
      const blockedList: BlockedIP[] = JSON.parse(data);
      this.blockedIPs = new Map(blockedList.map((item) => [item.ip, item]));
    } catch (_error) {
      logger.warn("未找到封禁 IP 文件，初始化为空");
    }
  }

  private async saveBlockedIPs(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        const blockedList = Array.from(this.blockedIPs.values());
        // 先清空再批量插入
        await BlockedIPModel.deleteMany({});
        if (blockedList.length > 0) {
          await BlockedIPModel.insertMany(
            blockedList.map((item) => ({
              ip: item.ip,
              reason: item.reason,
              blockedAt: new Date(item.timestamp),
              expiresAt: new Date(item.expiresAt),
            })),
          );
        }
        return;
      }
    } catch (error) {
      logger.error("MongoDB 保存 Blocked IPs 失败，降级为本地文件:", error);
    }
    // 本地文件兜底
    try {
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
      }
      const blockedList = Array.from(this.blockedIPs.values());
      await writeFile(this.BLOCKED_IPS_PATH, JSON.stringify(blockedList, null, 2));
    } catch (error) {
      logger.error("保存封禁 IP 失败:", error);
    }
  }

  private sanitizeString(value: unknown, maxLength = 500): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.replace(/\u0000/g, "").trim();
    if (!trimmed) return undefined;
    return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...[truncated]` : trimmed;
  }

  private sanitizeInfo(value: unknown): Record<string, any> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const safe: Record<string, any> = {};

    for (const [key, item] of Object.entries(value as Record<string, any>).slice(0, 30)) {
      const safeKey = this.sanitizeString(key, 80);
      if (!safeKey) continue;

      if (typeof item === "string") {
        safe[safeKey] = this.sanitizeString(item, 300);
      } else if (typeof item === "number" || typeof item === "boolean" || item === null) {
        safe[safeKey] = item;
      } else if (Array.isArray(item)) {
        safe[safeKey] = item.slice(0, 20).map((entry) => {
          if (typeof entry === "string") return this.sanitizeString(entry, 160);
          if (typeof entry === "number" || typeof entry === "boolean" || entry === null) return entry;
          return "[value]";
        });
      } else if (typeof item === "object") {
        safe[safeKey] = "[object]";
      }
    }

    return Object.keys(safe).length > 0 ? safe : undefined;
  }

  private resolveSeverity(event: TamperEvent): TamperEvent["severity"] {
    if (event.tamperType === "injection" || event.eventType === "script_injection") return "critical";
    if (event.tamperType === "proxy" || event.tamperType === "network") return "high";
    if ((event.attempts || 0) >= 3) return "high";
    if (event.tamperType === "dom") return "medium";
    return "low";
  }

  private normalizeTamperEvent(event: TamperEvent): TamperEvent {
    const timestamp = new Date().toISOString();
    const clientTimestamp = this.sanitizeString(event.timestamp, 80);
    const tamperType = ["dom", "network", "proxy", "injection"].includes(String(event.tamperType))
      ? event.tamperType
      : undefined;
    const normalized: TamperEvent = {
      id: event.id || randomUUID(),
      elementId: this.sanitizeString(event.elementId, 200) || "unknown-element",
      timestamp,
      clientTimestamp,
      url: this.sanitizeString(event.url, 1200) || "unknown-url",
      ip: this.sanitizeString(event.ip, 120),
      userAgent: this.sanitizeString(event.userAgent, 500),
      eventType: this.sanitizeString(event.eventType, 120) || "unknown",
      tamperType,
      detectionMethod: this.sanitizeString(event.detectionMethod, 160),
      originalContent: this.sanitizeString(event.originalContent, this.MAX_CONTENT_LENGTH),
      tamperContent: this.sanitizeString(event.tamperContent, this.MAX_CONTENT_LENGTH),
      filePath: this.sanitizeString(event.filePath, 600),
      checksum: this.sanitizeString(event.checksum, 180),
      attempts: Number.isFinite(Number(event.attempts)) ? Math.max(0, Math.min(999, Number(event.attempts))) : undefined,
      additionalInfo: this.sanitizeInfo(event.additionalInfo),
      signed: Boolean(event.signed),
    };
    normalized.severity = this.resolveSeverity(normalized);
    return normalized;
  }

  private async readTamperEvents(): Promise<TamperEvent[]> {
    try {
      const data = await readFile(this.TAMPER_LOG_PATH, "utf-8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  private async writeTamperEvents(events: TamperEvent[]): Promise<void> {
    if (!existsSync(this.DATA_DIR)) {
      await mkdir(this.DATA_DIR, { recursive: true });
    }
    await writeFile(this.TAMPER_LOG_PATH, JSON.stringify(events.slice(-this.MAX_EVENTS), null, 2));
  }

  public async recordTamperEvent(event: TamperEvent): Promise<TamperEvent> {
    try {
      // 确保目录存在
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
      }

      const events = await this.readTamperEvents();
      const normalized = this.normalizeTamperEvent(event);

      // 添加新事件
      events.push(normalized);

      // 保存事件
      const retainedEvents = events.slice(-this.MAX_EVENTS);
      await this.writeTamperEvents(retainedEvents);

      // 检查是否需要阻止 IP
      if (normalized.ip) {
        await this.checkAndBlockIP(normalized.ip, retainedEvents);
      }

      return normalized;
    } catch (error) {
      logger.error("记录篡改事件失败:", error);
      throw error;
    }
  }

  private async checkAndBlockIP(ip: string, events: TamperEvent[]): Promise<void> {
    // 获取最近 1 小时内该 IP 的篡改次数
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEvents = events.filter((e) => e.ip === ip && new Date(e.timestamp) > oneHourAgo);

    // 如果 1 小时内篡改次数超过 10 次，封禁 24 小时
    if (recentEvents.length >= 10) {
      const blockExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      this.blockedIPs.set(ip, {
        ip,
        reason: "频繁篡改页面内容",
        timestamp: new Date().toISOString(),
        expiresAt: blockExpiry.toISOString(),
      });

      await this.saveBlockedIPs();
      logger.warn(`IP ${ip} 因篡改行为被封禁`);
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

  public async listTamperEvents(options: {
    limit?: number;
    offset?: number;
    ip?: string;
    tamperType?: string;
  } = {}): Promise<{ total: number; items: TamperEvent[] }> {
    const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));
    const offset = Math.max(0, Number(options.offset || 0));
    let events = await this.readTamperEvents();

    if (options.ip) {
      events = events.filter((event) => event.ip === options.ip);
    }
    if (options.tamperType) {
      events = events.filter((event) => event.tamperType === options.tamperType || event.eventType === options.tamperType);
    }

    events = events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      total: events.length,
      items: events.slice(offset, offset + limit),
    };
  }

  public listBlockedIPs(): BlockedIP[] {
    const now = Date.now();
    const blocked = Array.from(this.blockedIPs.values()).filter((item) => new Date(item.expiresAt).getTime() > now);
    return blocked.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async blockIP(ip: string, reason = "管理员手动封禁", durationHours = 24): Promise<BlockedIP> {
    const normalizedIp = this.sanitizeString(ip, 120);
    if (!normalizedIp || isIP(normalizedIp) === 0) throw new Error("无效的 IP");

    const safeDurationHours = Math.min(24 * 30, Math.max(1, Number(durationHours) || 24));
    const blockedIP: BlockedIP = {
      ip: normalizedIp,
      reason: this.sanitizeString(reason, 200) || "管理员手动封禁",
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + safeDurationHours * 60 * 60 * 1000).toISOString(),
    };

    this.blockedIPs.set(normalizedIp, blockedIP);
    await this.saveBlockedIPs();
    return blockedIP;
  }

  public async unblockIP(ip: string): Promise<boolean> {
    const existed = this.blockedIPs.delete(ip);
    if (existed) {
      await this.saveBlockedIPs();
    }
    return existed;
  }

  public async clearExpiredBlockedIPs(): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [ip, details] of this.blockedIPs.entries()) {
      if (new Date(details.expiresAt).getTime() <= now) {
        this.blockedIPs.delete(ip);
        removed++;
      }
    }
    if (removed > 0) {
      await this.saveBlockedIPs();
    }
    return removed;
  }

  public async getSummary(limit = 20): Promise<{
    totalEvents: number;
    eventsLastHour: number;
    eventsLast24h: number;
    blockedCount: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    topIPs: Array<{ ip: string; count: number }>;
    recentEvents: TamperEvent[];
    blockedIPs: BlockedIP[];
  }> {
    await this.clearExpiredBlockedIPs();

    const events = await this.readTamperEvents();
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const ipCounts: Record<string, number> = {};

    for (const event of events) {
      const type = event.tamperType || event.eventType || "unknown";
      byType[type] = (byType[type] || 0) + 1;
      const severity = event.severity || "low";
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
      if (event.ip) {
        ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
      }
    }

    const recentEvents = events
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, Math.min(100, Math.max(1, limit)));

    return {
      totalEvents: events.length,
      eventsLastHour: events.filter((event) => new Date(event.timestamp).getTime() >= oneHourAgo).length,
      eventsLast24h: events.filter((event) => new Date(event.timestamp).getTime() >= oneDayAgo).length,
      blockedCount: this.listBlockedIPs().length,
      byType,
      bySeverity,
      topIPs: Object.entries(ipCounts)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      recentEvents,
      blockedIPs: this.listBlockedIPs(),
    };
  }
}

export const tamperService = TamperService.getInstance();
