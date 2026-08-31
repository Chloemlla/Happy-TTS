/**
 * NexAI 云同步控制器
 * 处理所有 /api/nexai/sync/* 请求
 */
import type { Request, Response } from "express";
import type { SyncCategory } from "../models/nexaiSyncModel";
import { NexaiSyncService, NexaiSyncTooLargeError, NexaiSyncVersionConflictError } from "../services/nexaiSyncService";
import logger from "../utils/logger";

const VALID_CATEGORIES: SyncCategory[] = [
  "settings",
  "notes",
  "conversations",
  "translations",
  "passwords",
  "shortUrls",
];

// G4-20: 每个数组类别的条目数与单条体积上限（超过返回 413）
const SYNC_ARRAY_LIMITS: Record<string, { maxItems: number; maxItemBytes: number }> = {
  notes: { maxItems: 2000, maxItemBytes: 16 * 1024 },
  conversations: { maxItems: 1000, maxItemBytes: 64 * 1024 },
  translationHistory: { maxItems: 5000, maxItemBytes: 8 * 1024 },
  savedPasswords: { maxItems: 500, maxItemBytes: 4 * 1024 },
  shortUrls: { maxItems: 2000, maxItemBytes: 2 * 1024 },
};
const SYNC_MAX_SETTINGS_BYTES = 64 * 1024;
const SYNC_MAX_PAYLOAD_BYTES = 15 * 1024 * 1024;

function jsonBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null));
  } catch {
    return 0;
  }
}

function validateSyncPayload(payload: Record<string, unknown>): string | null {
  if (jsonBytes(payload) > SYNC_MAX_PAYLOAD_BYTES) {
    return "同步数据总体积超过上限";
  }
  for (const [key, limits] of Object.entries(SYNC_ARRAY_LIMITS)) {
    const value = payload[key];
    if (value === undefined || value === null) continue;
    if (!Array.isArray(value)) return `${key} 必须是数组`;
    if (value.length > limits.maxItems) return `${key} 条目数超过上限 (${limits.maxItems})`;
    for (const item of value) {
      if (jsonBytes(item) > limits.maxItemBytes) return `${key} 存在单条超过体积上限 (${limits.maxItemBytes} bytes)`;
    }
  }
  if (payload.settings !== undefined && payload.settings !== null && jsonBytes(payload.settings) > SYNC_MAX_SETTINGS_BYTES) {
    return "settings 体积超过上限";
  }
  return null;
}

function getRequiredNexaiUserId(req: Request, res: Response): string | null {
    const userId = req.nexaiUser?.id;
    if (userId) {
        return userId;
    }

    res.status(401).json({
        success: false,
        error: "Unauthorized",
        code: "NEXAI_AUTH_REQUIRED",
    });
    return null;
}

function sendSyncError(res: Response, error: unknown): boolean {
  if (error instanceof NexaiSyncVersionConflictError) {
    res.status(409).json({ success: false, error: error.message, code: "NEXAI_SYNC_VERSION_CONFLICT" });
    return true;
  }
  if (error instanceof NexaiSyncTooLargeError) {
    res.status(413).json({ success: false, error: error.message, code: "NEXAI_SYNC_TOO_LARGE" });
    return true;
  }
  return false;
}

export class NexaiSyncController {
    /**
     * GET /api/nexai/sync
     * 获取用户全部同步数据
     */
    static async getSyncData(req: Request, res: Response) {
        try {
            const userId = getRequiredNexaiUserId(req, res);
            if (!userId) return;
            const data = await NexaiSyncService.getSyncData(userId);

            if (!data) {
                return res.json({
                    success: true,
                    data: null,
                    message: "暂无同步数据",
                });
            }

            res.json({ success: true, data });
        } catch (error) {
            logger.error("[NexAI Sync] GET /sync error:", error);
            res.status(500).json({
                success: false,
                error: "获取同步数据失败",
                code: "NEXAI_SYNC_GET_ERROR",
            });
        }
    }

