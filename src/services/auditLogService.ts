import type { NextFunction, Request, Response } from "express";
import { AuditLogModel, type IAuditLog } from "../models/auditLogModel";
import logger from "../utils/logger";
import {
  ALLOWED_AUDIT_MODULES,
  inferAuditModuleFromPath,
  isAuditLogRuntimeEnabled,
  isBackendApiPath,
} from "./auditLogMetadata";

export interface AuditEntry {
  requestId?: string;
  userId: string;
  username: string;
  role: string;
  action: string;
  module: IAuditLog["module"];
  targetId?: string;
  targetName?: string;
  result: "success" | "failure";
  errorMessage?: string;
  detail?: Record<string, any>;
  ip: string;
  userAgent?: string;
  path?: string;
  method?: string;
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, (ch) => `\\${ch}`);
}

const ALLOWED_RESULTS = new Set(["success", "failure"]);
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5000;
const AUDIT_LOG_RETENTION_DAYS = 90;

const AUDIT_LOG_DEDUP_ROUTE_LOGS = process.env.AUDIT_LOG_DEDUP_ROUTE_LOGS !== "false";
const AUDIT_LOG_CAPTURE_PAYLOADS = process.env.AUDIT_LOG_CAPTURE_PAYLOADS === "true";
const AUDIT_LOG_CAPTURE_SUCCESS_PAYLOADS = process.env.AUDIT_LOG_CAPTURE_SUCCESS_PAYLOADS === "true";
const parsedAuditPayloadLimit = Number(process.env.AUDIT_PAYLOAD_STRING_LIMIT || 1000);
const AUDIT_PAYLOAD_STRING_LIMIT = Number.isFinite(parsedAuditPayloadLimit)
  ? Math.max(256, Math.min(4000, parsedAuditPayloadLimit))
  : 1000;

function shouldCapturePayload(result: "success" | "failure"): boolean {
  if (!AUDIT_LOG_CAPTURE_PAYLOADS) {
    return false;
  }
  return result === "failure" || AUDIT_LOG_CAPTURE_SUCCESS_PAYLOADS;
}

function sanitizePayload(obj: any): any {
  if (!obj) return obj;
  if (typeof obj === "string") {
    return obj.length > AUDIT_PAYLOAD_STRING_LIMIT ? `${obj.substring(0, AUDIT_PAYLOAD_STRING_LIMIT)}...` : obj;
  }
  if (typeof obj !== "object") return obj;
  if (Buffer.isBuffer(obj)) return "[Buffer]";

  let parsedObj = obj;
  try {
    parsedObj = JSON.parse(JSON.stringify(obj));
  } catch {
    return "[Unserializable Object]";
  }

  const sanitizeNode = (node: any) => {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) {
      if (typeof node[key] === "string" && node[key].length > AUDIT_PAYLOAD_STRING_LIMIT) {
        node[key] = `${node[key].substring(0, AUDIT_PAYLOAD_STRING_LIMIT)}...[truncated]`;
      } else if (typeof node[key] === "object") {
        sanitizeNode(node[key]);
      }
    }
  };
  sanitizeNode(parsedObj);
  return parsedObj;
}

function getRequestPathname(req: Request): string {
  const rawPath = req.path || req.originalUrl || req.url || "";
  const [pathname] = rawPath.split("?");
  return pathname || "/";
}

export interface AuditLogQueryParams {
  page?: number;
  pageSize?: number;
  requestId?: string;
  module?: string;
  action?: string;
  userId?: string;
  username?: string;
  role?: string;
  result?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  method?: string;
  path?: string;
  ip?: string;
  targetId?: string;
  targetName?: string;
  statusCode?: number | string;
  minDurationMs?: number | string;
  maxDurationMs?: number | string;
}

function safePageNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function parseBoundedInteger(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  const integer = Math.floor(parsed);
  if (integer < min || integer > max) {
    return undefined;
  }

  return integer;
}

