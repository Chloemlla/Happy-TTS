// server 态共享单例:管理端媒体工具(/api/admin/media-tool)与用户态语音转文本
// (/api/transcribe)必须共用同一套 store / settings / runner。
//
// 各自 new 一份的话,进程重启自恢复会把同一条 queued 任务向两个 runner 各入队一次,
// 表现为同一个音频被重复上传、重复转写(两个 runner 互不知晓对方的 in-flight 集合)。
import { createMongoMediaJobStore, type MediaJobStore } from "./jobs/mediaJobStore";
import { MediaJobRunner } from "./jobs/mediaJobRunner";
import { createMongoTranscriptStore, type TranscriptStore } from "./jobs/transcriptStore";
import { createMongoMediaSettingsStore, type MediaSettingsStore } from "./settingsStore";

let jobStore: MediaJobStore | null = null;
let transcriptStore: TranscriptStore | null = null;
let settingsStore: MediaSettingsStore | null = null;
let runner: MediaJobRunner | null = null;
let recovered = false;

export function getServerMediaJobStore(): MediaJobStore {
  if (!jobStore) jobStore = createMongoMediaJobStore();
  return jobStore;
}

/** 转写正文表(详情接口优先读它,磁盘只作回退与下载源)。 */
export function getServerTranscriptStore(): TranscriptStore {
  if (!transcriptStore) transcriptStore = createMongoTranscriptStore();
  return transcriptStore;
}

export function getServerMediaSettingsStore(): MediaSettingsStore {
  if (!settingsStore) settingsStore = createMongoMediaSettingsStore();
  return settingsStore;
}

/** 全局并发上限:两类入口共用同一个队列,超限时任务排队而不是并发压垮上游。 */
export function getMediaToolRunner(): MediaJobRunner {
  if (!runner) {
    runner = new MediaJobRunner(
      {
        store: getServerMediaJobStore(),
        transcripts: getServerTranscriptStore(),
        getSettings: () => getServerMediaSettingsStore().get(),
        mode: "server",
      },
      2,
    );
  }
  return runner;
}

/**
 * 进程重启后自恢复:残留 running 置为失败(中断),残留 queued 重新入队。
 * mongoose 默认缓冲队列,连接就绪前查询会等待,因此延后一拍执行;只跑一次。
 */
export function ensureMediaJobRecovery(delayMs = 2500): void {
  if (recovered) return;
  recovered = true;
  setTimeout(() => {
    getServerMediaJobStore()
      .list(200)
      .then((records) => {
        const store = getServerMediaJobStore();
        const queue = getMediaToolRunner();
        for (const r of records) {
          if (r.status === "running") {
            void store.patch(r.id, {
              status: "failed",
              error: "服务重启,任务被中断(可重试)",
              finishedAt: Date.now(),
            });
          } else if (r.status === "queued" && !r.cancelRequested) {
            queue.enqueue(r.id);
          }
        }
      })
      .catch(() => undefined);
  }, delayMs);
}
