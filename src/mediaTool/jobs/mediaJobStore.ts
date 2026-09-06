// MediaJob 双态持久化:server 态走 Mongo(media_tool_jobs),standalone 态走本地 JSON 文件。
// 两者实现同一 MediaJobStore 接口,controller / runner 不感知底层。
import fs from "node:fs";
import path from "node:path";
import { MediaToolJobModel } from "../../models/mediaToolModels";
import { ensureDir } from "../runtime";
import type { MediaJobRecord } from "../types";

export interface MediaJobStore {
  list(limit: number): Promise<MediaJobRecord[]>;
  get(id: string): Promise<MediaJobRecord | null>;
  create(record: MediaJobRecord): Promise<void>;
  patch(id: string, partial: Partial<MediaJobRecord>): Promise<void>;
  remove(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mongo 实现
// ---------------------------------------------------------------------------
export function createMongoMediaJobStore(): MediaJobStore {
  const toRecord = (doc: {
    _id?: unknown;
    __v?: unknown;
    [k: string]: unknown;
  }): MediaJobRecord => {
    const rec = { ...doc } as unknown as MediaJobRecord;
    delete (rec as unknown as Record<string, unknown>)._id;
    delete (rec as unknown as Record<string, unknown>).__v;
    return rec;
  };

  return {
    async list(limit: number): Promise<MediaJobRecord[]> {
      const docs = await MediaToolJobModel.find()
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(1, limit), 200))
        .lean()
        .exec();
      return docs.map((d) => toRecord(d as unknown as { _id?: unknown; __v?: unknown }));
    },
    async get(id: string): Promise<MediaJobRecord | null> {
      const doc = await MediaToolJobModel.findOne({ id }).lean().exec();
      return doc ? toRecord(doc as unknown as { _id?: unknown; __v?: unknown }) : null;
    },
    async create(record: MediaJobRecord): Promise<void> {
      await MediaToolJobModel.create(record as unknown as import("../../models/mediaToolModels").MediaToolJobDoc);
    },
    async patch(id: string, partial: Partial<MediaJobRecord>): Promise<void> {
      await MediaToolJobModel.updateOne({ id }, { $set: partial }).exec();
    },
    async remove(id: string): Promise<void> {
      await MediaToolJobModel.deleteOne({ id }).exec();
    },
  };
}

// ---------------------------------------------------------------------------
// 本地 JSON 文件实现(standalone / 无 Mongo 回退)
// 内存持有全量,jobs.json 单文件、写盘节流合并,terminal 状态即时落盘。
// ---------------------------------------------------------------------------
interface JsonBacking {
  jobs: MediaJobRecord[];
}

export function createJsonMediaJobStore(file: string): MediaJobStore {
  ensureDir(path.dirname(file));
  const backing: JsonBacking = { jobs: [] };
  const touch = (record: MediaJobRecord) => {
    const saved = record as MediaJobRecord;
    backing.jobs = backing.jobs.filter((j) => j.id !== saved.id);
    backing.jobs.unshift(saved);
  };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as JsonBacking;
    if (Array.isArray(parsed?.jobs)) backing.jobs = parsed.jobs;
  } catch {
    // 首次运行或文件损坏:空库
  }
  backing.jobs.sort((a, b) => b.createdAt - a.createdAt);

  let persistTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writeNow();
    }, 250);
  };
  const writeNow = () => {
    try {
      fs.writeFileSync(file, JSON.stringify({ jobs: backing.jobs }, null, 2), "utf8");
    } catch {
      // 写盘失败不阻断内存态
    }
  };
  const flush = () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    writeNow();
  };
  process.once("exit", flush);

  return {
    list(limit: number): Promise<MediaJobRecord[]> {
      return Promise.resolve(backing.jobs.slice(0, Math.min(Math.max(1, limit), 200)));
    },
    get(id: string): Promise<MediaJobRecord | null> {
      return Promise.resolve(backing.jobs.find((j) => j.id === id) ?? null);
    },
    async create(record: MediaJobRecord): Promise<void> {
      touch(record);
      scheduleSave();
    },
    async patch(id: string, partial: Partial<MediaJobRecord>): Promise<void> {
      const target = backing.jobs.find((j) => j.id === id);
      if (!target) return;
      const finished = partial.status && partial.status !== "running" && partial.status !== "queued";
      Object.assign(target, partial);
      if (finished) {
        flush();
      } else {
        scheduleSave();
      }
    },
    async remove(id: string): Promise<void> {
      backing.jobs = backing.jobs.filter((j) => j.id !== id);
      flush();
    },
  };
}