function parseDateBoundary(value: string, boundary: "start" | "end"): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z";
    const date = new Date(`${trimmed}${suffix}`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function sanitizedText(value: unknown, maxLength: number, pattern: RegExp): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().slice(0, maxLength);
  if (!trimmed || !pattern.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function escapedContainsFilter(value: string): RegExp {
  return new RegExp(escapeRegex(value), "i");
}

function getDetailNumber(log: Record<string, any>, key: "durationMs" | "statusCode"): number | undefined {
  const value = log.detail?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  const raw =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value);
  const neutralized = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

function mergeRecentDateFilter(createdAtFilter: unknown, since: Date): Record<string, Date> {
  const current =
    createdAtFilter && typeof createdAtFilter === "object" && !Array.isArray(createdAtFilter)
      ? (createdAtFilter as Record<string, Date>)
      : {};

  const merged: Record<string, Date> = { ...current };
  if (!merged.$gte || merged.$gte < since) {
    merged.$gte = since;
  }

  return merged;
}

export class AuditLogService {
  /**
   * 写入一条审计日志（fire-and-forget，不阻塞业务）
   */
  static async log(entry: AuditEntry): Promise<void> {
    try {
      await AuditLogModel.create({
        ...entry,
        createdAt: new Date(),
      });
    } catch (err) {
      logger.error("[AuditLog] 写入失败", { err, entry });
    }
  }

  /**
   * 构建安全的静态过滤条件（不含任何用户可控字符串）
   */
  private static buildStaticFilter(params: {
    requestId?: string;
    module?: string;
    action?: string;
    userId?: string;
    username?: string;
    role?: string;
    result?: string;
    startDate?: string;
    endDate?: string;
    method?: string;
    path?: string;
    ip?: string;
    targetId?: string;
    targetName?: string;
    statusCode?: number | string;
    minDurationMs?: number | string;
    maxDurationMs?: number | string;
  }): Record<string, any> {
    const filter: Record<string, any> = {};

    const requestId = sanitizedText(params.requestId, 80, /^[a-zA-Z0-9_-]+$/);
    if (requestId) {
      filter.requestId = requestId;
    }

    if (params.module && ALLOWED_AUDIT_MODULES.has(params.module as IAuditLog["module"])) {
      filter.module = params.module;
    }
    const action = sanitizedText(params.action, 100, /^[a-zA-Z0-9_.:/ -]+$/);
    if (action) {
      filter.action = escapedContainsFilter(action);
    }
    const userId = sanitizedText(params.userId, 80, /^[a-zA-Z0-9_-]+$/);
    if (userId) {
      filter.userId = userId;
    }
    const username = sanitizedText(params.username, 80, /^[a-zA-Z0-9\u4e00-\u9fff @._-]+$/);
    if (username) {
      filter.username = escapedContainsFilter(username);
    }
    const role = sanitizedText(params.role, 40, /^[a-zA-Z0-9_-]+$/);
    if (role) {
      filter.role = role;
    }
    if (params.result && ALLOWED_RESULTS.has(params.result)) {
      filter.result = params.result;
    }
    const method = typeof params.method === "string" ? params.method.trim().toUpperCase() : "";
    if (ALLOWED_METHODS.has(method)) {
      filter.method = method;
    }
    const path = sanitizedText(params.path, 200, /^[a-zA-Z0-9/?#&=._~:%+-]+$/);
    if (path) {
      filter.path = escapedContainsFilter(path);
    }
    const ip = sanitizedText(params.ip, 80, /^[a-zA-Z0-9:._-]+$/);
    if (ip) {
      filter.ip = escapedContainsFilter(ip);
    }
    const targetId = sanitizedText(params.targetId, 100, /^[a-zA-Z0-9_.:-]+$/);
    if (targetId) {
      filter.targetId = targetId;
    }
    const targetName = sanitizedText(params.targetName, 100, /^[a-zA-Z0-9\u4e00-\u9fff @._:-]+$/);
    if (targetName) {
      filter.targetName = escapedContainsFilter(targetName);
    }

    const statusCode = parseBoundedInteger(params.statusCode, 100, 599);
    if (statusCode !== undefined) {
      filter["detail.statusCode"] = statusCode;
    }
    const minDurationMs = parseBoundedInteger(params.minDurationMs, 0, 60 * 60 * 1000);
    const maxDurationMs = parseBoundedInteger(params.maxDurationMs, 0, 60 * 60 * 1000);
    const durationFilter: Record<string, number> = {};
    if (minDurationMs !== undefined) {
      durationFilter.$gte = minDurationMs;
    }
    if (maxDurationMs !== undefined) {
      durationFilter.$lte = maxDurationMs;
    }
    if (Object.keys(durationFilter).length > 0) {
      filter["detail.durationMs"] = durationFilter;
    }

    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) {
        const d = parseDateBoundary(params.startDate, "start");
        if (d) dateFilter.$gte = d;
      }
      if (params.endDate) {
        const d = parseDateBoundary(params.endDate, "end");
        if (d) dateFilter.$lte = d;
      }
      if (Object.keys(dateFilter).length > 0) filter.createdAt = dateFilter;
    }

    return filter;
  }

  /**
   * 将 keyword 净化为纯字母数字（彻底切断污点链）
   */
  private static sanitizeKeyword(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    // 只保留字母、数字、空格、@、.、-、_，最长 100 字符
    const cleaned = raw.replace(/[^a-zA-Z0-9\u4e00-\u9fff @._-]/g, "").slice(0, 100);
    return cleaned.length > 0 ? cleaned : null;
  }

  /**
   * 分页查询审计日志
   */
  static async query(params: {
    page?: number;
    pageSize?: number;
    requestId?: string;
    module?: string;
    action?: string;
    userId?: string;
    username?: string;
    role?: string;
    result?: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
    method?: string;
    path?: string;
    ip?: string;
    targetId?: string;
    targetName?: string;
    statusCode?: number | string;
    minDurationMs?: number | string;
    maxDurationMs?: number | string;
  }) {
    const page = safePageNumber(params.page, 1);
    const pageSize = safePageNumber(params.pageSize, 20);

    // 静态过滤条件统一白名单校验；模糊匹配字段只使用转义后的 RegExp。
    const filter = AuditLogService.buildStaticFilter(params);

    // keyword 搜索：净化后构造 RegExp 对象
    const safeKeyword = AuditLogService.sanitizeKeyword(params.keyword);
    if (safeKeyword) {
      const re = new RegExp(escapeRegex(safeKeyword), "i");
      filter.$or = [
        { requestId: re },
        { username: re },
        { userId: re },
        { action: re },
        { targetId: re },
        { targetName: re },
        { ip: re },
        { path: re },
      ];
    }

    const safePage = Math.max(1, page);
    const safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
    const skip = (safePage - 1) * safeSize;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeSize).lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return { logs, total, page: safePage, pageSize: safeSize };
  }

  /**
   * 获取模块和操作类型的聚合统计
   */
  static async getStats(params: AuditLogQueryParams = {}) {
    const filter = AuditLogService.buildStaticFilter(params);
    const safeKeyword = AuditLogService.sanitizeKeyword(params.keyword);
    if (safeKeyword) {
      const re = new RegExp(escapeRegex(safeKeyword), "i");
      filter.$or = [
        { requestId: re },
        { username: re },
        { userId: re },
        { action: re },
        { targetId: re },
        { targetName: re },
        { ip: re },
        { path: re },
      ];
    }

    const matchStage = Object.keys(filter).length > 0 ? [{ $match: filter }] : [];
    const recentFilter = {
      ...filter,
      createdAt: mergeRecentDateFilter(filter.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
    };

    const [total, byModule, byResult, topActions, topUsers, byMethod, byStatusCode, durationStats, recentCount] =
      await Promise.all([
        AuditLogModel.countDocuments(filter),
        AuditLogModel.aggregate([...matchStage, { $group: { _id: "$module", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
        AuditLogModel.aggregate([...matchStage, { $group: { _id: "$result", count: { $sum: 1 } } }]),
        AuditLogModel.aggregate([
          ...matchStage,
          { $group: { _id: "$action", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
        AuditLogModel.aggregate([
          ...matchStage,
          { $group: { _id: "$username", userId: { $first: "$userId" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
        AuditLogModel.aggregate([...matchStage, { $group: { _id: "$method", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
        AuditLogModel.aggregate([
          ...matchStage,
          { $match: { "detail.statusCode": { $type: "number" } } },
          { $group: { _id: "$detail.statusCode", count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ]),
        AuditLogModel.aggregate([
          ...matchStage,
          { $match: { "detail.durationMs": { $type: "number" } } },
          {
            $group: {
              _id: null,
              averageDurationMs: { $avg: "$detail.durationMs" },
              maxDurationMs: { $max: "$detail.durationMs" },
            },
          },
        ]),
        AuditLogModel.countDocuments(recentFilter),
    ]);

    return {
      byModule: byModule.map((m: { _id: string; count: number }) => ({ module: m._id, count: m.count })),
      byResult: byResult.map((r: { _id: string; count: number }) => ({ result: r._id, count: r.count })),
      topActions: topActions.map((a: { _id: string; count: number }) => ({ action: a._id, count: a.count })),
      topUsers: topUsers.map((u: { _id: string; userId?: string; count: number }) => ({
        username: u._id || "unknown",
        userId: u.userId || "unknown",
        count: u.count,
      })),
      byMethod: byMethod
        .filter((m: { _id?: string; count: number }) => Boolean(m._id))
        .map((m: { _id: string; count: number }) => ({ method: m._id, count: m.count })),
      byStatusCode: byStatusCode.map((s: { _id: number; count: number }) => ({ statusCode: s._id, count: s.count })),
      averageDurationMs: Math.round(durationStats[0]?.averageDurationMs || 0),
      maxDurationMs: durationStats[0]?.maxDurationMs || 0,
      last24h: recentCount,
      total,
    };
  }

  static getCapabilities() {
    return {
      modules: Array.from(ALLOWED_AUDIT_MODULES).sort(),
      results: Array.from(ALLOWED_RESULTS),
      methods: Array.from(ALLOWED_METHODS),
      maxPageSize: MAX_PAGE_SIZE,
      maxExportRows: MAX_EXPORT_ROWS,
      retentionDays: AUDIT_LOG_RETENTION_DAYS,
      payloadCaptureEnabled: AUDIT_LOG_CAPTURE_PAYLOADS,
      successPayloadCaptureEnabled: AUDIT_LOG_CAPTURE_SUCCESS_PAYLOADS,
    };
  }

  static async exportCsv(params: AuditLogQueryParams = {}) {
    const filter = AuditLogService.buildStaticFilter(params);
    const safeKeyword = AuditLogService.sanitizeKeyword(params.keyword);
    if (safeKeyword) {
      const re = new RegExp(escapeRegex(safeKeyword), "i");
      filter.$or = [
        { requestId: re },
        { username: re },
        { userId: re },
        { action: re },
        { targetId: re },
        { targetName: re },
        { ip: re },
        { path: re },
      ];
    }

    const logs = await AuditLogModel.find(filter).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS).lean();
    const headers = [
      "createdAt",
      "result",
      "module",
      "action",
      "username",
      "userId",
      "role",
      "method",
      "path",
      "statusCode",
      "durationMs",
      "ip",
      "requestId",
      "targetId",
      "targetName",
      "errorMessage",
      "userAgent",
      "detail",
    ];

    const rows = logs.map((log: Record<string, any>) =>
      [
        log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
        log.result,
        log.module,
        log.action,
        log.username,
        log.userId,
        log.role,
        log.method,
        log.path,
        getDetailNumber(log, "statusCode"),
        getDetailNumber(log, "durationMs"),
        log.ip,
        log.requestId,
        log.targetId,
        log.targetName,
        log.errorMessage,
        log.userAgent,
        log.detail,
      ]
        .map(csvCell)
        .join(","),
    );

    return {
      csv: [headers.join(","), ...rows].join("\n"),
      count: logs.length,
      maxRows: MAX_EXPORT_ROWS,
      filename: `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  /**
   * 全局审计中间件：自动拦截所有请求，覆盖所有事件
   */
  static globalAuditMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!isAuditLogRuntimeEnabled()) {
        return next();
      }

      const pathname = getRequestPathname(req);

      // 过滤掉静态文件、Swagger UI 等非 API 请求
      if (!isBackendApiPath(pathname)) {
        return next();
      }

      const startTime = Date.now();
      let audited = false;

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const writeAudit = (result: "success" | "failure", errorMessage?: string, resBody?: any) => {
        if (audited) return;
        audited = true;

        if (AUDIT_LOG_DEDUP_ROUTE_LOGS && (req as any).__routeAuditEnabled) {
          return;
        }

        const user = (req as any).user;
        const durationMs = Date.now() - startTime;

        const safeModule = inferAuditModuleFromPath(pathname);
        const actionStr = `${req.method.toLowerCase()} ${pathname}`;

        const capturePayload = shouldCapturePayload(result);

        const entry: AuditEntry = {
          requestId: (req as any).requestId,
          userId: user?.id || user?._id || "unknown",
          username: user?.username || user?.name || "unknown",
          role: user?.role || "unknown",
          action: actionStr.substring(0, 100),
          module: safeModule,
          result,
          errorMessage: errorMessage ? String(errorMessage).substring(0, 500) : undefined,
          detail: {
            durationMs,
            statusCode: res.statusCode,
            query: Object.keys(req.query).length ? req.query : undefined,
            reqBody: capturePayload && Object.keys(req.body || {}).length ? sanitizePayload(req.body) : undefined,
            resBody: capturePayload && resBody !== undefined ? sanitizePayload(resBody) : undefined,
          },
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"],
          path: req.originalUrl || req.path,
          method: req.method,
        };

        AuditLogService.log(entry).catch((err) => {
          logger.error("[GlobalAudit] 写入全局审计日志失败", err);
        });
      };

      res.json = (body: any) => {
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 400) {
          writeAudit("success", undefined, body);
        } else {
          writeAudit("failure", body?.error || body?.message || "Request failed", body);
        }
        return originalJson(body);
      };

      res.send = (body: any) => {
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 400) {
          writeAudit("success", undefined, body);
        } else {
          writeAudit("failure", typeof body === "string" ? body : "Request failed", body);
        }
        return originalSend(body);
      };

      // 捕获请求异常终止
      res.on("close", () => {
        if (!res.writableEnded) {
          writeAudit("failure", "Connection closed prematurely");
        }
      });

      next();
    };
  }
}
