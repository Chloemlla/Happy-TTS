/**
 * NexAI 云同步控制器
 * 处理所有 /api/nexai/sync/* 请求
 */
import type { Request, Response } from "express";
import { NexaiSyncService } from "../services/nexaiSyncService";
import type { SyncCategory } from "../models/nexaiSyncModel";
import logger from "../utils/logger";

const VALID_CATEGORIES: SyncCategory[] = [
    "settings",
    "notes",
    "conversations",
    "translations",
    "passwords",
    "shortUrls",
];

export class NexaiSyncController {
    /**
     * GET /api/nexai/sync
     * 获取用户全部同步数据
     */
    static async getSyncData(req: Request, res: Response) {
        try {
            const userId = req.nexaiUser!.id;
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
            const userId = req.nexaiUser!.id;
            const {
                settings,
                notes,
                conversations,
                translationHistory,
                savedPasswords,
                shortUrls,
            } = req.body;

            const data = await NexaiSyncService.putSyncData(userId, {
                settings,
                notes,
                conversations,
                translationHistory,
                savedPasswords,
                shortUrls,
            });

            res.json({
                success: true,
                data: { lastSyncedAt: data.lastSyncedAt },
                message: "同步数据已上传",
            });
        } catch (error) {
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
            const userId = req.nexaiUser!.id;
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

            const result = await NexaiSyncService.patchSyncData(userId, category, categoryData);

            res.json({
                success: true,
                data: { lastSyncedAt: result?.lastSyncedAt },
                message: `${category} 同步数据已更新`,
            });
        } catch (error) {
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
            const userId = req.nexaiUser!.id;
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
            const userId = req.nexaiUser!.id;
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
}
