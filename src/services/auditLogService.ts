import type { Request, Response, NextFunction } from "express";
import { AuditLogModel, type IAuditLog } from "../models/auditLogModel";
import logger from "../utils/logger";

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

/** 允许的模块白名单 */
const ALLOWED_MODULES = new Set([
  "auth",
  "user",
  "system",
  "cdk",
  "api",
  "admin",
  "security",
  "config",
  "email",
  "tts",
  "shorturl",
  "ipfs",
  "media",
  "network",
  "life",
  "social",
  "lottery",
  "workspace",
  "resource",
  "recommendation",
  "policy",
  "debug",
]);

const ALLOWED_RESULTS = new Set(["success", "failure"]);

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
    result?: string;
    startDate?: string;
    endDate?: string;
  }): Record<string, any> {
    const filter: Record<string, any> = {};

    if (params.requestId && /^[a-zA-Z0-9_-]+$/.test(params.requestId)) {
      filter.requestId = params.requestId;
    }

    if (params.module && ALLOWED_MODULES.has(params.module)) {
      filter.module = params.module;
    }
    if (params.action && /^[a-zA-Z0-9_.-]+$/.test(params.action)) {
      filter.action = String(params.action);
    }
    if (params.userId && /^[a-zA-Z0-9_-]+$/.test(params.userId)) {
      filter.userId = String(params.userId);
    }
    if (params.result && ALLOWED_RESULTS.has(params.result)) {
      filter.result = params.result;
    }

    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) {
        const d = new Date(params.startDate);
        if (!Number.isNaN(d.getTime())) dateFilter.$gte = d;
      }
      if (params.endDate) {
        const d = new Date(params.endDate);
        if (!Number.isNaN(d.getTime())) dateFilter.$lte = d;
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
    result?: string;
    startDate?: string;
    endDate?: string;
    keyword?: string;
  }) {
    const { page = 1, pageSize = 20 } = params;

    // 静态过滤条件（白名单校验，不含用户可控字符串）
    const filter = AuditLogService.buildStaticFilter(params);

    // keyword 搜索：净化后构造 RegExp 对象
    const safeKeyword = AuditLogService.sanitizeKeyword(params.keyword);
    if (safeKeyword) {
      const re = new RegExp(escapeRegex(safeKeyword), "i");
      filter.$or = [{ requestId: re }, { username: re }, { action: re }, { targetName: re }, { ip: re }];
    }

    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
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
  static async getStats() {
    const [byModule, byResult, recentCount] = await Promise.all([
      AuditLogModel.aggregate([{ $group: { _id: "$module", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      AuditLogModel.aggregate([{ $group: { _id: "$result", count: { $sum: 1 } } }]),
      AuditLogModel.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
    ]);

    return {
      byModule: byModule.map((m: { _id: string; count: number }) => ({ module: m._id, count: m.count })),
      byResult: byResult.map((r: { _id: string; count: number }) => ({ result: r._id, count: r.count })),
      last24h: recentCount,
      total: await AuditLogModel.estimatedDocumentCount(),
    };
  }

  /**
   * 全局审计中间件：自动拦截所有请求，覆盖所有事件
   */
  static globalAuditMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // 过滤掉静态文件、Swagger等非接口请求
      if (!req.originalUrl?.startsWith("/api/")) {
        return next();
      }

      const startTime = Date.now();
      let audited = false;

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      const writeAudit = (result: "success" | "failure", errorMessage?: string, resBody?: any) => {
        if (audited) return;
        audited = true;

        const user = (req as any).user;
        const durationMs = Date.now() - startTime;

        // 尝试从 URL 中推断 action 和 module
        const segments = req.path.split("/").filter(Boolean);
        const moduleName = segments[1] || "system"; // /api/moduleName
        const actionStr = `${req.method.toLowerCase()} ${req.path}`;

        let safeModule = "other" as IAuditLog["module"];
        if (ALLOWED_MODULES.has(moduleName)) {
          safeModule = moduleName as any;
        }

        // 脱敏与截断处理函数
        const sanitizePayload = (obj: any): any => {
          if (!obj) return obj;
          if (typeof obj === "string") return obj.length > 2000 ? obj.substring(0, 2000) + "..." : obj;
          if (typeof obj !== "object") return obj;
          if (Buffer.isBuffer(obj)) return "[Buffer]";

          let parsedObj = obj;
          // 若为对象，则深度克隆并脱敏
          try {
            parsedObj = JSON.parse(JSON.stringify(obj));
          } catch {
            return "[Unserializable Object]";
          }

          const sanitizeNode = (node: any) => {
            if (!node || typeof node !== "object") return;
            for (const key of Object.keys(node)) {
              if (typeof node[key] === "string" && node[key].length > 2000) {
                node[key] = node[key].substring(0, 2000) + "...[truncated]";
              } else if (typeof node[key] === "object") {
                sanitizeNode(node[key]);
              }
            }
          };
          sanitizeNode(parsedObj);
          return parsedObj;
        };

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
            query: Object.keys(req.query).length ? req.query : undefined,
            reqBody: Object.keys(req.body || {}).length ? sanitizePayload(req.body) : undefined,
            resBody: resBody !== undefined ? sanitizePayload(resBody) : undefined
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
      res.on('close', () => {
        if (!res.writableEnded) {
          writeAudit("failure", "Connection closed prematurely");
        }
      });

      next();
    };
  }
}