    /**
     * PUT /api/nexai/sync
     * 全量上传同步数据
     */
    static async putSyncData(req: Request, res: Response) {
        try {
            const userId = getRequiredNexaiUserId(req, res);
            if (!userId) return;
            const {
                settings,
                notes,
                conversations,
                translationHistory,
                savedPasswords,
                shortUrls,
                baseVersion,
            } = req.body;

            // G4-20: 控制器层条目数/单条体积校验，超限 413
            const validationError = validateSyncPayload({
                settings,
                notes,
                conversations,
                translationHistory,
                savedPasswords,
                shortUrls,
            });
            if (validationError) {
                return res.status(413).json({
                    success: false,
                    error: validationError,
                    code: "NEXAI_SYNC_TOO_LARGE",
                });
            }

            // G4-21: PUT 必须携带 baseVersion
            const baseVersionNum = Number(baseVersion);
            if (!Number.isInteger(baseVersionNum) || baseVersionNum < 1) {
                return res.status(400).json({
                    success: false,
                    error: "缺少有效的 baseVersion 参数",
                    code: "NEXAI_SYNC_MISSING_BASE_VERSION",
                });
            }

            const data = await NexaiSyncService.putSyncData(
                userId,
                {
                    settings,
                    notes,
                    conversations,
                    translationHistory,
                    savedPasswords,
                    shortUrls,
                },
                baseVersionNum,
            );

            res.json({
                success: true,
                data: { lastSyncedAt: data.lastSyncedAt, version: data.version },
                message: "同步数据已上传",
            });
        } catch (error) {
            if (sendSyncError(res, error)) return;
            logger.error("[NexAI Sync] PUT /sync error:", error);
            res.status(500).json({
                success: false,
                error: "上传同步数据失败",
                code: "NEXAI_SYNC_PUT_ERROR",
            });
        }
    }

    /**
     * PATCH /api/nexai/sync/:category
     * 按类别局部更新
     */
    static async patchSyncData(req: Request, res: Response) {
        try {
            const userId = getRequiredNexaiUserId(req, res);
            if (!userId) return;
            const category = req.params.category as SyncCategory;

            if (!VALID_CATEGORIES.includes(category)) {
                return res.status(400).json({
                    success: false,
                    error: `无效的同步类别: ${category}`,
                    validCategories: VALID_CATEGORIES,
                    code: "NEXAI_SYNC_INVALID_CATEGORY",
                });
            }

            const { data: categoryData } = req.body;
            if (categoryData === undefined) {
                return res.status(400).json({
                    success: false,
                    error: "请求体中缺少 data 字段",
                    code: "NEXAI_SYNC_MISSING_DATA",
                });
            }

            // G4-20: 局部更新同样做体积校验
            const categoryFieldMap: Record<SyncCategory, string> = {
                settings: "settings",
                notes: "notes",
                conversations: "conversations",
                translations: "translationHistory",
                passwords: "savedPasswords",
                shortUrls: "shortUrls",
            };
            const field = categoryFieldMap[category];
            const validationError = validateSyncPayload({ [field]: categoryData });
            if (validationError) {
                return res.status(413).json({
                    success: false,
                    error: validationError,
                    code: "NEXAI_SYNC_TOO_LARGE",
                });
            }

            const result = await NexaiSyncService.patchSyncData(userId, category, categoryData);

            res.json({
                success: true,
                data: { lastSyncedAt: result?.lastSyncedAt },
                message: `${category} 同步数据已更新`,
            });
        } catch (error) {
            if (sendSyncError(res, error)) return;
            logger.error("[NexAI Sync] PATCH /sync/:category error:", error);
            res.status(500).json({
                success: false,
                error: "更新同步数据失败",
                code: "NEXAI_SYNC_PATCH_ERROR",
            });
        }
    }

