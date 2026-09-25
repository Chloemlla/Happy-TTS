import type { Request, Response } from "express";
import type { IncomingHttpHeaders } from "node:http";
import { config } from "../config/config";
import { getServerStatusSnapshot, isServerStatusPasswordValid } from "../services/operationalStatusService";
import logger from "../utils/logger";

// G4-11: 日志只记录白名单请求头，禁止把整个 req.headers（含 cookie/authorization）写进日志。
const WHITELISTED_LOG_HEADERS = ["user-agent", "referer", "content-length"] as const;

function pickLogHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of WHITELISTED_LOG_HEADERS) {
    const value = headers[name];
    if (typeof value === "string" && value) {
      out[name] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      out[name] = value.join(", ");
    }
  }
  return out;
}

export class DiagnosticsController {
  static getFrontendConfig(_req: Request, res: Response): void {
    // 闸门是否生效 = 首访验证开着，且至少有一个风险源（IPQS 或 proxycheck）开着。
    // 只认 IPQS 会让 proxycheck-only 部署被前端当成"首访验证已关闭"：前端据此不发
    // /api/ip-verification/session，后端 evaluateIpRisk 永远不会被调用。
    const enableIpVerification =
      config.enableFirstVisitVerification && (config.ipqs.enabled || config.proxycheck.enabled);

    res.json({
      enableFirstVisitVerification: enableIpVerification,
      enableIpVerification,
      ipVerificationTtlMinutes: config.ipqs.tokenTtlMinutes,
    });
  }

  static ok(_req: Request, res: Response): void {
    res.sendStatus(200);
  }

  static reportDocsTimeout(req: Request, res: Response): void {
    const { url, timestamp, userAgent } = req.body || {};
    const parsedTimestamp = Date.parse(timestamp);

    logger.error("API文档加载超时", {
      url,
      timestamp: Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp).toISOString() : undefined,
      userAgent,
      ip: req.ip,
      headers: pickLogHeaders(req.headers),
    });

    res.json({ success: true });
  }

  static getServerStatus(req: Request, res: Response): void {
    if (!isServerStatusPasswordValid(req.body?.password)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json(getServerStatusSnapshot());
  }
}
