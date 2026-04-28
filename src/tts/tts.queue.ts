import { addGenerationRecord } from "../services/userGenerationService";
import { UserStorage } from "../utils/userStorage";
import { StorageManager } from "../utils/storage";
import { wsService } from "../services/wsService";
import logger from "../utils/logger";
import { TtsService } from "./tts.service";
import { type TtsJobRecord, type TtsNextAction, ttsStorage } from "./tts.storage";

interface QueueCallbacks {
  buildUsageSummary: (userId?: string, isAdmin?: boolean) => Promise<TtsJobRecord["usage"]>;
  buildNextAction: (type: string, label: string, message: string) => TtsNextAction;
}

export class TtsQueue {
  private readonly ttsService = new TtsService();
  private processing = false;

  constructor(private readonly callbacks: QueueCallbacks) {}

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
      while (true) {
        const nextJob = ttsStorage.getNextQueuedJob();
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
    await ttsStorage.updateJob(job.taskId, {
      status: "processing",
      message: "正在生成语音...",
    });

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

      if (job.userId && !job.isAdmin) {
        const contentHash = this.ttsService.generateContentHash(
          job.request.text,
          job.request.voice,
          job.request.model,
        );

        await addGenerationRecord({
          userId: job.userId,
          text: job.request.text,
          voice: job.request.voice,
          model: job.request.model,
          outputFormat: job.request.outputFormat,
          speed: job.request.speed,
          fileName: result.fileName,
          contentHash,
        });

        const usageRecorded = await UserStorage.incrementUsage(job.userId);
        if (!usageRecorded) {
          logger.warn("TTS 成功后写入用户用量失败", {
            userId: job.userId,
            fileName: result.fileName,
          });
        }
      }

      await StorageManager.addRecord(job.ip, job.fingerprint, job.request.text, result.fileName);

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
      const nextAction = this.callbacks.buildNextAction("retry", "稍后重试", "生成失败，请稍后重试。");

      await ttsStorage.failJob(job.taskId, message, nextAction);

      if (job.userId) {
        wsService.notifyTtsError(job.userId, {
          taskId: job.taskId,
          error: message,
        });
      }
    }
  }
}
