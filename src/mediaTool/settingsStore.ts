// MediaTool 设置持久化:server 态存 Mongo 单文档,standalone 态存本地 JSON。
// 前端回传的密钥字段若等于 SECRET_MASK,表示“未改动”,用既有值覆盖之。
import fs from "node:fs";
import path from "node:path";
import { MediaToolSettingsModel } from "../models/mediaToolModels";
import { ensureDir } from "./runtime";
import { defaultMediaToolSettings, explicitEnvLayer, type BiliOptions, type LasrOptions, type MediaSettingsLayer, type MediaToolSettings, type TranscribeUserSettings } from "./types";

export const SECRET_MASK = "********";

const SECRET_FIELDS = new Set<keyof LasrOptions>(["appKey", "token", "openid"]);

export type MediaSettingsPatch = {
  enabled?: boolean;
  workDir?: string;
  maxUploadBytes?: number;
  maxJobLogLines?: number;
  lasr?: Partial<LasrOptions>;
  bili?: Partial<BiliOptions>;
  user?: Partial<TranscribeUserSettings>;
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
  base.user = { ...base.user, ...(target.user ?? {}) };
  return base;
}

/** 环境变量显式层是最终权威:只覆盖「真的写了值」的字段。 */
function withEnvLayer(settings: MediaToolSettings): MediaToolSettings {
  const layer = explicitEnvLayer() as MediaSettingsLayer & MediaSettingsPatch;
  return applyPatch(settings, layer, { ignoreSecretMask: true });
}

function applyPatch(base: MediaToolSettings, patch: MediaSettingsPatch, opts: { ignoreSecretMask?: boolean } = {}): MediaToolSettings {
  const next = JSON.parse(JSON.stringify(base)) as MediaToolSettings;
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.workDir !== undefined) next.workDir = patch.workDir;
  if (patch.maxUploadBytes !== undefined) next.maxUploadBytes = Math.max(1, patch.maxUploadBytes);
  if (patch.maxJobLogLines !== undefined) next.maxJobLogLines = Math.max(50, patch.maxJobLogLines);
  if (patch.lasr) {
    for (const key of Object.keys(patch.lasr) as Array<keyof LasrOptions>) {
      const value = patch.lasr[key];
      if (value === undefined) continue;
      if (!opts.ignoreSecretMask && SECRET_FIELDS.has(key) && value === SECRET_MASK) continue; // 未改动,保留旧密钥
      (next.lasr as unknown as Record<string, unknown>)[key] = value;
    }
    next.lasr.concurrency = clamp(next.lasr.concurrency, 1, 8, 1);
    next.lasr.uploadConcurrency = clamp(next.lasr.uploadConcurrency, 1, 8, 1);
    next.lasr.uploadRetries = clamp(next.lasr.uploadRetries, 0, 10, 4);
    if (!Array.isArray(next.lasr.outputs) || next.lasr.outputs.length === 0) next.lasr.outputs = ["plain"];
  }
  if (patch.bili) {
    for (const key of Object.keys(patch.bili) as Array<keyof BiliOptions>) {
      const value = patch.bili[key];
      if (value === undefined) continue;
      (next.bili as unknown as Record<string, unknown>)[key] = value;
    }
    next.bili.concurrency = clamp(next.bili.concurrency, 1, 8, 1);
  }
  if (patch.user) {
    for (const key of Object.keys(patch.user) as Array<keyof TranscribeUserSettings>) {
      const value = patch.user[key];
      if (value === undefined) continue;
      (next.user as unknown as Record<string, unknown>)[key] = value;
    }
    next.user.maxFilesPerJob = clamp(next.user.maxFilesPerJob, 1, 20, 5);
    next.user.maxActiveJobs = clamp(next.user.maxActiveJobs, 1, 10, 2);
  }
  return next;
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** 出参脱敏副本:密钥字段一律显示占位(前端 PUT 时原样带回即可不覆盖)。 */
export function maskedView(settings: MediaToolSettings): MediaToolSettings {
  const copy = JSON.parse(JSON.stringify(settings)) as MediaToolSettings;
  for (const key of SECRET_FIELDS) {
    (copy.lasr as unknown as Record<string, unknown>)[key] = SECRET_MASK;
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
      return withEnvLayer(mergeDefaults(doc.value as unknown as MediaToolSettings | undefined, defaults));
    },
    async update(patch: MediaSettingsPatch): Promise<MediaToolSettings> {
      const defaults = defaultMediaToolSettings();
      const doc = await MediaToolSettingsModel.findOne({ key: KEY }).lean().exec();
      const current = mergeDefaults(doc?.value as unknown as MediaToolSettings | undefined, defaults);
      const next = applyPatch(current, patch);
      await MediaToolSettingsModel.updateOne(
        { key: KEY },
        { $set: { key: KEY, value: next as unknown as Record<string, unknown>, updatedAt: Date.now() } },
        { upsert: true },
      ).exec();
      return withEnvLayer(next); // 与下次 GET 保持一致:环境变量显式层仍是最终权威
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
      if (!hasStored) save(settings); // 首次即种出可编辑文件(不含环境变量层)
      return Promise.resolve(withEnvLayer(settings));
    },
    async update(patch: MediaSettingsPatch): Promise<MediaToolSettings> {
      const next = applyPatch(load(), patch);
      save(next);
      return withEnvLayer(next);
    },
  };
}
