import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

// ========== 类型定义 ==========

/** 客户端 → 服务端消息 */
interface WsClientMessage {
  type: 'ping' | 'subscribe' | 'unsubscribe';
  channel?: string;
}

/** 服务端 → 客户端消息 */
export interface WsServerMessage {
  type: 'pong' | 'tts:progress' | 'tts:complete' | 'tts:error' | 'notification' | 'admin:broadcast';
  data?: any;
  timestamp: number;
}

interface WsClient {
  ws: WebSocket;
  userId: string | null;
  isAdmin: boolean;
  channels: Set<string>;
  lastPing: number;
}

// ========== WebSocket 服务 ==========

class WsService {
  private wss: WebSocketServer | null = null;
  private clients = new Map<WebSocket, WsClient>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * 将 WebSocket 服务器绑定到已有的 HTTP server
   */
  init(server: HttpServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // 心跳检测：每 30 秒清理无响应的连接
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [ws, client] of this.clients) {
        if (now - client.lastPing > 60_000) {
          logger.debug('[WS] 心跳超时，断开连接', { userId: client.userId });
          ws.terminate();
          this.clients.delete(ws);
        }
      }
    }, 30_000);

    logger.info('[WS] WebSocket 服务已启动，路径: /ws');
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

    logger.info('[WS] 新连接', { userId, isAdmin, total: this.clients.size });

    // 如果有 userId，自动订阅用户频道
    if (userId) {
      client.channels.add(`user:${userId}`);
    }

    ws.on('message', (raw: Buffer) => {
      try {
        const msg: WsClientMessage = JSON.parse(raw.toString());
        this.handleMessage(client, msg);
      } catch {
        // 忽略非法消息
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      logger.debug('[WS] 连接关闭', { userId, total: this.clients.size });
    });

    ws.on('error', (err: Error) => {
      logger.error('[WS] 连接错误', { userId, error: err.message });
      this.clients.delete(ws);
    });
  }

  /**
   * 从 ws://host/ws?token=xxx 中提取并验证 JWT
   */
  private authenticate(req: IncomingMessage): { userId: string | null; isAdmin: boolean } {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) return { userId: null, isAdmin: false };

      const secret = process.env.JWT_SECRET || process.env.SERVER_PASSWORD || 'default-secret';
      const decoded = jwt.verify(token, secret) as any;
      return {
        userId: decoded.userId || decoded.username || decoded.id || null,
        isAdmin: decoded.isAdmin === true || decoded.role === 'admin',
      };
    } catch {
      return { userId: null, isAdmin: false };
    }
  }

  private handleMessage(client: WsClient, msg: WsClientMessage) {
    switch (msg.type) {
      case 'ping':
        client.lastPing = Date.now();
        this.send(client.ws, { type: 'pong', timestamp: Date.now() });
        break;

      case 'subscribe':
        if (msg.channel) {
          // 管理员频道只允许管理员订阅
          if (msg.channel.startsWith('admin:') && !client.isAdmin) break;
          client.channels.add(msg.channel);
        }
        break;

      case 'unsubscribe':
        if (msg.channel) {
          client.channels.delete(msg.channel);
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
  sendToUser(userId: string, msg: Omit<WsServerMessage, 'timestamp'>) {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    for (const [, client] of this.clients) {
      if (client.userId === userId) {
        this.send(client.ws, fullMsg);
      }
    }
  }

  /** 发送给订阅了某频道的所有客户端 */
  sendToChannel(channel: string, msg: Omit<WsServerMessage, 'timestamp'>) {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    for (const [, client] of this.clients) {
      if (client.channels.has(channel)) {
        this.send(client.ws, fullMsg);
      }
    }
  }

  /** 广播给所有已连接客户端 */
  broadcast(msg: Omit<WsServerMessage, 'timestamp'>) {
    const fullMsg: WsServerMessage = { ...msg, timestamp: Date.now() };
    for (const [, client] of this.clients) {
      this.send(client.ws, fullMsg);
    }
  }

  /** 广播给所有管理员 */
  broadcastToAdmins(msg: Omit<WsServerMessage, 'timestamp'>) {
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
      type: 'tts:progress',
      data,
    });
  }

  /** TTS 生成完成 */
  notifyTtsComplete(userId: string, data: { taskId: string; audioUrl: string; fileName: string }) {
    this.sendToUser(userId, {
      type: 'tts:complete',
      data,
    });
  }

  /** TTS 生成失败 */
  notifyTtsError(userId: string, data: { taskId: string; error: string }) {
    this.sendToUser(userId, {
      type: 'tts:error',
      data,
    });
  }

  /** 系统通知（广播给所有人） */
  notifyAll(message: string, level: 'info' | 'warn' | 'error' = 'info') {
    this.broadcast({
      type: 'notification',
      data: { message, level },
    });
  }

  /** 管理员消息 */
  notifyAdmins(message: string, data?: any) {
    this.broadcastToAdmins({
      type: 'admin:broadcast',
      data: { message, ...data },
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
        this.send(ws, { type: 'notification', data: { message: '您已被管理员强制下线', level: 'error' }, timestamp: Date.now() });
        ws.close(4001, 'Kicked by admin');
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
