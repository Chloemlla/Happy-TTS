import { wsService } from "../services/wsService";
import logger from "../utils/logger";
import { generationHistoryStore, redactTtsTextForStorage } from "./tts.history";
import type { GenerationHistoryStore, QuotaLedger } from "./tts.ports";
import { quotaLedger } from "./tts.quota";
import { TtsService } from "./tts.service";
import { type TtsJobRecord, type TtsNextAction, ttsStorage } from "./tts.storage";

interface QueueCallbacks {
  buildUsageSummary: (userId?: string, isAdmin?: boolean) => Promise<TtsJobRecord["usage"]>;
  buildNextAction: (type: string, label: string, message: string) => TtsNextAction;
}

const PROCESSING_LEASE_MS = 15 * 60 * 1000;
const MAX_QUEUE_CONCURRENCY = 5;

function resolveQueueConcurrency(): number {
  const raw = Number(process.env.TTS_QUEUE_CONCURRENCY || "2");
  if (!Number.isFinite(raw)) {
    return 2;
  }
  return Math.max(1, Math.min(MAX_QUEUE_CONCURRENCY, Math.floor(raw)));
}

export class TtsQueue {
  private readonly ttsService = new TtsService();
  private readonly workerId = `tts-worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private readonly concurrency = resolveQueueConcurrency();
  private processing = false;
  private drainRequested = false;

  constructor(
    private readonly callbacks: QueueCallbacks,
    private readonly historyStore: GenerationHistoryStore = generationHistoryStore,
    private readonly ledger: QuotaLedger = quotaLedger,
  ) {}

  public async enqueue(job: TtsJobRecord) {
    await ttsStorage.createJob(job);
    void this.drain();
    return job;
  }

  private async drain() {
    if (this.processing) {
      this.drainRequested = true;
      return;
    }

    this.processing = true;
    try {
      await ttsStorage.recoverStaleJobs(Date.now());

      const active = new Set<Promise<void>>();
      while (true) {
        while (active.size < this.concurrency) {
          const nextJob = await ttsStorage.claimNextQueuedJob(this.workerId, PROCESSING_LEASE_MS);
          if (!nextJob) {
            break;
          }

          const task = this.processJob(nextJob).finally(() => {
            active.delete(task);
          });
          active.add(task);
        }

        if (active.size === 0) {
          break;
        }

        await Promise.race(active);
      }
    } finally {
      this.processing = false;
      if (this.drainRequested) {
        this.drainRequested = false;
        void this.drain();
      }
    }
  }

  private async processJob(job: TtsJobRecord) {
    if (job.userId) {
      wsService.notifyTtsProgress(job.userId, {
        taskId: job.taskId,
        status: "processing",
        message: "正在生成语音...",
      });
    }

    try {
      const providerExecution = await this.ttsService.resolveProviderExecution(
        job.request.model,
        job.request.voice,
        job.request.providerExecution,
      );
      const effectiveRequest = {
        ...job.request,
        model: providerExecution.model,
        voice: providerExecution.voice,
        providerExecution,
      };
      const result = await this.ttsService.generateSpeech({
        ...effectiveRequest,
        userId: job.userId,
        isAdmin: job.isAdmin,
        taskId: job.taskId,
        ip: job.ip,
        fingerprint: job.fingerprint,
        policyVersion: job.governance?.policyVersion,
      });

      const contentHash = this.ttsService.generateContentHash(
        effectiveRequest.text,
        effectiveRequest.voice,
        effectiveRequest.model,
        providerExecution,
      );

      await this.historyStore.addRecord({
        scope: job.userId ? "user" : "anonymous",
        userId: job.userId,
        ip: job.ip,
        fingerprint: job.fingerprint,
        text: effectiveRequest.text,
        voice: effectiveRequest.voice,
        model: effectiveRequest.model,
        outputFormat: effectiveRequest.outputFormat,
        speed: effectiveRequest.speed,
        contentHash,
        fileName: result.fileName,
        audioUrl: result.audioUrl,
        audioFileId: result.audioFileId,
        audioStorage: result.audioStorage,
        audioMimeType: result.audioMimeType,
        audioSize: result.audioSize,
        provider: result.provider,
        providerModel: result.providerModel,
        providerVoice: result.providerVoice,
        createdAt: new Date().toISOString(),
      });

      if (job.userId && !job.isAdmin) {
        await this.ledger.confirm(job.userId, job.taskId);
      }

      const usage = await this.callbacks.buildUsageSummary(job.userId, job.isAdmin);
      const nextAction = this.callbacks.buildNextAction(
        "play_or_download",
        "播放或下载音频",
        "音频已生成完成，可直接播放或下载。",
      );

      await ttsStorage.updateJob(job.taskId, {
        request: {
          ...effectiveRequest,
          text: redactTtsTextForStorage(effectiveRequest.text),
        },
      });

      await ttsStorage.completeJob(
        job.taskId,
        {
          text: job.request.text,
          fileName: result.fileName,
          audioUrl: result.audioUrl,
          audioFileId: result.audioFileId,
          audioStorage: result.audioStorage,
          audioMimeType: result.audioMimeType,
          audioSize: result.audioSize,
          isDuplicate: result.isDuplicate,
          outputFormat: result.outputFormat,
          provider: result.provider,
          providerModel: result.providerModel,
          providerVoice: result.providerVoice,
          watermark: result.watermarkId
            ? {
                id: result.watermarkId,
                kind: "server_forensic",
                policyVersion: job.governance?.policyVersion,
              }
            : undefined,
          permissions: {
            canDownload: process.env.TTS_DOWNLOADS_ENABLED !== "false",
            canShare: process.env.TTS_ASSET_SHARE_ENABLED === "true",
          },
          message: result.isDuplicate ? "检测到重复内容，已返回已有音频。" : "语音生成成功，音频已准备就绪。",
          status: result.isDuplicate ? "reused" : "generated",
        },
        usage ?? undefined,
        nextAction,
      );

      if (job.userId) {
        wsService.notifyTtsComplete(job.userId, {
          taskId: job.taskId,
          audioUrl: result.audioUrl,
          fileName: result.fileName,
        });
      }
    } catch (error) {
      logger.error("TTS 队列处理失败", error);
      const message = error instanceof Error ? error.message : "生成语音失败";

      let usage = job.usage;
      if (job.userId && !job.isAdmin) {
        await this.ledger.release(job.userId, job.taskId);
        usage = await this.callbacks.buildUsageSummary(job.userId, job.isAdmin);
      }

      const nextAction = this.callbacks.buildNextAction("retry", "稍后重试", "生成失败，请稍后重试。");
      await ttsStorage.updateJob(job.taskId, {
        request: {
          ...job.request,
          text: redactTtsTextForStorage(job.request.text),
        },
      });
      await ttsStorage.failJob(job.taskId, message, usage ?? undefined, nextAction);

      if (job.userId) {
        wsService.notifyTtsError(job.userId, {
          taskId: job.taskId,
          error: message,
        });
      }
    }
  }
}
