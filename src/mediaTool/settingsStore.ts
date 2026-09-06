// MediaTool 设置持久化:server 态存 Mongo 单文档,standalone 态存本地 JSON。
// 前端回传的密钥字段若等于 SECRET_MASK,表示“未改动”,用既有值覆盖之。
import fs from "node:fs";
import path from "node:path";
import { MediaToolSettingsModel } from "../models/mediaToolModels";
import { ensureDir } from "./runtime";
import { defaultMediaToolSettings, type BiliOptions, type LasrOptions, type MediaToolSettings } from "./types";

export const SECRET_MASK = "********";

const SECRET_FIELDS = new Set<keyof LasrOptions>(["appKey", "token", "openid"]);

export type MediaSettingsPatch = {
  enabled?: boolean;
  workDir?: string;
  maxUploadBytes?: number;
  maxJobLogLines?: number;
  lasr?: Partial<LasrOptions>;
  bili?: Partial<BiliOptions>;
};

export interface MediaSettingsStore {
  get(): Promise<MediaToolSettings>;
  update(patch: MediaSettingsPatch): Promise<MediaToolSettings>;
}

/** 把 defaults 里 target 缺失的键补上(target 优先),供老存档/部分存储升级用。 */
function mergeDefaults(target: MediaToolSettings | undefined, defaults: MediaToolSettings): MediaToolSettings {
  const base: MediaToolSettings = JSON.parse(JSON.stringify(defaults));
  if (!target) return base;
  base.enabled = target.enabled ?? base.enabled;
  base.workDir = target.workDir ?? base.workDir;
  base.maxUploadBytes = target.maxUploadBytes ?? base.maxUploadBytes;
  base.maxJobLogLines = target.maxJobLogLines ?? base.maxJobLogLines;
  base.lasr = { ...base.lasr, ...target.lasr };
  base.bili = { ...base.bili, ...target.bili };
  return base;
}

function applyPatch(base: MediaToolSettings, patch: MediaSettingsPatch): MediaToolSettings {
  const next = JSON.parse(JSON.stringify(base)) as MediaToolSettings;
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.workDir !== undefined) next.workDir = patch.workDir;
  if (patch.maxUploadBytes !== undefined) next.maxUploadBytes = Math.max(1, patch.maxUploadBytes);
  if (patch.maxJobLogLines !== undefined) next.maxJobLogLines = Math.max(50, patch.maxJobLogLines);
  if (patch.lasr) {
    for (const key of Object.keys(patch.lasr) as Array<keyof LasrOptions>) {
      const value = patch.lasr[key];
      if (value === undefined) continue;
      if (SECRET_FIELDS.has(key) && value === SECRET_MASK) continue; // 未改动,保留旧密钥
      (next.lasr as Record<string, unknown>)[key] = value;
    }
    next.lasr.concurrency = Math.max(1, next.lasr.concurrency);
  }
  if (patch.bili) {
    for (const key of Object.keys(patch.bili) as Array<keyof BiliOptions>) {
      const value = patch.bili[key];
      if (value === undefined) continue;
      (next.bili as Record<string, unknown>)[key] = value;
    }
    next.bili.concurrency = Math.max(1, Math.min(8, next.bili.concurrency));
  }
  return next;
}

/** 出参脱敏副本:密钥字段一律显示占位(前端 PUT 时原样带回即可不覆盖)。 */
export function maskedView(settings: MediaToolSettings): MediaToolSettings {
  const copy = JSON.parse(JSON.stringify(settings)) as MediaToolSettings;
  for (const key of SECRET_FIELDS) {
    (copy.lasr as Record<string, unknown>)[key] = SECRET_MASK;
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Mongo 实现
// ---------------------------------------------------------------------------
export function createMongoMediaSettingsStore(): MediaSettingsStore {
  const KEY = "media-tool";
  return {
    async get(): Promise<MediaToolSettings> {
      const defaults = defaultMediaToolSettings();
      const doc = await MediaToolSettingsModel.findOne({ key: KEY }).lean().exec();
      if (!doc) return defaults;
      return mergeDefaults(doc.value as MediaToolSettings | undefined, defaults);
    },
    async update(patch: MediaSettingsPatch): Promise<MediaToolSettings> {
      const defaults = defaultMediaToolSettings();
      const doc = await MediaToolSettingsModel.findOne({ key: KEY }).lean().exec();
      const current = mergeDefaults(doc?.value as MediaToolSettings | undefined, defaults);
      const next = applyPatch(current, patch);
      await MediaToolSettingsModel.updateOne(
        { key: KEY },
        { $set: { key: KEY, value: next as unknown as Record<string, unknown>, updatedAt: Date.now() } },
        { upsert: true },
      ).exec();
      return next;
    },
  };
}

// ---------------------------------------------------------------------------
// 本地 JSON 文件实现(standalone)
// ---------------------------------------------------------------------------
export function createJsonMediaSettingsStore(file: string): MediaSettingsStore {
  ensureDir(path.dirname(file));
  let cached: MediaToolSettings | null = null;
  let hasStored = false;
  const load = (): MediaToolSettings => {
    if (cached) return cached;
    const defaults = defaultMediaToolSettings();
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as MediaToolSettings;
      hasStored = true;
      cached = mergeDefaults(parsed, defaults);
      return cached;
    } catch {
      cached = JSON.parse(JSON.stringify(defaults)) as MediaToolSettings;
      return cached;
    }
  };
  const save = (settings: MediaToolSettings) => {
    cached = settings;
    hasStored = true;
    try {
      fs.writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
    } catch {
      // 写盘失败仅影响设置持久化
    }
  };
  return {
    get(): Promise<MediaToolSettings> {
      const settings = load();
      if (!hasStored) save(settings); // 首次即种出可编辑文件
      return Promise.resolve(JSON.parse(JSON.stringify(settings)) as MediaToolSettings);
    },
    async update(patch: MediaSettingsPatch): Promise<MediaToolSettings> {
      const next = applyPatch(load(), patch);
      save(next);
      return JSON.parse(JSON.stringify(next)) as MediaToolSettings;
    },
  };
}
