import { config } from "../config/config";
import { InternalServiceClientError } from "../services/internalServiceClient";
import { rustAudioWorkerClient, RustAudioWorkerClient } from "../services/rustAudioWorkerClient";
import logger from "../utils/logger";
import { TtsGenerationError } from "./tts.errors";
import type { TtsAudioPostProcessInput, TtsAudioPostProcessResult, TtsAudioPostProcessor } from "./tts.ports";

export class DefaultTtsAudioPostProcessor implements TtsAudioPostProcessor {
  public constructor(private readonly audioWorkerClient: Pick<RustAudioWorkerClient, "processAudio"> = rustAudioWorkerClient) {}

  public async process(input: TtsAudioPostProcessInput): Promise<TtsAudioPostProcessResult> {
    if (!config.rustServices.audioWorker.enabled) {
      return this.passthrough(input);
    }

    try {
      const processed = await this.audioWorkerClient.processAudio(input);
      logger.info("TTS Rust音频后处理完成", {
        taskId: input.taskId,
        contentHash: input.contentHash,
        outputFormat: processed.outputFormat,
        source: processed.source,
      });
      return processed;
    } catch (error) {
      logger.warn("TTS Rust音频后处理失败", {
        taskId: input.taskId,
        contentHash: input.contentHash,
        source: "rust-audio-worker",
        error: error instanceof Error ? error.message : "未知错误",
      });

      if (config.rustServices.audioWorker.fallbackEnabled) {
        logger.warn("TTS Rust音频后处理回退到原始音频", {
          taskId: input.taskId,
          contentHash: input.contentHash,
          source: "node-fallback",
        });
        return this.passthrough(input);
      }

      const statusCode = error instanceof InternalServiceClientError ? error.statusCode || 502 : 502;
      throw new TtsGenerationError("语音后处理失败，请稍后重试", statusCode, "TTS_AUDIO_POST_PROCESS_FAILED", true);
    }
  }

  private passthrough(input: TtsAudioPostProcessInput): TtsAudioPostProcessResult {
    return {
      audioBuffer: input.audioBuffer,
      outputFormat: input.outputFormat,
      source: "node-passthrough",
    };
  }
}

export const ttsAudioPostProcessor = new DefaultTtsAudioPostProcessor();
