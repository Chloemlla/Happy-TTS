import type { Request, Response } from "express";
import {
  cacheIpLocation,
  getCachedIpLocation,
  lookupIpLocation,
  normalizeIpAddress,
  recordClientReportedIp,
} from "../services/ipTelemetryService";
import { getIPInfo } from "../services/ip";
import logger from "../utils/logger";

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveRequestIp(req: Request): string | null {
  return (
    normalizeIpAddress(firstHeaderValue(req.headers["x-forwarded-for"])) ||
    normalizeIpAddress(firstHeaderValue(req.headers["x-real-ip"])) ||
    normalizeIpAddress(req.ip) ||
    normalizeIpAddress(req.socket.remoteAddress)
  );
}

export class IpInfoController {
  static async queryIpInfo(req: Request, res: Response): Promise<void> {
    const ip = normalizeIpAddress(firstHeaderValue(req.headers["x-real-ip"])) || normalizeIpAddress(req.ip) || "127.0.0.1";

    try {
      logger.info("收到IP信息查询请求", {
        ip,
        userAgent: req.headers["user-agent"],
      });

      const ipInfo = await getIPInfo(ip);
      logger.info("IP信息查询成功", { ip, ipInfo });
      res.json(ipInfo);
    } catch (error) {
      logger.error("IP信息查询失败", {
        ip,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "获取IP信息失败",
        ip,
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  static async reportClientIp(req: Request, res: Response): Promise<void> {
    try {
      const { ip: clientReportedIP, userAgent, url, referrer, timestamp } = req.body || {};
      const normalizedClientIp = clientReportedIP ? normalizeIpAddress(clientReportedIP) : undefined;
      if (clientReportedIP && !normalizedClientIp) {
        res.status(400).json({ error: "无效的IP地址" });
        return;
      }

      const realIP = resolveRequestIp(req) || "unknown";
      const ua = String(req.headers["user-agent"] || "");

      logger.info("前端上报公网IP", {
        clientReportedIP: normalizedClientIp,
        realIP,
        ua,
        userAgent,
        url,
        referrer,
        timestamp,
      });

      await recordClientReportedIp({
        clientReportedIP: normalizedClientIp,
        realIP,
        ua,
        userAgent,
        url,
        referrer,
        timestamp,
        receivedAt: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (error) {
      logger.error("处理 /api/report-ip 失败:", error);
      res.status(500).json({ error: "上报公网IP失败" });
    }
  }

  static async queryIpLocation(req: Request, res: Response): Promise<void> {
    const providedIp = typeof req.query.ip === "string" ? req.query.ip : undefined;
    const ip = normalizeIpAddress(providedIp) || (!providedIp ? resolveRequestIp(req) : null);

    if (!ip) {
      res.status(400).json({ error: "无效的IP地址" });
      return;
    }

    const realTime = req.query["real-time"] !== undefined;
    logger.info("获取IP位置信息", { ip, realTime });

    if (!realTime) {
      const cached = await getCachedIpLocation(ip);
      if (cached) {
        res.json({
          ip,
          location: cached.location,
          cachedAt: cached.cachedAt,
          message: "本次内容为缓存结果。您可以请求 /api/ip-location?real-time 来获取实时结果。",
        });
        return;
      }
    }

    const locationInfo = await lookupIpLocation(ip);
    await cacheIpLocation(ip, locationInfo);
    res.json({
      ip,
      location: locationInfo,
      message: realTime ? "实时结果" : "如果您提供的 IP 是 VPN 服务器的地址，位置信息可能不准确。",
    });
  }
}

