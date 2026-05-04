import { wsService } from "../services/wsService";
import logger from "../utils/logger";
import { generationHistoryStore } from "./tts.history";
import type { GenerationHistoryStore, QuotaLedger } from "./tts.ports";
import { quotaLedger } from "./tts.quota";
import { TtsService } from "./tts.service";
import { type TtsJobRecord, type TtsNextAction, ttsStorage } from "./tts.storage";

interface QueueCallbacks {
  buildUsageSummary: (userId?: string, isAdmin?: boolean) => Promise<TtsJobRecord["usage"]>;
  buildNextAction: (type: string, label: string, message: string) => TtsNextAction;
}

const PROCESSING_LEASE_MS = 15 * 60 * 1000;

export class TtsQueue {
  private readonly ttsService = new TtsService();
  private readonly workerId = `tts-worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  private processing = false;

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
      return;
    }

    this.processing = true;
    try {
      await ttsStorage.recoverStaleJobs(Date.now());

      while (true) {
        const nextJob = await ttsStorage.claimNextQueuedJob(this.workerId, PROCESSING_LEASE_MS);
        if (!nextJob) {
          break;
        }

        await this.processJob(nextJob);
      }
    } finally {
      this.processing = false;
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
      const result = await this.ttsService.generateSpeech({
        ...job.request,
        userId: job.userId,
        isAdmin: job.isAdmin,
      });

      const contentHash = this.ttsService.generateContentHash(job.request.text, job.request.voice, job.request.model);

      await this.historyStore.addRecord({
        scope: job.userId ? "user" : "anonymous",
        userId: job.userId,
        ip: job.ip,
        fingerprint: job.fingerprint,
        text: job.request.text,
        voice: job.request.voice,
        model: job.request.model,
        outputFormat: job.request.outputFormat,
        speed: job.request.speed,
        contentHash,
        fileName: result.fileName,
        audioUrl: result.audioUrl,
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

      await ttsStorage.completeJob(
        job.taskId,
        {
          fileName: result.fileName,
          audioUrl: result.audioUrl,
          isDuplicate: result.isDuplicate,
          outputFormat: result.outputFormat,
          provider: result.provider,
          providerModel: result.providerModel,
          providerVoice: result.providerVoice,
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
