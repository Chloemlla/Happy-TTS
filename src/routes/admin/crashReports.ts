import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { PipelineStage } from "mongoose";
import { ApiError } from "../../services/lumen/errors.js";
import { AdminCrashReport, CrashReport } from "../../models/lumen/index.js";
import {
  buildGroupFilter,
  buildGroupSort,
  parseGroupQuery,
  parseReportQuery,
} from "./crashReportQuery.js";

const router = express.Router();

interface GroupRow {
  groupKey: string;
  versionCode: number;
  count: number;
  affectedUsers: number;
  risk: string;
  cleanStack: string[];
  lastSeenAt: number | null;
}

interface GroupFacet {
  rows: GroupRow[];
  meta: Array<{ total: number }>;
}

const GROUP_PROJECTION = {
  _id: 0,
  groupKey: 1,
  versionCode: 1,
  count: 1,
  affectedUsers: 1,
  risk: 1,
  cleanStack: 1,
  lastSeenAt: 1,
} as const;

/** `risk` is stored as a label, so ordering by it needs a numeric weight. */
const RISK_WEIGHT_STAGE: PipelineStage = {
  $addFields: {
    riskWeight: {
      $switch: {
        branches: [
          { case: { $eq: ["$risk", "high"] }, then: 3 },
          { case: { $eq: ["$risk", "medium"] }, then: 2 },
        ],
        default: 1,
      },
    },
  },
};

/**
 * GET /crash-reports
 * List aggregated crash groups (admin_crash_reports).
 * Query params: limit (default 25, max 100), offset, source ("sdk" = anonymous
 * lumen-crash-core ingest, "app" = Lumen app auth reports), risk, versionCode,
 * search (groupKey / clean stack), sort, order.
 */
router.get("/crash-reports", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = parseGroupQuery(req.query as Record<string, unknown>);

    // A crash group can mix anonymous and authenticated reports, so a source
    // filter selects the groups that contain at least one matching report.
    // $group avoids distinct()'s 16MB single-document ceiling.
    let groupKeys: string[] | undefined;
    if (query.source) {
      const userIdMatcher = query.source === "sdk" ? { $regex: "^sdk:" } : { $not: /^sdk:/ };
      const keyRows = await CrashReport.aggregate<{ _id: string | null }>([
        { $match: { userId: userIdMatcher } },
        { $group: { _id: "$groupKey" } },
      ]).exec();
      groupKeys = keyRows
        .map((row) => row._id)
        .filter((key): key is string => typeof key === "string" && key.length > 0);
      if (groupKeys.length === 0) {
        return res.json({ success: true, groups: [], total: 0 });
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: buildGroupFilter(query, groupKeys) },
      ...(query.sort === "risk" ? [RISK_WEIGHT_STAGE] : []),
      { $sort: buildGroupSort(query) },
      {
        $facet: {
          rows: [{ $skip: query.offset }, { $limit: query.limit }, { $project: GROUP_PROJECTION }],
          meta: [{ $count: "total" }],
        },
      },
    ];

    const [facet] = await AdminCrashReport.aggregate<GroupFacet>(pipeline)
      .allowDiskUse(true)
      .exec();

    const groups = (facet?.rows ?? []).map((group) => ({
      groupKey: group.groupKey,
      versionCode: group.versionCode,
      count: group.count,
      affectedUsers: group.affectedUsers,
      risk: group.risk as "high" | "medium" | "low",
      cleanStack: group.cleanStack ?? [],
      lastSeenAt: group.lastSeenAt ? new Date(group.lastSeenAt).toISOString() : null,
    }));

    return res.json({ success: true, groups, total: facet?.meta?.[0]?.total ?? 0 });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /crash-reports/:groupKey
 * Page through the individual crash reports of a group, newest first.
 * Query params: limit (default 50, max 200), offset.
 */
router.get("/crash-reports/:groupKey", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupKey } = req.params;

    if (!groupKey || typeof groupKey !== "string") {
      throw ApiError.badRequest("缺少 groupKey 参数");
    }

    const { limit, offset } = parseReportQuery(req.query as Record<string, unknown>);
    const [reports, total] = await Promise.all([
      CrashReport.find({ groupKey })
        .sort({ crashedAtMillis: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      CrashReport.countDocuments({ groupKey }).exec(),
    ]);

    return res.json({ success: true, reports, total, limit, offset });
  } catch (error) {
    next(error);
  }
});

export default router;
