/**
 * NexAI 云同步服务
 * 处理用户数据的云端存储与检索
 */

import {
  type IIncrementalSyncRequest,
  type IIncrementalSyncResponse,
  type INexaiSyncData,
  NexaiSyncModel,
  type SyncCategory,
} from "../models/nexaiSyncModel";
import logger from "../utils/logger";

const SENSITIVE_SETTINGS_FIELDS = ["apiKey", "vertexApiKey", "webdavPassword", "upstashToken"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactSettings(settings: unknown): unknown {
  if (!isPlainObject(settings)) {
    return settings;
  }

  const redacted: Record<string, unknown> = { ...settings };
  for (const field of SENSITIVE_SETTINGS_FIELDS) {
    if (field in redacted) {
      redacted[field] = "";
    }
  }
  return redacted;
}

function redactSavedPasswords(savedPasswords: unknown): unknown {
  if (!Array.isArray(savedPasswords)) {
    return savedPasswords;
  }

  return savedPasswords.map((entry) => {
    if (!isPlainObject(entry)) {
      return entry;
    }

    return {
      ...entry,
      password: "",
    };
  });
}

function redactLegacySyncPayload<T extends Record<string, unknown>>(data: T): T {
  const redacted: Record<string, unknown> = { ...data };

  if ("settings" in redacted) {
    redacted.settings = redactSettings(redacted.settings);
  }

  if ("savedPasswords" in redacted) {
    redacted.savedPasswords = redactSavedPasswords(redacted.savedPasswords);
  }

  return redacted as T;
}

function redactSyncDocumentForResponse(doc: INexaiSyncData | null): INexaiSyncData | null {
  if (!doc) {
    return null;
  }

  return redactLegacySyncPayload({ ...doc } as unknown as Record<string, unknown>) as unknown as INexaiSyncData;
}

function redactIncrementalRequest(incoming: IIncrementalSyncRequest): IIncrementalSyncRequest {
  return redactLegacySyncPayload({ ...incoming } as unknown as Record<string, unknown>) as unknown as IIncrementalSyncRequest;
}

function redactIncrementalResponse(response: IIncrementalSyncResponse): IIncrementalSyncResponse {
  return redactLegacySyncPayload({ ...response } as unknown as Record<string, unknown>) as unknown as IIncrementalSyncResponse;
}

export class NexaiSyncService {
  // ---------- 获取同步数据 ----------
  static async getSyncData(userId: string): Promise<INexaiSyncData | null> {
    try {
      const doc = await NexaiSyncModel.findOne({ userId }).lean();
      return redactSyncDocumentForResponse(doc as INexaiSyncData | null);
    } catch (error) {
      logger.error("[NexAI Sync] getSyncData error:", error);
      throw error;
    }
  }

  // ---------- 全量覆盖同步数据 ----------
  static async putSyncData(userId: string, data: Partial<Omit<INexaiSyncData, "userId">>): Promise<INexaiSyncData> {
    try {
      const safeData = redactLegacySyncPayload(data as unknown as Record<string, unknown>);
      const update = {
        ...safeData,
        userId,
        lastSyncedAt: new Date(),
      };

      const doc = await NexaiSyncModel.findOneAndUpdate(
        { userId },
        { $set: update },
        { upsert: true, new: true, lean: true },
      );

      logger.info(`[NexAI Sync] putSyncData OK for user ${userId}`);
      return redactSyncDocumentForResponse(doc as INexaiSyncData) as INexaiSyncData;
    } catch (error) {
      logger.error("[NexAI Sync] putSyncData error:", error);
      throw error;
    }
  }

  // ---------- 按类别局部更新 ----------
  static async patchSyncData(userId: string, category: SyncCategory, data: unknown): Promise<INexaiSyncData | null> {
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

      const safeData = category === "settings" ? redactSettings(data) : category === "passwords" ? redactSavedPasswords(data) : data;

      const update: Record<string, unknown> = {
        [field]: safeData,
        lastSyncedAt: new Date(),
      };

      const doc = await NexaiSyncModel.findOneAndUpdate(
        { userId },
        { $set: update },
        { upsert: true, new: true, lean: true },
      );

      logger.info(`[NexAI Sync] patchSyncData [${category}] OK for user ${userId}`);
      return redactSyncDocumentForResponse(doc as INexaiSyncData | null);
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
      const doc = await NexaiSyncModel.findOne({ userId }).select("lastSyncedAt").lean();
      return {
        lastSyncedAt: doc?.lastSyncedAt ?? null,
        hasData: !!doc,
      };
    } catch (error) {
      logger.error("[NexAI Sync] getSyncMeta error:", error);
      throw error;
    }
  }

  // ========== 增量同步 ==========

  /**
   * 获取自 `since` 时间戳以来的变更数据
   * 只返回 updatedAt > since 的条目
   */
  static async getChangesSince(userId: string, since: string): Promise<IIncrementalSyncResponse> {
    try {
      const doc = (await NexaiSyncModel.findOne({ userId }).lean()) as INexaiSyncData | null;
      const serverTime = new Date().toISOString();

      if (!doc) {
        return {
          notes: [],
          conversations: [],
          translationHistory: [],
          savedPasswords: [],
          shortUrls: [],
          serverTime,
        };
      }

      const filterBySince = <T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] => {
        return items.filter((item) => {
          const ts = item.updatedAt || item.createdAt || "";
          return ts > since;
        });
      };

      const result: IIncrementalSyncResponse = {
        notes: filterBySince(doc.notes ?? []),
        conversations: filterBySince(doc.conversations ?? []),
        translationHistory: filterBySince(doc.translationHistory ?? []),
        savedPasswords: filterBySince(doc.savedPasswords ?? []),
        shortUrls: filterBySince(doc.shortUrls ?? []),
        serverTime,
      };

      // 只在 settingsUpdatedAt > since 时才返回 settings
      if (doc.settingsUpdatedAt && doc.settingsUpdatedAt > since) {
        result.settings = redactSettings(doc.settings) as IIncrementalSyncResponse["settings"];
        result.settingsUpdatedAt = doc.settingsUpdatedAt;
      }

      const safeResult = redactIncrementalResponse(result);
      const totalChanges =
        safeResult.notes.length +
        safeResult.conversations.length +
        safeResult.translationHistory.length +
        safeResult.savedPasswords.length +
        safeResult.shortUrls.length +
        (safeResult.settings ? 1 : 0);

      logger.info(`[NexAI Sync] getChangesSince OK for user ${userId}, since=${since}, changes=${totalChanges}`);

      return safeResult;
    } catch (error) {
      logger.error("[NexAI Sync] getChangesSince error:", error);
      throw error;
    }
  }

  /**
   * 增量合并：按 id 逐条 upsert，保留 updatedAt 更新的版本
   * 返回合并后服务端有变更需要回传客户端的数据
   */
  static async mergeIncrementalData(
    userId: string,
    incoming: IIncrementalSyncRequest,
    clientLastSync: string,
  ): Promise<IIncrementalSyncResponse> {
    try {
      const safeIncoming = redactIncrementalRequest(incoming);
      let doc = await NexaiSyncModel.findOne({ userId });
      if (!doc) {
        doc = new NexaiSyncModel({ userId });
      }

      const serverTime = new Date().toISOString();

      // 通用的数组合并函数：按 id upsert，保留 updatedAt 较新的版本
      const mergeArrays = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
        existing: T[],
        incoming: T[] | undefined,
      ): { merged: T[]; serverChanges: T[] } => {
        if (!incoming || incoming.length === 0) {
          return { merged: existing, serverChanges: [] };
        }

        const map = new Map<string, T>();
        const serverChanges: T[] = [];

        // 先放入已有数据
        for (const item of existing) {
          map.set(item.id, item);
        }

        // 逐条合并 incoming
        for (const item of incoming) {
          const existingItem = map.get(item.id);
          if (!existingItem) {
            // 新增
            map.set(item.id, item);
          } else {
            const existingTs = existingItem.updatedAt || existingItem.createdAt || "";
            const incomingTs = item.updatedAt || item.createdAt || "";
            if (incomingTs >= existingTs) {
              // 客户端版本更新，覆盖服务端
              map.set(item.id, item);
            } else {
              // 服务端版本更新，需要回传给客户端
              serverChanges.push(existingItem);
            }
          }
        }

        // 找出服务端有但客户端没传的（在 clientLastSync 之后变更的）
        for (const [id, item] of map) {
          const inIncoming = incoming.some((i) => i.id === id);
          if (!inIncoming) {
            const ts = item.updatedAt || item.createdAt || "";
            if (ts > clientLastSync) {
              serverChanges.push(item);
            }
          }
        }

        return { merged: Array.from(map.values()), serverChanges };
      };

      // 处理删除
      if (safeIncoming.deletedIds) {
        const deleteFromArray = <T extends { id: string }>(arr: T[], ids: string[] | undefined): T[] => {
          if (!ids || ids.length === 0) return arr;
          const now = serverTime;
          return arr.map((item) => {
            if (ids.includes(item.id)) {
              return { ...item, isDeleted: true, updatedAt: now } as T;
            }
            return item;
          });
        };

        doc.notes = deleteFromArray(doc.notes, safeIncoming.deletedIds.notes);
        doc.conversations = deleteFromArray(doc.conversations, safeIncoming.deletedIds.conversations);
        doc.translationHistory = deleteFromArray(doc.translationHistory, safeIncoming.deletedIds.translationHistory);
        doc.savedPasswords = deleteFromArray(doc.savedPasswords, safeIncoming.deletedIds.savedPasswords);
        doc.shortUrls = deleteFromArray(doc.shortUrls, safeIncoming.deletedIds.shortUrls);
      }

      // 合并每个类别
      const notesResult = mergeArrays(doc.notes, safeIncoming.notes);
      const convsResult = mergeArrays(doc.conversations, safeIncoming.conversations);
      const transResult = mergeArrays(doc.translationHistory, safeIncoming.translationHistory);
      const passResult = mergeArrays(doc.savedPasswords, safeIncoming.savedPasswords);
      const urlsResult = mergeArrays(doc.shortUrls, safeIncoming.shortUrls);

      doc.notes = notesResult.merged;
      doc.conversations = convsResult.merged;
      doc.translationHistory = transResult.merged;
      doc.savedPasswords = passResult.merged;
      doc.shortUrls = urlsResult.merged;

      // 合并 settings
      const response: IIncrementalSyncResponse = {
        notes: notesResult.serverChanges,
        conversations: convsResult.serverChanges,
        translationHistory: transResult.serverChanges,
        savedPasswords: passResult.serverChanges,
        shortUrls: urlsResult.serverChanges,
        serverTime,
      };

      if (safeIncoming.settings && safeIncoming.settingsUpdatedAt) {
        const serverSettingsTs = doc.settingsUpdatedAt || "";
        if (safeIncoming.settingsUpdatedAt >= serverSettingsTs) {
          // 客户端设置更新
          doc.settings = safeIncoming.settings;
          doc.settingsUpdatedAt = safeIncoming.settingsUpdatedAt;
        } else {
          // 服务端设置更新，回传给客户端
          response.settings = redactSettings(doc.settings) as IIncrementalSyncResponse["settings"];
          response.settingsUpdatedAt = doc.settingsUpdatedAt;
        }
      } else if (doc.settingsUpdatedAt && doc.settingsUpdatedAt > clientLastSync) {
        // 服务端有更新的 settings，回传
        response.settings = redactSettings(doc.settings) as IIncrementalSyncResponse["settings"];
        response.settingsUpdatedAt = doc.settingsUpdatedAt;
      }

      doc.lastSyncedAt = new Date();
      await doc.save();

      const totalIncoming =
        (safeIncoming.notes?.length ?? 0) +
        (safeIncoming.conversations?.length ?? 0) +
        (safeIncoming.translationHistory?.length ?? 0) +
        (safeIncoming.savedPasswords?.length ?? 0) +
        (safeIncoming.shortUrls?.length ?? 0);

      const safeResponse = redactIncrementalResponse(response);
      const totalServerChanges =
        safeResponse.notes.length +
        safeResponse.conversations.length +
        safeResponse.translationHistory.length +
        safeResponse.savedPasswords.length +
        safeResponse.shortUrls.length;

      logger.info(
        `[NexAI Sync] mergeIncremental OK for user ${userId}, ` +
          `incoming=${totalIncoming}, serverChanges=${totalServerChanges}`,
      );

      return safeResponse;
    } catch (error) {
      logger.error("[NexAI Sync] mergeIncrementalData error:", error);
      throw error;
    }
  }
}
