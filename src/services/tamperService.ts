import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import logger from "../utils/logger";
import { mongoose } from "./mongoService";
import { registerShutdownStep, installShutdownHandlers } from "./shutdown";

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
// G5-26: blocked_ips 集合加 TTL 索引，自动清理过期封禁。
BlockedIPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const BlockedIPModel = mongoose.models.BlockedIP || mongoose.model("BlockedIP", BlockedIPSchema);

/** G5-26: 原子写 JSON 文件——先写临时文件再 rename，避免整份覆盖写过程中崩溃产生损坏的 JSON。 */
async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(data, null, 2));
  await rename(tempPath, filePath);
}

export interface TamperEvent {
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
  private readonly FLUSH_DELAY_MS = 1000;
  private blockedIPs: Map<string, BlockedIP> = new Map();
  private events: TamperEvent[] | null = null;
  private eventsLoading: Promise<void> | null = null;
  private ipEventTimes: Map<string, number[]> = new Map();
  private eventsDirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private blockedIPsRefreshTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeDataDirectory();
    // G5-26: 定期从 Mongo 刷新封禁名单内存快照（60s），避免多副本下实例 A 封的 IP 实例 B 长期不认。
    this.blockedIPsRefreshTimer = setInterval(() => {
      this.loadBlockedIPs().catch(() => {});
    }, 60_000);
    this.blockedIPsRefreshTimer.unref?.();
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

  private async writeBlockedIPsFile(): Promise<void> {
    try {
      if (!existsSync(this.DATA_DIR)) {
        await mkdir(this.DATA_DIR, { recursive: true });
      }
      const blockedList = Array.from(this.blockedIPs.values());
      await atomicWriteJson(this.BLOCKED_IPS_PATH, blockedList);
    } catch (error) {
      logger.error("保存封禁 IP 失败:", error);
    }
  }

