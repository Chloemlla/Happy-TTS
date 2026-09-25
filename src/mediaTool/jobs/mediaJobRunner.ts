// 媒体工具 Job 执行器:worker 队列串行/限并发跑 bili-download 与 transcribe,
// 把域引擎的日志/进度/取消桥接到 MediaJobRecord,并写回持久层。
import path from "node:path";
import { downloadBatch } from "../biliYtDlp";
import { CancelledError, isAudioFile, relInside, resolveRootDir, statOrNull } from "../runtime";
import { transcribeAudioFile, type LasrOutcome } from "../vivoLasr";
import type { MediaJobStore } from "./mediaJobStore";
import type { TranscriptStore } from "./transcriptStore";
import type {
  MediaJobFileItem,
  MediaJobRecord,
  MediaJobResult,
  MediaJobStage,
  MediaToolSettings,
} from "../types";
import { resolveJobOutputs } from "../types";

/** 纯音频扩展(视频容器不直接送转写)。 */
const AUDIO_ONLY_RE = /\.(m4a|mp3|wav|aac|amr|flac|ogg|opus|m4b|3gp|wma|mka|ape|caf)$/i;

export interface JobRunnerDeps {
  store: MediaJobStore;
  transcripts: TranscriptStore;
  getSettings(): Promise<MediaToolSettings>;
  mode: string;
}

/** 本地 aborts 集合:cancel 请求(HTTP 同实例)即时生效,不等下一次 store 轮询。 */
export class MediaJobRunner {
  private queue: string[] = [];
  private active = 0;
  private aborts = new Set<string>();
  /** 正在 execute 内(含刚出队)的任务:cancel 用它判断"还有没有执行体会自己写终态"。 */
  private activeIds = new Set<string>();

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

