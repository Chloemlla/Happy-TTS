import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { URL } from "node:url";

/**
 * 从升级请求里解析 pathname。
 *
 * 从 wsService 抽出：wsService 已顶到 800 行闸门（新增 /ws/ip-probe 前 799 行），
 * 这两个函数与 WebSocket 服务状态无关、只依赖 req/socket，是内聚且零行为变化的一段。
 * 行为与抽出前逐字一致：解析失败返回空串（等价于未匹配任何已知升级路径）。
 */
export function getUpgradePathname(req: IncomingMessage): string {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
    return url.pathname;
  } catch {
    return "";
  }
}

/** 升级路径在 Express 中间件栈之外，失败时直接写回状态行并断开连接。 */
export function rejectUpgrade(socket: Socket, statusCode: number, statusText: string): void {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
