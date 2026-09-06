// 媒体工具 Job 执行器:worker 队列串行/限并发跑 bili-download 与 transcribe,
// 把域引擎的日志/进度/取消桥接到 MediaJobRecord,并写回持久层。
import path from "node:path";
import { downloadBatch } from "../biliYtDlp";
import { CancelledError, isAudioFile, relInside, resolveRootDir, statOrNull } from "../runtime";
import { transcribeAudioFile } from "../vivoLasr";
import type { MediaJobStore } from "./mediaJobStore";
import type {
  MediaJobFileItem,
  MediaJobRecord,
  MediaJobResult,
  MediaJobStage,
  MediaToolSettings,
} from "../types";

/** 纯音频扩展(video 容器格式不送 vivo 转写)。 */
const AUDIO_ONLY_RE = /\.(m4a|mp3|wav|aac|amr|flac|ogg|opus|m4b|3gp|wma|mka|ape|caf)$/i;

export interface JobRunnerDeps {
  store: MediaJobStore;
  getSettings(): Promise<MediaToolSettings>;
  mode: string;
}

/** 本地 aborts 集合:cancel 请求(HTTP 同实例)即时生效,不等下一次 store 轮询。 */
export class MediaJobRunner {
  private queue: string[] = [];
  private active = 0;
  private aborts = new Set<string>();

  constructor(
    private deps: JobRunnerDeps,
    private maxActive = 2,
  ) {}

  enqueue(id: string): void {
    if (this.queue.includes(id)) return;
    this.queue.push(id);
    this.pump();
  }

  /** 请求取消:置 aborts + 把持久层记录标记上 cancelRequested。 */
  async cancel(id: string): Promise<void> {
    this.aborts.add(id);
    await this.deps.store.patch(id, { cancelRequested: true });
  }

  getQueuedCount(): number {
    return this.queue.length + this.active;
  }