  /**
   * 该任务此刻是否真的在排队或执行中(本进程视角)。
   * 为 false 表示没有任何执行体会再写终态,调用方可以自己把记录落成 cancelled。
   */
  isActive(id: string): boolean {
    return this.queue.includes(id) || this.activeIds.has(id);
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
    this.activeIds.add(id);
    try {
      await this.runJob(id);
    } catch (e) {
      try {
        await this.terminate(id, "failed", (e as Error).message);
      } catch {
        // 已尽力
      }
    } finally {
      this.activeIds.delete(id);
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

  /**
   * 转写正文入库:调用点都在写任务指针之前,顺序上先有正文再有指针。
   * 入库失败只记日志——磁盘产物已经写好,不能反过来把成功的转写判成失败。
   */
  private async saveTranscript(
    job: MediaJobRecord,
    index: number,
    label: string,
    out: LasrOutcome,
    log: (text: string) => void,
  ): Promise<void> {
    try {
      await this.deps.transcripts.save({
        jobId: job.id,
        index,
        scope: job.scope ?? "admin",
        ownerId: job.ownerId,
        label,
        durationSec: out.durationSec,
        segmentCount: out.segments.length,
        plainText: out.plainText,
        segments: out.segments,
        createdAt: Date.now(),
      });
    } catch (e) {
      log(`正文入库失败(产物文件已落盘,不影响任务结果): ${(e as Error).message}`);
    }
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
    // 写盘串成一条链:节流写与终态写必须按发起顺序落库。不串的话,先发出的 "running"
    // 快照可能后到达,把刚写好的终态盖回 running,任务就永久卡在运行中(取消/删除全被挡住)。
    let writeChain: Promise<void> = Promise.resolve();
    const persist = (): Promise<void> => {
      writeChain = writeChain.then(async () => {
        // 整段包住:链上任何一环 reject,后续 .then 都会被跳过,终态就永远写不出去
        try {
          // 快照在真正写的时候取:链上后发的写一定带更新的状态,终态写必然是最后落库的那笔
          const snapshot = JSON.parse(JSON.stringify(doc)) as MediaJobRecord;
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
      });
      return writeChain;
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
      // 并发上传与多文件并发时完成顺序是乱的,进度只单调向前,避免回跳
      doc.progress = Math.max(doc.progress, Math.max(0, Math.min(100, Math.round(pct))));
      schedulePersist();
    };
    const isCancelled = () => this.aborts.has(id);
    await persistNow();

    const params = doc.params ?? {};
    const outputs = resolveJobOutputs(params, settings.lasr.outputs);
    const lasr = {
      ...settings.lasr,
      outputs,
      concurrency: Math.max(1, Math.min(8, settings.lasr.concurrency || 1)),
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
              const txtRel = relInside(root, out.txtPath ?? out.jsonPath) ?? undefined;
              if (txtRel) filesSet.add(txtRel);
              const itemIndex = items.length;
              items.push({
                ok: true,
                label: `转写: ${relAudio}`,
                txtFile: txtRel,
                timedFile: out.timedPath ? relInside(root, out.timedPath) ?? out.timedPath : undefined,
                srtFile: out.srtPath ? relInside(root, out.srtPath) ?? out.srtPath : undefined,
                jsonFile: relInside(root, out.jsonPath) ?? out.jsonPath,
                segments: out.segments.length,
                durationSec: out.durationSec,
              });
              await this.saveTranscript(doc, itemIndex, `转写: ${relAudio}`, out, log);
            }
          }
        }
      } else {
        // kind = transcribe:任务内多文件按 lasr.concurrency 并发跑,
        // 单件失败不拖垮整批(记入 items 继续跑),取消仍整链中断。
        const files = Array.isArray(doc.input.values) ? doc.input.values.map(String).filter((x) => x.trim()) : [];
        if (files.length === 0) throw new Error("没有可转写的文件");
        for (const rel of files) {
          const abs = path.resolve(root, rel);
          const inside = relInside(root, abs);
          if (inside === null) throw new Error(`文件路径越界: ${rel}`);
          const st = statOrNull(abs);
          if (!st || !st.isFile() || !isAudioFile(abs)) throw new Error(`文件不存在或非音频: ${rel}`);
        }

        const slot = new Array<MediaJobFileItem | undefined>(files.length).fill(undefined);
        const total = files.length;
        const poolSize = Math.max(1, Math.min(lasr.concurrency, total));
        let cursor = 0;
        let finished = 0;
        log(`并发 ${poolSize}, 共 ${total} 个文件`);
        progress("transcribe", 0);

        const runOne = async (i: number): Promise<void> => {
          const rel = files[i];
          const abs = path.resolve(root, rel);
          const tag = `[${i + 1}/${total}]`;
          log(`${tag} 转写: ${rel}`);
          try {
            const out = await transcribeAudioFile(lasr, abs, {
              log: (t) => log(`${tag} ${t}`),
              progress: (_stage, pct) =>
                progress("transcribe", Math.round(((finished + pct / 100) / total) * 100)),
              isCancelled,
            });
            const relOut = relInside(root, out.txtPath ?? out.jsonPath) ?? undefined;
            filesSet.add(rel);
            if (relOut) filesSet.add(relOut);
            if (out.timedPath) filesSet.add(relInside(root, out.timedPath) ?? out.timedPath);
            if (out.srtPath) filesSet.add(relInside(root, out.srtPath) ?? out.srtPath);
            filesSet.add(relInside(root, out.jsonPath) ?? out.jsonPath);
            slot[i] = {
              ok: true,
              label: rel,
              file: rel,
              txtFile: relOut,
              timedFile: out.timedPath ? relInside(root, out.timedPath) ?? out.timedPath : undefined,
              srtFile: out.srtPath ? relInside(root, out.srtPath) ?? out.srtPath : undefined,
              jsonFile: relInside(root, out.jsonPath) ?? out.jsonPath,
              segments: out.segments.length,
              durationSec: out.durationSec,
            };
            await this.saveTranscript(doc, i, rel, out, log);
          } catch (e) {
            if (e instanceof CancelledError) throw e;
            slot[i] = { ok: false, label: rel, file: rel, error: (e as Error).message };
            log(`${tag} [失败] ${rel}: ${(e as Error).message}`);
          }
          finished += 1;
          progress("transcribe", Math.round((finished / total) * 100));
          await persistNow();
        };

        const workers = Array.from({ length: poolSize }, async () => {
          while (true) {
            if (isCancelled()) throw new CancelledError();
            const i = cursor++;
            if (i >= total) break;
            await runOne(i);
          }
        });
        await Promise.all(workers);
        for (const it of slot) if (it) items.push(it);
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
      // 终态只写进内存副本,由 finally 的 persistNow() 统一落库:
      // 之前这里先 patch 终态、finally 又拿旧的内存副本补一刀,那一刀会把 status 盖回 running,
      // 任务于是永久停在"运行中"(取消、删除、每用户并发配额全被它挡住)。
      doc.status = allFail ? "failed" : "succeeded";
      doc.finishedAt = Date.now();
      doc.error = allFail ? failItems.map((f) => f.error).filter(Boolean).join("; ") : undefined;
    } catch (e) {
      if (e instanceof CancelledError) {
        log("任务已取消");
        doc.status = "cancelled";
        doc.finishedAt = Date.now();
        if (items.length) {
          doc.result = { summary: "已取消", files: Array.from(filesSet), items };
        }
      } else {
        log(`失败: ${(e as Error).message}`);
        doc.status = "failed";
        doc.error = (e as Error).message;
        doc.finishedAt = Date.now();
      }
    } finally {
      await persistNow();
    }
  }
}
