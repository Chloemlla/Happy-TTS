// 转写正文持久化:server 态走 Mongo(media_tool_transcripts),standalone 态走本地 JSON 文件。
// 两者实现同一 TranscriptStore 接口,controller / runner 不感知底层。
//
// 与 MediaJobStore 的分工:任务表只放产物文件指针(列表接口要轻),
// 正文(纯文本 + 分段)放这里,详情接口优先读它,磁盘文件退化成缓存与下载源。
import fs from "node:fs";
import path from "node:path";
import { MediaToolTranscriptModel } from "../../models/mediaToolModels";
import { ensureDir } from "../runtime";
import type { MediaJobScope } from "../types";
import type { LasrSegment } from "../vivoLasr";

export interface TranscriptRecord {
  jobId: string;
  /** 任务内文件下标,与 job.result.items 对齐 */
  index: number;
  scope: MediaJobScope;
  ownerId?: string;
  label: string;
  durationSec: number;
  segmentCount: number;
  plainText: string;
  segments: LasrSegment[];
  /** epoch ms */
  createdAt: number;
}

export interface TranscriptStore {
  /** 按 (jobId,index) 覆盖写:重试同一个任务不会留下旧正文 */
  save(record: TranscriptRecord): Promise<void>;
  listByJob(jobId: string): Promise<TranscriptRecord[]>;
  removeByJob(jobId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mongo 实现
// ---------------------------------------------------------------------------
export function createMongoTranscriptStore(): TranscriptStore {
  const toRecord = (doc: { _id?: unknown; __v?: unknown; [k: string]: unknown }): TranscriptRecord => {
    const rec = { ...doc } as unknown as TranscriptRecord;
    delete (rec as unknown as Record<string, unknown>)._id;
    delete (rec as unknown as Record<string, unknown>).__v;
    return rec;
  };

  return {
    async save(record: TranscriptRecord): Promise<void> {
      const { jobId, index } = record;
      await MediaToolTranscriptModel.updateOne({ jobId, index }, { $set: record }, { upsert: true }).exec();
    },
    async listByJob(jobId: string): Promise<TranscriptRecord[]> {
      const docs = await MediaToolTranscriptModel.find({ jobId }).sort({ index: 1 }).lean().exec();
      return docs.map((d) => toRecord(d as unknown as { _id?: unknown; __v?: unknown }));
    },
    async removeByJob(jobId: string): Promise<void> {
      await MediaToolTranscriptModel.deleteMany({ jobId }).exec();
    },
  };
}

// ---------------------------------------------------------------------------
// 本地 JSON 文件实现(standalone / 无 Mongo 回退)
// 正文是"最终副本"性质的数据,不入节流队列:每次写完立刻落盘。
// ---------------------------------------------------------------------------
export function createJsonTranscriptStore(file: string): TranscriptStore {
  ensureDir(path.dirname(file));
  let rows: TranscriptRecord[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { transcripts?: TranscriptRecord[] };
    if (Array.isArray(parsed?.transcripts)) rows = parsed.transcripts;
  } catch {
    // 首次运行或文件损坏:空库
  }

  const writeNow = () => {
    try {
      fs.writeFileSync(file, JSON.stringify({ transcripts: rows }, null, 2), "utf8");
    } catch {
      // 写盘失败不阻断运行
    }
  };

  return {
    save(record: TranscriptRecord): Promise<void> {
      rows = rows.filter((r) => !(r.jobId === record.jobId && r.index === record.index));
      rows.push(record);
      writeNow();
      return Promise.resolve();
    },
    listByJob(jobId: string): Promise<TranscriptRecord[]> {
      return Promise.resolve(rows.filter((r) => r.jobId === jobId).sort((a, b) => a.index - b.index));
    },
    removeByJob(jobId: string): Promise<void> {
      rows = rows.filter((r) => r.jobId !== jobId);
      writeNow();
      return Promise.resolve();
    },
  };
}
