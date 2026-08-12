import express from "express";
import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../../services/lumen/errors.js";
import { AdminCrashReport, CrashReport } from "../../models/lumen/index.js";

const router = express.Router();

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

/**
 * GET /crash-reports
 * List aggregated crash groups (admin_crash_reports), sorted by lastSeenAt desc.
 * Query params: limit (default 25, max 100), offset (default 0),
 * source (optional: "sdk" = anonymous lumen-crash-core ingest, "app" = Lumen app auth reports).
 */
router.get("/crash-reports", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const rawSource =
      typeof req.query.source === "string" ? req.query.source.trim().toLowerCase() : "";

    if ((req.query.limit !== undefined && !Number.isFinite(rawLimit)) ||
        (req.query.offset !== undefined && !Number.isFinite(rawOffset))) {
      throw ApiError.badRequest("limit 和 offset 必须为数字");
    }
    if (rawSource && rawSource !== "sdk" && rawSource !== "app") {
      throw ApiError.badRequest('source 必须为 "sdk" 或 "app"');
    }

    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    // A crash group can mix anonymous and authenticated reports, so a source
    // filter selects the groups that contain at least one matching report.
    const filter: Record<string, unknown> = {};
    if (rawSource) {
      const userIdMatcher = rawSource === "sdk" ? { $regex: "^sdk:" } : { $not: /^sdk:/ };
      const groupKeys = await CrashReport.distinct("groupKey", { userId: userIdMatcher });
      filter.groupKey = { $in: groupKeys };
    }

    const [groups, total] = await Promise.all([
      AdminCrashReport.find(filter)
        .sort({ lastSeenAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      AdminCrashReport.countDocuments(filter),
    ]);

    const mapped = groups.map((g) => ({
      groupKey: g.groupKey,
      versionCode: g.versionCode,
      count: g.count,
      affectedUsers: g.affectedUsers,
      risk: g.risk as "high" | "medium" | "low",
      cleanStack: g.cleanStack,
      lastSeenAt: g.lastSeenAt ? new Date(g.lastSeenAt).toISOString() : null,
    }));

    return res.json({ success: true, groups: mapped, total });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /crash-reports/:groupKey
 * List all individual crash reports for a given groupKey, sorted by crashedAtMillis desc.
 */
router.get("/crash-reports/:groupKey", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupKey } = req.params;

    if (!groupKey || typeof groupKey !== "string") {
      throw ApiError.badRequest("缺少 groupKey 参数");
    }

    const reports = await CrashReport.find({ groupKey })
      .sort({ crashedAtMillis: -1 })
      .lean();

    return res.json({ success: true, reports });
  } catch (error) {
    next(error);
  }
});

export default router;