    /**
     * DELETE /api/nexai/sync
     * 清除所有同步数据
     */
    static async deleteSyncData(req: Request, res: Response) {
        try {
            const userId = getRequiredNexaiUserId(req, res);
            if (!userId) return;
            const deleted = await NexaiSyncService.deleteSyncData(userId);

            res.json({
                success: true,
                deleted,
                message: deleted ? "同步数据已清除" : "暂无同步数据需要清除",
            });
        } catch (error) {
            logger.error("[NexAI Sync] DELETE /sync error:", error);
            res.status(500).json({
                success: false,
                error: "清除同步数据失败",
                code: "NEXAI_SYNC_DELETE_ERROR",
            });
        }
    }

    /**
     * GET /api/nexai/sync/meta
     * 获取同步元信息（轻量级——仅返回 lastSyncedAt）
     */
    static async getSyncMeta(req: Request, res: Response) {
        try {
            const userId = getRequiredNexaiUserId(req, res);
            if (!userId) return;
            const meta = await NexaiSyncService.getSyncMeta(userId);

            res.json({ success: true, data: meta });
        } catch (error) {
            logger.error("[NexAI Sync] GET /sync/meta error:", error);
            res.status(500).json({
                success: false,
                error: "获取同步状态失败",
                code: "NEXAI_SYNC_META_ERROR",
            });
        }
    }

    /**
     * GET /api/nexai/sync/changes?since=ISO8601
     * 增量拉取：获取 since 之后变更的数据
     */
    static async getChangesSince(req: Request, res: Response) {
        try {
            const userId = getRequiredNexaiUserId(req, res);
            if (!userId) return;
            const since = req.query.since as string;

            if (!since) {
                return res.status(400).json({
                    success: false,
                    error: "缺少 since 参数（ISO 8601 时间戳）",
                    code: "NEXAI_SYNC_MISSING_SINCE",
                });
            }

            const changes = await NexaiSyncService.getChangesSince(userId, since);

            res.json({ success: true, data: changes });
        } catch (error) {
            logger.error("[NexAI Sync] GET /sync/changes error:", error);
            res.status(500).json({
                success: false,
                error: "获取增量变更失败",
                code: "NEXAI_SYNC_CHANGES_ERROR",
            });
        }
    }

    /**
     * POST /api/nexai/sync/incremental
     * 增量同步：客户端上传变更 + 获取服务端变更
     * body: { lastSyncedAt: string, data: IIncrementalSyncRequest }
     */
    static async incrementalSync(req: Request, res: Response) {
        try {
            const userId = getRequiredNexaiUserId(req, res);
            if (!userId) return;
            const { lastSyncedAt, data } = req.body;

            if (!lastSyncedAt) {
                return res.status(400).json({
                    success: false,
                    error: "缺少 lastSyncedAt 参数",
                    code: "NEXAI_SYNC_MISSING_LAST_SYNCED",
                });
            }

            if (!data || typeof data !== "object") {
                return res.status(400).json({
                    success: false,
                    error: "缺少 data 字段",
                    code: "NEXAI_SYNC_MISSING_DATA",
                });
            }

            // G4-20: 增量合并同样做条目/体积校验
            const validationError = validateSyncPayload(data as Record<string, unknown>);
            if (validationError) {
                return res.status(413).json({
                    success: false,
                    error: validationError,
                    code: "NEXAI_SYNC_TOO_LARGE",
                });
            }

            const serverChanges = await NexaiSyncService.mergeIncrementalData(
                userId,
                data,
                lastSyncedAt,
            );

            res.json({
                success: true,
                data: serverChanges,
                message: "增量同步完成",
            });
        } catch (error) {
            if (sendSyncError(res, error)) return;
            logger.error("[NexAI Sync] POST /sync/incremental error:", error);
            res.status(500).json({
                success: false,
                error: "增量同步失败",
                code: "NEXAI_SYNC_INCREMENTAL_ERROR",
            });
        }
    }
}
