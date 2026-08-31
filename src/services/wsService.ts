import crypto from "node:crypto";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { URL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { isIPBannedFromCache } from "../middleware/ipBanCheck";
import { onUserAuthorityChanged } from "../utils/userAuthorityEvents";
import { toTicketView } from "../utils/ticketView";
import { EcoEnchantsOpsService } from "./ecoEnchantsOpsService";
import { resolveWebSocketIdentity, type WebSocketIdentity } from "./wsAuthentication";
import { createSharedRateLimitStore } from "./sharedRateLimitStore";
import {
  claimPendingConfigurationNoticeForAdminConnection,
  completeConfigurationNoticeDelivery,
  releaseConfigurationNoticeDeliveryClaim,
} from "./configurationNoticeService";
import logger from "../utils/logger";

// G5-05: WS 加固常量
const WS_MAX_PAYLOAD = 64 * 1024,
  WS_MAX_TOTAL_CONNECTIONS = 1000,
  WS_MAX_CONNECTIONS_PER_IP = 10,
  WS_MAX_CHANNELS_PER_CLIENT = 20,
  WS_MAX_CHANNEL_NAME_LENGTH = 128,
  WS_UPGRADE_WINDOW_MS = 60_000,
  WS_UPGRADE_MAX_PER_IP = 30,
  WS_CHANNEL_PREFIX_PATTERN = /^(user:|admin:|ticket:)/;
const wsUpgradeRateLimiter = createSharedRateLimitStore("ws-upgrade", WS_UPGRADE_WINDOW_MS, {});

// ========== 类型定义 ==========

/** 客户端 → 服务端消息 */
interface WsClientMessage {
  type: "ping" | "subscribe" | "unsubscribe" | "fingerprint:ack";
  channel?: string;
  /** 指纹通知的去重 hash，前端收到 fingerprint:require 后回传 */
  hash?: string;
}

/** 服务端 → 客户端消息 */
export interface WsServerMessage {
  type:
    | "pong"
    | "tts:progress"
    | "tts:complete"
    | "tts:error"
    | "notification"
    | "admin:broadcast"
    | "fingerprint:require"
    | "fingerprint:ack"
    | "ticket:update"
    | "ticket:process"
    | "ticket:ai_response";
  data?: any;
  timestamp: number;
}

/** 工单处理细分状态 */
export type TicketProcessStep =
  | "audit_start"
  | "audit_passed"
  | "ai_start"
  | "ai_complete"
  | "saving"
  | "audit_failed"
  | "error";

interface WsClient {
  ws: WebSocket;
  userId: string | null;
  isAdmin: boolean;
  channels: Set<string>;
  connectedAt: number;
  lastPing: number;
  ip: string;
}

/**
 * 生成指纹通知的去重 hash
 * 同一事件只需处理一次，无论通过 HTTP header 还是 WS 推送到达前端
 * G5-31: hash 不含时间戳，否则每次调用都是新 hash，去重永远失效。
 */
function generateFingerprintHash(userId: string, enabled: boolean): string {
  return crypto.createHash("sha256").update(`fp:${userId}:${enabled}`).digest("hex").substring(0, 16);
}

// ========== WebSocket 服务 ==========

class WsService {
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, WsClient>();
  private clientsByUserId = new Map<string, Set<WsClient>>();
  private clientsByChannel = new Map<string, Set<WsClient>>();
  private clientsByIp = new Map<string, number>(); // G5-05: 单 IP 连接数
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private server: HttpServer | null = null;
  private upgradeHandler: ((req: IncomingMessage, socket: Socket, head: Buffer) => void) | null = null;
  private pendingUpgradeAuth = new WeakMap<IncomingMessage, { identity: WebSocketIdentity; ip: string }>();
  private unsubscribeAuthorityChanges: (() => void) | null = null;

  /**
   * 已处理的指纹通知 hash 集合，用于前后端同步去重。
   * 前端通过 HTTP header 或 WS 推送收到指纹请求后，回传 hash 确认。
   * 后续相同 hash 的通知将被跳过，防止双重触发。
   */
  private processedFingerprintHashes = new Set<string>();

  /**
   * 将 WebSocket 服务器绑定到已有的 HTTP server
   */
  init(server: HttpServer) {
    if (this.wss) {
      logger.warn("[WS] WebSocket 服务已初始化，跳过重复初始化");
      return;
    }

    this.server = server;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD });
    this.unsubscribeAuthorityChanges = onUserAuthorityChanged((userId) => {
      this.invalidateUserAuthority(userId);
    });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const context = this.pendingUpgradeAuth.get(req);
      this.pendingUpgradeAuth.delete(req);
      if (!context) {
        ws.close(1011, "Authentication context unavailable");
        return;
      }
      this.handleConnection(ws, context.identity, context.ip);
    });
    EcoEnchantsOpsService.initRpcWebSocket();

    this.upgradeHandler = (req: IncomingMessage, socket: Socket, head: Buffer) => {
      void this.handleUpgrade(req, socket, head).catch((error) => {
        logger.error("[WS] Upgrade 处理失败", { error: error instanceof Error ? error.message : String(error) });
        this.rejectUpgrade(socket, 500, "Internal Server Error");
      });
    };
    server.on("upgrade", this.upgradeHandler);

    // 心跳检测：每 30 秒清理无响应的连接
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [ws, client] of this.clients) {
        if (now - client.lastPing > 60_000) {
          logger.debug("[WS] 心跳超时，断开连接", { userId: client.userId });
          ws.terminate();
          this.removeClient(ws);
        }
      }
    }, 30_000);

    logger.info("[WS] WebSocket 服务已启动，路径: /ws");
  }

  private getUpgradePathname(req: IncomingMessage): string {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
      return url.pathname;
    } catch {
      return "";
    }
  }

  private async handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): Promise<void> {
    const pathname = this.getUpgradePathname(req);
    const clientIp = (req.socket.remoteAddress || "unknown").replace(/^::ffff:/i, "");

    // G5-05: 升级路径在 Express 中间件栈之外，先做 IP 封禁（缓存判定）+ 按 IP 频率限制。
    if (pathname === "/ws" || EcoEnchantsOpsService.shouldHandleRpcUpgrade(pathname)) {
      if (isIPBannedFromCache(clientIp).banned) return this.rejectUpgrade(socket, 403, "Forbidden");
      try {
        const r = await wsUpgradeRateLimiter.increment(clientIp);
        if (r.totalHits > WS_UPGRADE_MAX_PER_IP) return this.rejectUpgrade(socket, 429, "Too Many Requests");
      } catch (error) {
        logger.warn("[WS] upgrade 限流存储不可用，放行", { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (pathname === "/ws") {
      const upgradeWss = this.wss;
      if (!upgradeWss) return this.rejectUpgrade(socket, 503, "Service Unavailable");

      const identity = await resolveWebSocketIdentity(req);
      if (!identity) return this.rejectUpgrade(socket, 401, "Unauthorized");

      if (this.wss !== upgradeWss || socket.destroyed) return this.rejectUpgrade(socket, 503, "Service Unavailable");

      this.pendingUpgradeAuth.set(req, { identity, ip: clientIp });
      upgradeWss.handleUpgrade(req, socket, head, (ws) => {
        upgradeWss.emit("connection", ws, req);
      });
      return;
    }

    if (EcoEnchantsOpsService.shouldHandleRpcUpgrade(pathname)) {
      EcoEnchantsOpsService.handleRpcUpgrade(req, socket, head);
      return;
    }

    this.rejectUpgrade(socket, 404, "Not Found");
  }

  private rejectUpgrade(socket: Socket, statusCode: number, statusText: string): void {
    if (socket.destroyed) return;
    socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private handleConnection(ws: WebSocket, identity: WebSocketIdentity, ip: string) {
    const { userId, isAdmin } = identity;

    // G5-05: 连接数上限——总连接数与同 IP 连接数。
    if (this.clients.size >= WS_MAX_TOTAL_CONNECTIONS) return void ws.close(1013, "Server busy");
    if ((this.clientsByIp.get(ip) || 0) >= WS_MAX_CONNECTIONS_PER_IP) return void ws.close(1008, "Too many connections");

    const client: WsClient = {
      ws,
      userId,
      isAdmin,
      channels: new Set(),
      connectedAt: Date.now(),
      lastPing: Date.now(),
      ip,
    };

    // 如果有 userId，自动订阅用户频道
    if (userId) {
      client.channels.add(`user:${userId}`);
    }

    this.registerClient(client);

    logger.info("[WS] 新连接", { userId, isAdmin, total: this.clients.size });

    if (isAdmin) {
      void this.sendPendingConfigurationNotice(ws);
    }

    ws.on("message", (raw: Buffer) => {
      try {
        const msg: WsClientMessage = JSON.parse(raw.toString());
        this.handleMessage(client, msg);
      } catch {
        // 忽略非法消息
      }
    });

    ws.on("close", () => {
      this.removeClient(ws);
      logger.debug("[WS] 连接关闭", { userId, total: this.clients.size });
    });

    ws.on("error", (err: Error) => {
      logger.error("[WS] 连接错误", { userId, error: err.message });
      this.removeClient(ws);
      // 出错后强制关闭底层连接，避免半开 socket 泄漏。
      ws.terminate();
    });
  }

  // ========== 连接索引 ==========

  private registerClient(client: WsClient): void {
    this.clients.set(client.ws, client);
    this.clientsByIp.set(client.ip, (this.clientsByIp.get(client.ip) || 0) + 1);
    if (client.userId) {
      const bucket = this.clientsByUserId.get(client.userId);
      if (bucket) bucket.add(client);
      else this.clientsByUserId.set(client.userId, new Set([client]));
    }
    for (const channel of client.channels) {
      this.indexChannel(client, channel);
    }
  }

  private removeClient(ws: WebSocket): void {
    const client = this.clients.get(ws);
    this.clients.delete(ws);
    if (!client) return;
    const ipCount = this.clientsByIp.get(client.ip);
    if (ipCount && ipCount > 1) this.clientsByIp.set(client.ip, ipCount - 1);
    else this.clientsByIp.delete(client.ip);
    if (client.userId) {
      const bucket = this.clientsByUserId.get(client.userId);
      if (bucket) {
        bucket.delete(client);
        if (bucket.size === 0) this.clientsByUserId.delete(client.userId);
      }
    }
    for (const channel of client.channels) {
      this.unindexChannel(client, channel);
    }
  }

  private indexChannel(client: WsClient, channel: string): void {
    const bucket = this.clientsByChannel.get(channel);
    if (bucket) bucket.add(client);
    else this.clientsByChannel.set(channel, new Set([client]));
  }

  private unindexChannel(client: WsClient, channel: string): void {
    const bucket = this.clientsByChannel.get(channel);
    if (!bucket) return;
    bucket.delete(client);
    if (bucket.size === 0) this.clientsByChannel.delete(channel);
  }

  private async sendPendingConfigurationNotice(ws: WebSocket): Promise<void> {
    try {
      const pendingNotice = await claimPendingConfigurationNoticeForAdminConnection();
      if (!pendingNotice) {
        return;
      }

      if (!this.clients.get(ws)?.isAdmin) {
        await releaseConfigurationNoticeDeliveryClaim(
          pendingNotice.fingerprint,
          pendingNotice.deliveryClaimId,
        );
        return;
      }

      const sent = this.send(ws, {
        type: "admin:broadcast",
      data: {
          title: pendingNotice.title,
          message: pendingNotice.message,
          issueIds: pendingNotice.issueIds,
          issues: pendingNotice.issues,
          level: "warn",
          duration: 15_000,
          display: "modal",
          format: "text",
        },
        timestamp: Date.now(),
      });

      if (sent) {
        await completeConfigurationNoticeDelivery(
          pendingNotice.fingerprint,
          pendingNotice.deliveryClaimId,
        );
      } else {
        await releaseConfigurationNoticeDeliveryClaim(
          pendingNotice.fingerprint,
          pendingNotice.deliveryClaimId,
        );
      }
    } catch (error) {
      logger.warn("[WS] Failed to replay pending administrator configuration notice", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleMessage(client: WsClient, msg: WsClientMessage) {
    switch (msg.type) {
      case "ping":
        client.lastPing = Date.now();
        this.send(client.ws, { type: "pong", timestamp: Date.now() });
        break;

      case "subscribe":
        if (msg.channel && typeof msg.channel === "string") {
          // G5-05: 频道名白名单前缀 + 长度上限 + 每连接订阅数上限，防止 clientsByChannel 无界增长。
          if (msg.channel.length > WS_MAX_CHANNEL_NAME_LENGTH) break;
          if (!WS_CHANNEL_PREFIX_PATTERN.test(msg.channel)) break;
          // 管理员频道只允许管理员订阅
          if (msg.channel.startsWith("admin:") && !client.isAdmin) break;
          if (client.channels.size >= WS_MAX_CHANNELS_PER_CLIENT) break;
          client.channels.add(msg.channel);
          this.indexChannel(client, msg.channel);
        }
        break;

      case "unsubscribe":
        if (msg.channel) {
          client.channels.delete(msg.channel);
          this.unindexChannel(client, msg.channel);
        }
        break;

      case "fingerprint:ack":
        // 前端确认已收到指纹通知，记录 hash 用于去重
        if (msg.hash && client.userId) {
          this.processedFingerprintHashes.add(msg.hash);
          logger.debug("[WS] 收到指纹通知确认", { userId: client.userId, hash: msg.hash });
          // 清理过期的 hash（保留最近 200 条）
          if (this.processedFingerprintHashes.size > 200) {
            const arr = Array.from(this.processedFingerprintHashes);
            this.processedFingerprintHashes = new Set(arr.slice(-100));
          }
        }
        break;
    }
  }

  // ========== 发送方法 ==========

  private sendRaw(ws: WebSocket, payload: string): boolean {
    if (ws.readyState === WebSocket.OPEN) {
      // G5-05: 慢消费者出站缓冲上限，超限强制断开，防止内存无界堆积。
      if (ws.bufferedAmount > 256 * 1024) {
        ws.terminate();
        return false;
      }
      ws.send(payload);
      return true;
    }
    return false;
  }

  private send(ws: WebSocket, msg: WsServerMessage): boolean {
    return this.sendRaw(ws, JSON.stringify(msg));
  }

  /** 发送给指定用户 */
  sendToUser(userId: string, msg: Omit<WsServerMessage, "timestamp">): number {
    return this.sendToUsers([userId], msg);
  }

  /** 发送给多个指定用户 */
  sendToUsers(userIds: string[], msg: Omit<WsServerMessage, "timestamp">): number {
    const targetIds = new Set(userIds.filter(Boolean));
    if (targetIds.size === 0) return 0;

    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    const payload = JSON.stringify(fullMsg);
    let sent = 0;
    for (const userId of targetIds) {
      const bucket = this.clientsByUserId.get(userId);
      if (!bucket) continue;
      for (const client of bucket) {
        if (this.sendRaw(client.ws, payload)) sent++;
      }
    }
    return sent;
  }

  /** 发送给订阅了某频道的所有客户端 */
  sendToChannel(channel: string, msg: Omit<WsServerMessage, "timestamp">): number {
    const bucket = this.clientsByChannel.get(channel);
    if (!bucket) return 0;

    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    const payload = JSON.stringify(fullMsg);
    let sent = 0;
    for (const client of bucket) {
      if (this.sendRaw(client.ws, payload)) sent++;
    }
    return sent;
  }

  /** 广播给所有已连接客户端 */
  broadcast(msg: Omit<WsServerMessage, "timestamp">): number {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    const payload = JSON.stringify(fullMsg);
    let sent = 0;
    for (const [ws] of this.clients) {
      if (this.sendRaw(ws, payload)) sent++;
    }
    return sent;
  }

  /** 广播给所有管理员 */
  broadcastToAdmins(msg: Omit<WsServerMessage, "timestamp">): number {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    const payload = JSON.stringify(fullMsg);
    let sent = 0;
    for (const [ws, client] of this.clients) {
      if (client.isAdmin) {
        if (this.sendRaw(ws, payload)) sent++;
      }
    }
    return sent;
  }

  /** 广播给所有已认证用户 */
  broadcastToAuthenticatedUsers(msg: Omit<WsServerMessage, "timestamp">): number {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    const payload = JSON.stringify(fullMsg);
    let sent = 0;
    for (const [ws, client] of this.clients) {
      if (client.userId && this.sendRaw(ws, payload)) {
        sent++;
      }
    }
    return sent;
  }

  /** 广播给所有匿名连接 */
  broadcastToAnonymous(msg: Omit<WsServerMessage, "timestamp">): number {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    const payload = JSON.stringify(fullMsg);
    let sent = 0;
    for (const [ws, client] of this.clients) {
      if (!client.userId && this.sendRaw(ws, payload)) {
        sent++;
      }
    }
    return sent;
  }

  // ========== 便捷方法：TTS 进度推送 ==========

  /** TTS 生成开始 */
  notifyTtsProgress(userId: string, data: { taskId: string; status: string; message?: string }) {
    this.sendToUser(userId, {
      type: "tts:progress",
      data,
    });
  }

  /** TTS 生成完成 */
  notifyTtsComplete(userId: string, data: { taskId: string; audioUrl: string; fileName: string }) {
    this.sendToUser(userId, {
      type: "tts:complete",
      data,
    });
  }

  /** TTS 生成失败 */
  notifyTtsError(userId: string, data: { taskId: string; error: string }) {
    this.sendToUser(userId, {
      type: "tts:error",
      data,
    });
  }

  /** 系统通知（广播给所有人） */
  notifyAll(
    message: string,
    level: "info" | "warn" | "error" = "info",
    options?: { duration?: number; display?: "toast" | "modal"; format?: "text" | "html" | "markdown"; title?: string },
  ): number {
    return this.broadcast({
      type: "notification",
      data: { message, level, ...options },
    });
  }

  /** 管理员消息 */
  notifyAdmins(message: string, data?: any): number {
    return this.broadcastToAdmins({
      type: "admin:broadcast",
      data: { message, ...data },
    });
  }

  // ========== 便捷方法：指纹通知推送 ==========

  /**
   * 通知指定用户需要上报指纹（管理员设置 requireFingerprint 后触发）
   * 前端收到后展示指纹采集 UI，防止 HTTP header 与 WS 双重触发
   * @param userId  目标用户 ID
   * @param enabled 是否启用指纹要求
   * @returns 去重 hash，同时也会通过 HTTP header X-Fingerprint-Hash 下发
   */
  notifyFingerprintRequired(userId: string, enabled: boolean): string {
    const ts = Date.now();
    // G5-31: hash 不含时间戳，去重才有效。
    const hash = generateFingerprintHash(userId, enabled);

    // 如果该 hash 已被前端确认处理过，不再推送
    if (this.processedFingerprintHashes.has(hash)) {
      logger.debug("[WS] 指纹通知已被处理，跳过推送", { userId, hash });
      return hash;
    }

    this.sendToUser(userId, {
      type: "fingerprint:require",
      data: {
        requireFingerprint: enabled,
        requireFingerprintAt: enabled ? ts : 0,
        hash,
      },
    });

    logger.info("[WS] 推送指纹通知", { userId, enabled, hash });
    return hash;
  }

  /**
   * 通知指定用户指纹已上报成功（清除前端指纹采集 UI）
   * @param userId 目标用户 ID
   */
  notifyFingerprintAck(userId: string): void {
    const hash = generateFingerprintHash(userId, false);

    this.sendToUser(userId, {
      type: "fingerprint:ack",
      data: {
        requireFingerprint: false,
        requireFingerprintAt: 0,
        hash,
        message: "指纹上报成功",
      },
    });

    logger.info("[WS] 推送指纹确认", { userId, hash });
  }

  /**
   * 检查指纹通知 hash 是否已被处理
   * 由 HTTP 中间件调用，避免与 WS 推送双重触发
   */
  isFingerprintHashProcessed(hash: string): boolean {
    return this.processedFingerprintHashes.has(hash);
  }

  /**
   * 记录指纹通知 hash 已被处理（HTTP 端调用）
   */
  markFingerprintHashProcessed(hash: string): void {
    this.processedFingerprintHashes.add(hash);
    // 清理过期的 hash
    if (this.processedFingerprintHashes.size > 200) {
      const arr = Array.from(this.processedFingerprintHashes);
      this.processedFingerprintHashes = new Set(arr.slice(-100));
    }
  }

  /**
   * 通知工单更新
   * @param userId 工单所属用户ID
   * @param ticket 完整的工单数据或更新的部分
   */
  notifyTicketUpdate(userId: string, ticket: any) {
    const view = toTicketView(ticket, false);
    // 发送给工单拥有者
    this.sendToUser(userId, {
      type: "ticket:update",
      data: view,
    });
    // 广播给所有管理员，以便实时查看处理进度
    this.broadcastToAdmins({
      type: "ticket:update",
      data: view,
    });
  }

  /**
   * 通知工单处理进度（审查、AI生成等）
   */
  notifyTicketProcess(userId: string, ticketId: string, step: TicketProcessStep) {
    this.sendToUser(userId, {
      type: "ticket:process",
      data: { ticketId, step },
    });
  }

  /**
   * 通知工单 AI 回复进度（流式传输）
   */
  notifyTicketAiResponse(userId: string, ticketId: string, content: string, isFinished = false) {
    this.sendToUser(userId, {
      type: "ticket:ai_response",
      data: { ticketId, content, isFinished },
    });
  }

  /** 获取当前连接数 */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /** 获取所有在线客户端信息（管理员用） */
  getOnlineClients(): Array<{
    userId: string | null;
    isAdmin: boolean;
    channels: string[];
    connectedSince: number;
    lastPing: number;
  }> {
    const result: Array<{
      userId: string | null;
      isAdmin: boolean;
      channels: string[];
      connectedSince: number;
      lastPing: number;
    }> = [];
    for (const [, client] of this.clients) {
      result.push({
        userId: client.userId,
        isAdmin: client.isAdmin,
        channels: Array.from(client.channels),
        connectedSince: client.connectedAt,
        lastPing: client.lastPing,
      });
    }
    return result;
  }

  /** 获取在线连接统计（管理员用） */
  getConnectionStats(): {
    total: number;
    authenticated: number;
    anonymous: number;
    admins: number;
    channels: Array<{ channel: string; connections: number }>;
  } {
    const channelMap = new Map<string, number>();
    let authenticated = 0;
    let anonymous = 0;
    let admins = 0;

    for (const [, client] of this.clients) {
      if (client.userId) authenticated++;
      else anonymous++;
      if (client.isAdmin) admins++;

      for (const channel of client.channels) {
        channelMap.set(channel, (channelMap.get(channel) || 0) + 1);
      }
    }

    return {
      total: this.clients.size,
      authenticated,
      anonymous,
      admins,
      channels: Array.from(channelMap.entries())
        .map(([channel, connections]) => ({ channel, connections }))
        .sort((a, b) => b.connections - a.connections || a.channel.localeCompare(b.channel)),
    };
  }

  /** 强制断开指定用户的所有连接 */
  kickUser(userId: string): number {
    const bucket = this.clientsByUserId.get(userId);
    if (!bucket) return 0;

    const fullMsg: WsServerMessage = {
      type: "notification",
      data: { message: "您已被管理员强制下线", level: "error" },
      timestamp: Date.now(),
    };
    const payload = JSON.stringify(fullMsg);
    let kicked = 0;
    for (const client of Array.from(bucket)) {
      this.sendRaw(client.ws, payload);
      client.ws.close(4001, "Kicked by admin");
      this.removeClient(client.ws);
      kicked++;
    }
    return kicked;
  }

  /** 用户角色、状态或存在性变化后，旧连接不得继续沿用缓存权限。 */
  invalidateUserAuthority(userId: string): number {
    const bucket = this.clientsByUserId.get(userId);
    if (!bucket) return 0;

    let closed = 0;
    for (const client of Array.from(bucket)) {
      client.ws.close(4003, "Authority changed");
      this.removeClient(client.ws);
      closed++;
    }
    return closed;
  }

  /** 关闭 WebSocket 服务 */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.server && this.upgradeHandler) {
      this.server.off("upgrade", this.upgradeHandler);
      this.server = null;
      this.upgradeHandler = null;
    }
    for (const [ws] of this.clients) {
      ws.terminate();
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.unsubscribeAuthorityChanges) {
      this.unsubscribeAuthorityChanges();
      this.unsubscribeAuthorityChanges = null;
    }
    EcoEnchantsOpsService.closeRpcWebSocket();
    this.clients.clear();
    this.clientsByUserId.clear();
    this.clientsByChannel.clear();
    this.clientsByIp.clear();
    this.processedFingerprintHashes.clear();
    this.pendingUpgradeAuth = new WeakMap<IncomingMessage, { identity: WebSocketIdentity; ip: string }>();
  }
}

// 单例导出
export const wsService = new WsService();