  private async persistBlockedIP(blocked: BlockedIP): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await BlockedIPModel.updateOne(
          { ip: blocked.ip },
          {
            $set: {
              reason: blocked.reason,
              blockedAt: new Date(blocked.timestamp),
              expiresAt: new Date(blocked.expiresAt),
            },
          },
          { upsert: true },
        );
        return;
      }
    } catch (error) {
      logger.error("MongoDB 保存 Blocked IP 失败，降级为本地文件:", error);
    }
    await this.writeBlockedIPsFile();
  }

  private async removeBlockedIP(ip: string): Promise<void> {
    // 运行时兜底：调用方来自 HTTP 层，非字符串一律拒绝，避免查询对象注入
    if (typeof ip !== "string") return;
    try {
      if (mongoose.connection.readyState === 1) {
        await BlockedIPModel.deleteOne({ ip: { $eq: ip } });
        return;
      }
    } catch (error) {
      logger.error("MongoDB 删除 Blocked IP 失败，降级为本地文件:", error);
    }
    await this.writeBlockedIPsFile();
  }

  private async sweepExpiredBlockedIPs(removedIps: string[], now: Date): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        await BlockedIPModel.deleteMany({ $or: [{ ip: { $in: removedIps } }, { expiresAt: { $lte: now } }] });
        return;
      }
    } catch (error) {
      logger.error("MongoDB 清理过期 Blocked IPs 失败，降级为本地文件:", error);
    }
    await this.writeBlockedIPsFile();
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

  private async loadTamperEvents(): Promise<void> {
    let retained: TamperEvent[] = [];
    try {
      const parsed = JSON.parse(await readFile(this.TAMPER_LOG_PATH, "utf-8"));
      if (Array.isArray(parsed)) retained = parsed.slice(-this.MAX_EVENTS);
    } catch (_error) {
      retained = [];
    }
    this.events = retained;
    this.ipEventTimes = new Map();
    for (const event of retained) {
      this.trackIpEvent(event.ip, event.timestamp);
    }
  }

  private async ensureEventsLoaded(): Promise<TamperEvent[]> {
    if (this.events) return this.events;
    if (!this.eventsLoading) {
      this.eventsLoading = this.loadTamperEvents();
    }
    await this.eventsLoading;
    return this.events ?? [];
  }

  private trackIpEvent(ip: string | undefined, timestamp: string): void {
    if (!ip) return;
    const time = new Date(timestamp).getTime();
    if (!Number.isFinite(time)) return;
    const times = this.ipEventTimes.get(ip);
    if (times) times.push(time);
    else this.ipEventTimes.set(ip, [time]);
  }

  // 事件被环形窗口淘汰时，只有仍留在队首的那一条才是它对应的时间戳（更早的已被时间裁剪掉）
  private untrackIpEvent(ip: string | undefined, timestamp: string): void {
    if (!ip) return;
    const times = this.ipEventTimes.get(ip);
    if (!times || times.length === 0) return;
    if (times[0] !== new Date(timestamp).getTime()) return;
    times.shift();
    if (times.length === 0) this.ipEventTimes.delete(ip);
  }

  private countRecentIpEvents(ip: string, after: number): number {
    const times = this.ipEventTimes.get(ip);
    if (!times) return 0;
    while (times.length > 0 && times[0] <= after) times.shift();
    if (times.length === 0) {
      this.ipEventTimes.delete(ip);
      return 0;
    }
    return times.length;
  }

  private async readTamperEvents(): Promise<TamperEvent[]> {
    const events = await this.ensureEventsLoaded();
    return events.slice();
  }

  private async writeTamperEvents(events: TamperEvent[]): Promise<void> {
    if (!existsSync(this.DATA_DIR)) {
      await mkdir(this.DATA_DIR, { recursive: true });
    }
    await atomicWriteJson(this.TAMPER_LOG_PATH, events.slice(-this.MAX_EVENTS));
  }

  private scheduleEventsFlush(): void {
    if (this.flushTimer) return;
    const timer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPendingEvents().catch((error) => logger.error("刷新篡改事件失败:", error));
    }, this.FLUSH_DELAY_MS);
    timer.unref();
    this.flushTimer = timer;
  }

  public async flushPendingEvents(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.eventsDirty || !this.events) return;
    this.eventsDirty = false;
    const snapshot = this.events.slice();
    this.writeQueue = this.writeQueue.catch(() => {}).then(() => this.writeTamperEvents(snapshot));
    await this.writeQueue;
  }

  public async recordTamperEvent(event: TamperEvent): Promise<TamperEvent> {
    try {
      const events = await this.ensureEventsLoaded();
      const normalized = this.normalizeTamperEvent(event);

      events.push(normalized);
      this.trackIpEvent(normalized.ip, normalized.timestamp);
      while (events.length > this.MAX_EVENTS) {
        const evicted = events.shift();
        if (evicted) this.untrackIpEvent(evicted.ip, evicted.timestamp);
      }
      this.eventsDirty = true;

      // 检查是否需要阻止 IP
      const blocked = normalized.ip ? await this.checkAndBlockIP(normalized.ip) : false;
      if (blocked) {
        await this.flushPendingEvents();
      } else {
        this.scheduleEventsFlush();
      }

      return normalized;
    } catch (error) {
      logger.error("记录篡改事件失败:", error);
      throw error;
    }
  }

  private async checkAndBlockIP(ip: string): Promise<boolean> {
    // 如果 1 小时内篡改次数超过 10 次，封禁 24 小时
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (this.countRecentIpEvents(ip, oneHourAgo) < 10) return false;

    const blockExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const blockedIP: BlockedIP = {
      ip,
      reason: "频繁篡改页面内容",
      timestamp: new Date().toISOString(),
      expiresAt: blockExpiry.toISOString(),
    };
    this.blockedIPs.set(ip, blockedIP);

    await this.persistBlockedIP(blockedIP);
    logger.warn(`IP ${ip} 因篡改行为被封禁`);
    return true;
  }

  public isIPBlocked(ip: string): boolean {
    const blockedIP = this.blockedIPs.get(ip);
    if (!blockedIP) return false;

    // 检查封禁是否过期
    if (new Date(blockedIP.expiresAt) < new Date()) {
      this.blockedIPs.delete(ip);
      this.removeBlockedIP(ip).catch(logger.error);
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
    await this.persistBlockedIP(blockedIP);
    return blockedIP;
  }

  public async unblockIP(ip: string): Promise<boolean> {
    const existed = this.blockedIPs.delete(ip);
    if (existed) {
      await this.removeBlockedIP(ip);
    }
    return existed;
  }

  public async clearExpiredBlockedIPs(): Promise<number> {
    const now = Date.now();
    const removedIps: string[] = [];
    for (const [ip, details] of this.blockedIPs.entries()) {
      if (new Date(details.expiresAt).getTime() <= now) {
        this.blockedIPs.delete(ip);
        removedIps.push(ip);
      }
    }
    if (removedIps.length > 0) {
      await this.sweepExpiredBlockedIPs(removedIps, new Date(now));
    }
    return removedIps.length;
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

// G5-21: 不再自行注册信号处理器，交给统一关闭编排（shutdown.ts），避免进程永不退出。
registerShutdownStep("tamper-events-flush", () => tamperService.flushPendingEvents());
installShutdownHandlers();
