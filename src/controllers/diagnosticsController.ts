import type { Request, Response } from "express";
import { config } from "../config/config";
import { getServerStatusSnapshot, isServerStatusPasswordValid } from "../services/operationalStatusService";
import logger from "../utils/logger";

export class DiagnosticsController {
  static getFrontendConfig(_req: Request, res: Response): void {
    const enableIpVerification = config.enableFirstVisitVerification && config.ipqs.enabled;

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
      headers: req.headers,
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
