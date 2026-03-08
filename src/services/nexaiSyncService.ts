/**
 * NexAI 云同步服务
 * 处理用户数据的云端存储与检索
 */
import logger from "../utils/logger";
import { NexaiSyncModel, type SyncCategory, type INexaiSyncData } from "../models/nexaiSyncModel";

export class NexaiSyncService {
    // ---------- 获取同步数据 ----------
    static async getSyncData(userId: string): Promise<INexaiSyncData | null> {
        try {
            const doc = await NexaiSyncModel.findOne({ userId }).lean();
            return doc as INexaiSyncData | null;
        } catch (error) {
            logger.error("[NexAI Sync] getSyncData error:", error);
            throw error;
        }
    }

    // ---------- 全量覆盖同步数据 ----------
    static async putSyncData(
        userId: string,
        data: Partial<Omit<INexaiSyncData, "userId">>,
    ): Promise<INexaiSyncData> {
        try {
            const update = {
                ...data,
                userId,
                lastSyncedAt: new Date(),
            };

            const doc = await NexaiSyncModel.findOneAndUpdate(
                { userId },
                { $set: update },
                { upsert: true, new: true, lean: true },
            );

            logger.info(`[NexAI Sync] putSyncData OK for user ${userId}`);
            return doc as INexaiSyncData;
        } catch (error) {
            logger.error("[NexAI Sync] putSyncData error:", error);
            throw error;
        }
    }

    // ---------- 按类别局部更新 ----------
    static async patchSyncData(
        userId: string,
        category: SyncCategory,
        data: unknown,
    ): Promise<INexaiSyncData | null> {
        try {
            const fieldMap: Record<SyncCategory, string> = {
                settings: "settings",
                notes: "notes",
                conversations: "conversations",
                translations: "translationHistory",
                passwords: "savedPasswords",
                shortUrls: "shortUrls",
            };

            const field = fieldMap[category];
            if (!field) {
                throw new Error(`Invalid sync category: ${category}`);
            }

            const update: Record<string, unknown> = {
                [field]: data,
                lastSyncedAt: new Date(),
            };

            const doc = await NexaiSyncModel.findOneAndUpdate(
                { userId },
                { $set: update },
                { upsert: true, new: true, lean: true },
            );

            logger.info(`[NexAI Sync] patchSyncData [${category}] OK for user ${userId}`);
            return doc as INexaiSyncData | null;
        } catch (error) {
            logger.error(`[NexAI Sync] patchSyncData [${category}] error:`, error);
            throw error;
        }
    }

    // ---------- 删除同步数据 ----------
    static async deleteSyncData(userId: string): Promise<boolean> {
        try {
            const result = await NexaiSyncModel.deleteOne({ userId });
            logger.info(`[NexAI Sync] deleteSyncData OK for user ${userId}, deleted: ${result.deletedCount}`);
            return result.deletedCount > 0;
        } catch (error) {
            logger.error("[NexAI Sync] deleteSyncData error:", error);
            throw error;
        }
    }

    // ---------- 获取同步元信息（轻量） ----------
    static async getSyncMeta(userId: string): Promise<{ lastSyncedAt: Date | null; hasData: boolean }> {
        try {
            const doc = await NexaiSyncModel.findOne({ userId })
                .select("lastSyncedAt")
                .lean();
            return {
                lastSyncedAt: doc?.lastSyncedAt ?? null,
                hasData: !!doc,
            };
        } catch (error) {
            logger.error("[NexAI Sync] getSyncMeta error:", error);
            throw error;
        }
    }
}