  private pump(): void {
    while (this.active < this.maxActive && this.queue.length > 0) {
      const id = this.queue.shift() as string;
      this.active += 1;
      this.execute(id)
        .catch(() => undefined)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }

  private async execute(id: string): Promise<void> {
    try {
      await this.runJob(id);
    } catch (e) {
      try {
        await this.terminate(id, "failed", (e as Error).message);
      } catch {
        // 已尽力
      }
    } finally {
      this.aborts.delete(id);
    }
  }

  private async terminate(id: string, status: MediaJobRecord["status"], error?: string): Promise<void> {
    const record = await this.deps.store.get(id);
    if (!record) return;
    await this.deps.store.patch(id, {
      status,
      error,
      finishedAt: Date.now(),
      stage: status === "cancelled" ? record.stage : "finalize",
    });
  }

  private async runJob(id: string): Promise<void> {
    const current = await this.deps.store.get(id);
    if (!current || current.status === "running" || current.status === "succeeded") return;
    const cancelledEarly = this.aborts.has(id) || current.cancelRequested;
    if (cancelledEarly) {
      await this.terminate(id, "cancelled");
      return;
    }
    const settings = await this.deps.getSettings();
    if (!settings.enabled) throw new Error("媒体工具已停用(设置页开启后重试)");

    const root = resolveRootDir(settings.workDir);
    const maxLogs = Math.max(50, settings.maxJobLogLines || 600);

    // 运行期工作副本 + 合并写盘(节流),终态即时写盘
    const doc = JSON.parse(JSON.stringify(current)) as MediaJobRecord;
    doc.status = "running";
    doc.stage = "prepare";
    doc.progress = 0;
    doc.startedAt = Date.now();
    doc.finishedAt = undefined;
    doc.error = undefined;
    doc.result = undefined;
    let timer: NodeJS.Timeout | null = null;
    const persist = async () => {
      const snapshot = JSON.parse(JSON.stringify(doc)) as MediaJobRecord;
      try {
        await this.deps.store.patch(id, {
          status: snapshot.status,
          stage: snapshot.stage,
          progress: snapshot.progress,
          logs: snapshot.logs,
          error: snapshot.error,
          result: snapshot.result,
          startedAt: snapshot.startedAt,
          finishedAt: snapshot.finishedAt,
        });
      } catch {
        // 持久化失败不阻断运行
      }
    };
    const schedulePersist = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void persist();
      }, 350);
    };
    const persistNow = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await persist();
    };
    const log = (text: string) => {
      doc.logs.push({ t: Date.now(), text });
      if (doc.logs.length > maxLogs) doc.logs.splice(0, doc.logs.length - maxLogs);
      schedulePersist();
    };
    const progress = (stage: MediaJobStage, pct: number) => {
      doc.stage = stage;
      doc.progress = Math.max(0, Math.min(100, Math.round(pct)));
      schedulePersist();
    };
    const isCancelled = () => this.aborts.has(id);
    await persistNow();

    const params = doc.params ?? {};
    const lasr = {
      ...settings.lasr,
      saveSrt: typeof params.saveSrt === "boolean" ? params.saveSrt : settings.lasr.saveSrt,
      concurrency: Math.max(1, settings.lasr.concurrency),
    };
    const items: MediaJobFileItem[] = [];
    const filesSet = new Set<string>();

    try {
      if (doc.kind === "bili-download") {
        const urls = Array.isArray(params.urls) && params.urls.length
          ? (params.urls as string[]).map(String).filter((u) => u.trim())
          : doc.input.values.map(String).filter((u) => u.trim());
        const videoMode = params.mode === undefined ? settings.bili.videoMode : params.mode === "video";
        const audioFormat = typeof params.audioFormat === "string" && params.audioFormat.trim()
          ? params.audioFormat.trim()
          : settings.bili.audioFormat;
        const transcribeAfter = typeof params.transcribeAfter === "boolean"
          ? params.transcribeAfter
          : settings.bili.transcribeAfter;
        log(`模式: ${videoMode ? "视频" : `音频(${audioFormat})`} | 联动转写: ${transcribeAfter ? "开" : "关"}`);

        const batch = await downloadBatch(
          { ...settings.bili, audioFormat },
          urls,
          videoMode,
          {
            log: (t) => log(t),
            progress: (done, total) =>
              progress("download", Math.round((done / Math.max(1, total)) * 70)),
            isCancelled,
          },
        );

        for (const outcome of batch.results) {
          if (!outcome.ok) {
            items.push({ ok: false, label: outcome.label, error: outcome.error });
            continue;
          }
          const rel = outcome.saved ? relInside(root, outcome.saved) ?? outcome.saved : undefined;
          items.push({ ok: true, label: outcome.label, file: rel });
          if (rel) filesSet.add(rel);

          if (transcribeAfter && outcome.saved) {
            progress("transcribe", 70);
            const relAudio = relInside(root, outcome.saved) ?? outcome.saved;
            if (AUDIO_ONLY_RE.test(outcome.saved)) {
              log(`联动转写: ${path.basename(outcome.saved)}`);
              const out = await transcribeAudioFile(lasr, outcome.saved, {
                log: (t) => log(`[转写] ${t}`),
                progress: (_, pct) => progress("transcribe", 70 + Math.round(pct * 0.3)),
                isCancelled,
              });
              const txtRel = relInside(root, out.txtPath) ?? out.txtPath;
              filesSet.add(txtRel);
              items.push({
                ok: true,
                label: `转写: ${relAudio}`,
                txtFile: txtRel,
                segments: out.segments.length,
              });
            }
          }
        }
      } else {
        // kind = transcribe
        const files = Array.isArray(doc.input.values) ? doc.input.values.map(String).filter((x) => x.trim()) : [];
        if (files.length === 0) throw new Error("没有可转写的文件");
        for (let i = 0; i < files.length; i++) {
          const rel = files[i];
          const abs = path.resolve(root, rel);
          const inside = relInside(root, abs);
          if (inside === null) throw new Error(`文件路径越界: ${rel}`);
          const st = statOrNull(abs);
          if (!st || !st.isFile() || !isAudioFile(abs)) {
            items.push({ ok: false, label: rel, error: "文件不存在或非音频" });
            continue;
          }
          if (!st || st.size <= 0) {
            items.push({ ok: false, label: rel, error: "文件大小为 0" });
            continue;
          }
          log(`[${i + 1}/${files.length}] 转写: ${rel}`);
          progress("transcribe", Math.round((i / files.length) * 100));
          const out = await transcribeAudioFile(lasr, abs, {
            log: (t) => log(`[${i + 1}/${files.length}] ${t}`),
            progress: (_stage, pct) =>
              progress("transcribe", Math.round(((i + pct / 100) / files.length) * 100)),
            isCancelled,
          });
          const relOut = relInside(root, out.txtPath) ?? out.txtPath;
          filesSet.add(rel);
          filesSet.add(relOut);
          items.push({
            ok: true,
            label: rel,
            file: rel,
            txtFile: relOut,
            segments: out.segments.length,
          });
          if (out.srtPath) filesSet.add(relInside(root, out.srtPath) ?? out.srtPath);
          await persistNow();
        }
      }

      const okCount = items.filter((it) => it.ok).length;
      const failItems = items.filter((it) => !it.ok);
      const result: MediaJobResult = {
        summary: `${okCount}/${items.length} 项成功${failItems.length ? `,${failItems.length} 项失败` : ""}`,
        files: Array.from(filesSet),
        items,
      };
      doc.result = result;
      doc.stage = "finalize";
      doc.progress = 100;
      if (isCancelled()) {
        throw new CancelledError();
      }
      const allFail = failItems.length > 0 && okCount === 0;
      await this.deps.store.patch(id, {
        status: allFail ? "failed" : "succeeded",
        stage: "finalize",
        progress: 100,
        result,
        logs: doc.logs,
        finishedAt: Date.now(),
        error: allFail ? failItems.map((f) => f.error).filter(Boolean).join("; ") : undefined,
      });
    } catch (e) {
      if (e instanceof CancelledError) {
        log("任务已取消");
        await this.deps.store.patch(id, {
          status: "cancelled",
          stage: doc.stage,
          progress: doc.progress,
          logs: doc.logs,
          result: items.length ? { summary: "已取消", files: Array.from(filesSet), items } : undefined,
          finishedAt: Date.now(),
        });
        return;
      }
      log(`失败: ${(e as Error).message}`);
      await this.deps.store.patch(id, {
        status: "failed",
        error: (e as Error).message,
        logs: doc.logs,
        finishedAt: Date.now(),
      });
    } finally {
      await persistNow();
    }
  }
}
