import crypto from "node:crypto";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { URL } from "node:url";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import logger from "../utils/logger";

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
  type: "pong" | "tts:progress" | "tts:complete" | "tts:error" | "notification" | "admin:broadcast" | "fingerprint:require" | "fingerprint:ack" | "ticket:update" | "ticket:process";
  data?: any;
  timestamp: number;
}

/** 工单处理细分状态 */
export type TicketProcessStep = "audit_start" | "audit_passed" | "ai_start" | "ai_complete" | "saving";

interface WsClient {
  ws: WebSocket;
  userId: string | null;
  isAdmin: boolean;
  channels: Set<string>;
  lastPing: number;
}

/**
 * 生成指纹通知的去重 hash
 * 同一事件只需处理一次，无论通过 HTTP header 还是 WS 推送到达前端
 */
function generateFingerprintHash(userId: string, enabled: boolean, ts: number): string {
  return crypto
    .createHash("sha256")
    .update(`fp:${userId}:${enabled}:${ts}`)
    .digest("hex")
    .substring(0, 16);
}

// ========== WebSocket 服务 ==========

class WsService {
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, WsClient>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

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
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // 心跳检测：每 30 秒清理无响应的连接
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [ws, client] of this.clients) {
        if (now - client.lastPing > 60_000) {
          logger.debug("[WS] 心跳超时，断开连接", { userId: client.userId });
          ws.terminate();
          this.clients.delete(ws);
        }
      }
    }, 30_000);

    logger.info("[WS] WebSocket 服务已启动，路径: /ws");
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    // 从 URL query 中提取 token 做认证
    const { userId, isAdmin } = this.authenticate(req);

    const client: WsClient = {
      ws,
      userId,
      isAdmin,
      channels: new Set(),
      lastPing: Date.now(),
    };
    this.clients.set(ws, client);

    logger.info("[WS] 新连接", { userId, isAdmin, total: this.clients.size });

    // 如果有 userId，自动订阅用户频道
    if (userId) {
      client.channels.add(`user:${userId}`);
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
      this.clients.delete(ws);
      logger.debug("[WS] 连接关闭", { userId, total: this.clients.size });
    });

    ws.on("error", (err: Error) => {
      logger.error("[WS] 连接错误", { userId, error: err.message });
      this.clients.delete(ws);
    });
  }

  /**
   * 从 ws://host/ws?token=xxx 中提取并验证 JWT
   */
  private authenticate(req: IncomingMessage): { userId: string | null; isAdmin: boolean } {
    try {
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) return { userId: null, isAdmin: false };

      const secret = process.env.JWT_SECRET || process.env.SERVER_PASSWORD || "default-secret";
      const decoded = jwt.verify(token, secret) as any;
      return {
        userId: decoded.userId || decoded.username || decoded.id || null,
        isAdmin: decoded.role === "admin" || decoded.isAdmin === true,
      };
    } catch {
      return { userId: null, isAdmin: false };
    }
  }

  private handleMessage(client: WsClient, msg: WsClientMessage) {
    switch (msg.type) {
      case "ping":
        client.lastPing = Date.now();
        this.send(client.ws, { type: "pong", timestamp: Date.now() });
        break;

      case "subscribe":
        if (msg.channel) {
          // 管理员频道只允许管理员订阅
          if (msg.channel.startsWith("admin:") && !client.isAdmin) break;
          client.channels.add(msg.channel);
        }
        break;

      case "unsubscribe":
        if (msg.channel) {
          client.channels.delete(msg.channel);
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

  private send(ws: WebSocket, msg: WsServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /** 发送给指定用户 */
  sendToUser(userId: string, msg: Omit<WsServerMessage, "timestamp">) {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    for (const [, client] of this.clients) {
      if (client.userId === userId) {
        this.send(client.ws, fullMsg);
      }
    }
  }

  /** 发送给订阅了某频道的所有客户端 */
  sendToChannel(channel: string, msg: Omit<WsServerMessage, "timestamp">) {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    for (const [, client] of this.clients) {
      if (client.channels.has(channel)) {
        this.send(client.ws, fullMsg);
      }
    }
  }

  /** 广播给所有已连接客户端 */
  broadcast(msg: Omit<WsServerMessage, "timestamp">) {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    for (const [, client] of this.clients) {
      this.send(client.ws, fullMsg);
    }
  }

  /** 广播给所有管理员 */
  broadcastToAdmins(msg: Omit<WsServerMessage, "timestamp">) {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    for (const [, client] of this.clients) {
      if (client.isAdmin) {
        this.send(client.ws, fullMsg);
      }
    }
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
  ) {
    this.broadcast({
      type: "notification",
      data: { message, level, ...options },
    });
  }

  /** 管理员消息 */
  notifyAdmins(message: string, data?: any) {
    this.broadcastToAdmins({
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
    const hash = generateFingerprintHash(userId, enabled, ts);

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
    const ts = Date.now();
    const hash = generateFingerprintHash(userId, false, ts);

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
    const payload = {
      type: "ticket:update",
      data: ticket,
    };
    // 发送给工单拥有者
    this.sendToUser(userId, payload);
    // 广播给所有管理员，以便实时查看处理进度
    this.broadcastToAdmins(payload);
  }

  /**
   * 通知工单处理进度（审查、AI生成等）
   */
  notifyTicketProcess(userId: string, ticketId: string, step: TicketProcessStep) {
    this.sendToUser(userId, {
      type: "ticket:process",
      data: { ticketId, step }
    });
  }

  /** 获取当前连接数 */
  getConnectionCount(): number {
    return this.clients.size;
  }

  /** 获取所有在线客户端信息（管理员用） */
  getOnlineClients(): Array<{ userId: string | null; isAdmin: boolean; channels: string[]; connectedSince: number }> {
    const result: Array<{ userId: string | null; isAdmin: boolean; channels: string[]; connectedSince: number }> = [];
    for (const [, client] of this.clients) {
      result.push({
        userId: client.userId,
        isAdmin: client.isAdmin,
        channels: Array.from(client.channels),
        connectedSince: client.lastPing,
      });
    }
    return result;
  }

  /** 强制断开指定用户的所有连接 */
  kickUser(userId: string): number {
    let kicked = 0;
    for (const [ws, client] of this.clients) {
      if (client.userId === userId) {
        this.send(ws, {
          type: "notification",
          data: { message: "您已被管理员强制下线", level: "error" },
          timestamp: Date.now(),
        });
        ws.close(4001, "Kicked by admin");
        this.clients.delete(ws);
        kicked++;
      }
    }
    return kicked;
  }

  /** 关闭 WebSocket 服务 */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
    this.clients.clear();
  }
}

// 单例导出
export const wsService = new WsService();
