import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { collectObservedAddresses } from "./clientProbeService";
import { rejectUpgrade } from "./wsUpgradeUtils";
import logger from "../utils/logger";

/** 公开的 WebSocket 出口探测路径。 */
export const IP_PROBE_WS_PATH = "/ws/ip-probe";
/** 探测只需回一条小消息；maxPayload 只是入站帧上限，取最小值即可。 */
const IP_PROBE_MAX_PAYLOAD = 4096;

let probeWss: WebSocketServer | null = null;

/**
 * 观测地址的解析复用 clientProbeService.collectObservedAddresses：
 * 升级请求是裸 IncomingMessage（无 req.ip），extractRealIP 会回退到
 * cf-connecting-ip / socket.remoteAddress，正是这里需要的行为。
 */
function buildProbeMessage(req: IncomingMessage): string {
  const observed = collectObservedAddresses(req);
  return JSON.stringify({
    type: "ip-probe",
    observed: {
      ipv4: observed.ipv4,
      ipv6: observed.ipv6,
      socket: observed.socket,
      primary: observed.primary,
    },
    protocol: "ws",
    path: IP_PROBE_WS_PATH,
    t: Date.now(),
  });
}

/**
 * 独立的 WebSocketServer 实例：绝不复用 wsService 的 this.wss —— 那条路径的
 * connection 处理器要求 pendingUpgradeAuth（JWT 身份），而这是公开探测端点。
 * 因此这里也不需要心跳、不把连接登记进 wsService 的客户端表。
 */
export function initProbeWs(): void {
  if (probeWss) return;

  probeWss = new WebSocketServer({ noServer: true, maxPayload: IP_PROBE_MAX_PAYLOAD });
  probeWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // 公开端点：客户端可在任意时刻断开。没有 error 监听时 EventEmitter 会把未处理的
    // 'error' 抛成进程级未捕获异常（同 wsService.handleConnection 的处理）。
    ws.on("error", (error: Error) => {
      logger.debug("[WS] IP 探测连接异常", { error: error.message });
      ws.terminate();
    });

    // 连接建立即下发本连接的观测出口地址，随即正常关闭（close 帧在数据之后发出）。
    ws.send(buildProbeMessage(req));
    ws.close(1000, "Probe complete");
  });
  logger.info("[WS] IP 探测端点已启动", { path: IP_PROBE_WS_PATH });
}

export function closeProbeWs(): void {
  if (!probeWss) return;
  probeWss.close();
  probeWss = null;
}

/**
 * 处理 /ws/ip-probe 升级。IP 封禁与按 IP 限流由调用方（wsService.handleUpgrade）
 * 在调用本函数之前统一完成，这里只负责握手与下发。
 */
export function handleProbeUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
  const wss = probeWss;
  if (!wss || socket.destroyed) return rejectUpgrade(socket, 503, "Service Unavailable");

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
}
