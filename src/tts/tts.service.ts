import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { config } from "../config/config";
import logger from "../utils/logger";
import { ttsAssetAccessService } from "./tts.assetAccess";
import { ttsAudioAssetStore } from "./tts.asset";
import { TtsGenerationError } from "./tts.errors";
import type { TtsProviderRequest } from "./tts.ports";
import { ttsProviderRouter, TtsProviderRouter } from "./tts.provider-router";

dotenv.config();

type OutputFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface TtsRequest extends TtsProviderRequest {}

interface UserViolation {
  count: number;
  lastViolation: number;
}

interface CircuitState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  consecutiveFailures: number;
  openedAt: number;
  halfOpenSuccesses: number;
}

const OPENAI_MAX_RETRIES = 2;
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 60_000;
const CIRCUIT_SUCCESS_THRESHOLD = 2;

export class TtsService {
  private static readonly circuit: CircuitState = {
    state: "CLOSED",
    consecutiveFailures: 0,
    openedAt: 0,
    halfOpenSuccesses: 0,
  };

  private readonly outputDir: string;
  private readonly baseUrl: string;
  private readonly userViolations: Map<string, UserViolation>;
  private readonly violationThreshold = 3;
  private readonly violationWindow = 24 * 60 * 60 * 1000;

  constructor(private readonly providerRouter: TtsProviderRouter = ttsProviderRouter) {
    this.outputDir = config.audioDir;
    this.baseUrl = config.baseUrl;
    this.userViolations = new Map();
    this.ensureOutputDir();
  }

  private ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  public generateContentHash(text: string, voice: string, model: string): string {
    return crypto.createHash("md5").update(`${text}-${voice}-${model}`).digest("hex");
  }

  public resolveOutputFormat(format: string): OutputFormat {
    const validFormats: OutputFormat[] = ["mp3", "opus", "aac", "flac", "wav", "pcm"];
    return validFormats.includes(format as OutputFormat) ? (format as OutputFormat) : "mp3";
  }

  public buildAudioUrl(fileName: string) {
    return `${this.baseUrl}/api/tts/assets/${encodeURIComponent(fileName)}`;
  }

  private hashFingerprint(fingerprint?: string): string | undefined {
    if (!fingerprint || fingerprint === "unknown") {
      return undefined;
    }
    return crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 24);
  }

  private validateFileName(fileName: string): string {
    const sanitized = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
    return path.basename(sanitized);
  }

  private checkUserViolation(userId: string): boolean {
    const violation = this.userViolations.get(userId);
    if (!violation) {
      return false;
    }

    const now = Date.now();
    if (now - violation.lastViolation > this.violationWindow) {
      this.userViolations.delete(userId);
      return false;
    }

    return violation.count >= this.violationThreshold;
  }

  private recordViolation(userId: string) {
    const now = Date.now();
    const violation = this.userViolations.get(userId) || { count: 0, lastViolation: now };

    if (now - violation.lastViolation > this.violationWindow) {
      violation.count = 1;
    } else {
      violation.count += 1;
    }

    violation.lastViolation = now;
    this.userViolations.set(userId, violation);
  }

  private assertCircuitAllowsRequest() {
    const circuit = TtsService.circuit;
    if (circuit.state === "CLOSED") {
      return;
    }

    if (circuit.state === "OPEN") {
      if (Date.now() - circuit.openedAt >= CIRCUIT_OPEN_MS) {
        circuit.state = "HALF_OPEN";
        circuit.consecutiveFailures = 0;
        circuit.halfOpenSuccesses = 0;
        logger.warn("TTS Provider 熔断器进入 HALF_OPEN");
        return;
      }

      throw new TtsGenerationError("语音服务暂时繁忙，请稍后重试", 503, "TTS_CIRCUIT_OPEN", true);
    }
  }

  private recordCircuitSuccess() {
    const circuit = TtsService.circuit;
    if (circuit.state === "HALF_OPEN") {
      circuit.halfOpenSuccesses += 1;
      if (circuit.halfOpenSuccesses >= CIRCUIT_SUCCESS_THRESHOLD) {
        circuit.state = "CLOSED";
        circuit.consecutiveFailures = 0;
        circuit.halfOpenSuccesses = 0;
        logger.info("TTS Provider 熔断器已恢复 CLOSED");
      }
      return;
    }

    circuit.consecutiveFailures = 0;
  }

  private recordCircuitFailure() {
    const circuit = TtsService.circuit;

    if (circuit.state === "HALF_OPEN") {
      circuit.state = "OPEN";
      circuit.openedAt = Date.now();
      circuit.consecutiveFailures = 0;
      circuit.halfOpenSuccesses = 0;
      logger.warn("TTS Provider 熔断器在 HALF_OPEN 期间失败，重新打开");
      return;
    }

    circuit.consecutiveFailures += 1;
    if (circuit.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      circuit.state = "OPEN";
      circuit.openedAt = Date.now();
      circuit.halfOpenSuccesses = 0;
      logger.error("TTS Provider 熔断器已打开", {
        consecutiveFailures: circuit.consecutiveFailures,
      });
    }
  }

  public async findExistingFile(contentHash: string, outputFormat: string): Promise<string | null> {
    const safeOutputFormat = this.resolveOutputFormat(outputFormat);
    const safeContentHash = /^[a-f0-9]{32}$/i.test(contentHash) ? contentHash : "";

    if (!safeContentHash) {
      return null;
    }

    const fileName = `${safeContentHash}.${safeOutputFormat}`;
    const safeFileName = this.validateFileName(fileName);
    const filePath = path.join(this.outputDir, safeFileName);
    if (fs.existsSync(filePath)) {
      return safeFileName;
    }

    const restored = await ttsAudioAssetStore.restoreAudioAssetToDisk(safeFileName, this.outputDir);
    return restored ? safeFileName : null;
  }

  private isRetryableError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    if (error instanceof TtsGenerationError) {
      return error.retryable;
    }

    const statusCode = Number((error as { status?: number; statusCode?: number }).status ?? 0);
    const code = String((error as { code?: string }).code ?? "");

    return (
      statusCode === 408 ||
      statusCode === 409 ||
      statusCode === 429 ||
      statusCode >= 500 ||
      ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(code)
    );
  }

  private mapProviderError(error: unknown): TtsGenerationError {
    if (error instanceof TtsGenerationError) {
      return error;
    }

    const statusCode = Number((error as { status?: number; statusCode?: number }).status ?? 0);
    const code = String((error as { code?: string; type?: string }).code ?? (error as { type?: string }).type ?? "");

    if (statusCode === 400) {
      return new TtsGenerationError("语音生成参数无效，请调整后重试", 400, code || "TTS_BAD_REQUEST", false);
    }

    if (statusCode === 401 || statusCode === 403) {
      return new TtsGenerationError("语音服务鉴权失败，请联系管理员检查配置", 502, code || "TTS_AUTH_FAILED", false);
    }

    if (statusCode === 429) {
      return new TtsGenerationError("语音服务当前请求过多，请稍后重试", 503, code || "TTS_RATE_LIMITED", true);
    }

    if (statusCode >= 500) {
      return new TtsGenerationError("语音服务暂时不可用，请稍后重试", 503, code || "TTS_UPSTREAM_5XX", true);
    }

    if (this.isRetryableError(error)) {
      return new TtsGenerationError("语音服务连接异常，请稍后重试", 503, code || "TTS_UPSTREAM_RETRYABLE", true);
    }

    return new TtsGenerationError("生成语音失败", 500, code || "TTS_UNKNOWN_FAILURE", false);
  }

  private async requestSpeechWithRetry(request: TtsRequest, safeOutputFormat: OutputFormat) {
    let lastError: TtsGenerationError | null = null;

    for (let attempt = 1; attempt <= OPENAI_MAX_RETRIES + 1; attempt += 1) {
      try {
        return await this.providerRouter.synthesize({
          ...request,
          outputFormat: safeOutputFormat,
        });
      } catch (error) {
        const mappedError = this.mapProviderError(error);
        lastError = mappedError;

        logger.warn("TTS Provider 调用失败", {
          attempt,
          code: mappedError.code,
          statusCode: mappedError.statusCode,
          retryable: mappedError.retryable,
          message: mappedError.message,
        });

        if (!mappedError.retryable || attempt > OPENAI_MAX_RETRIES) {
          throw mappedError;
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }

    throw lastError ?? new TtsGenerationError("生成语音失败");
  }

  public async generateSpeech(request: TtsRequest) {
    try {
      const { text, model, voice, outputFormat, userId, isAdmin } = request;

      if (!text) {
        throw new TtsGenerationError("文本不能为空", 400, "TTS_EMPTY_TEXT", false);
      }

      if (userId && !isAdmin && this.checkUserViolation(userId)) {
        throw new TtsGenerationError("由于重复提交相同内容，您的账号已被临时封禁24小时", 429, "TTS_USER_BLOCKED", false);
      }

      const contentHash = this.generateContentHash(text, voice, model);
      const safeOutputFormat = this.resolveOutputFormat(outputFormat);
      const existingFile = await this.findExistingFile(contentHash, safeOutputFormat);

      if (existingFile) {
        if (userId && !isAdmin) {
          this.recordViolation(userId);
        }

        const metadata = await ttsAudioAssetStore.getAudioAssetMetadata(existingFile);
        const watermarkId =
          metadata?.watermarkId ||
          ttsAssetAccessService.buildWatermarkId({
            contentHash,
            fileName: existingFile,
            userId,
            taskId: request.taskId,
            fingerprint: request.fingerprint,
          });

        return {
          fileName: existingFile,
          audioUrl: this.buildAudioUrl(existingFile),
          isDuplicate: true,
          outputFormat: safeOutputFormat,
          provider: "cache",
          providerModel: model || config.openaiModel,
          providerVoice: voice || config.openaiVoice,
          watermarkId,
        };
      }

      this.assertCircuitAllowsRequest();
      const response = await this.requestSpeechWithRetry(request, safeOutputFormat);

      const fileName = `${contentHash}.${safeOutputFormat}`;
      const safeFileName = this.validateFileName(fileName);
      const filePath = path.join(this.outputDir, safeFileName);
      const watermarkId = ttsAssetAccessService.buildWatermarkId({
        contentHash,
        fileName: safeFileName,
        userId,
        taskId: request.taskId,
        fingerprint: request.fingerprint,
      });

      await fs.promises.writeFile(filePath, response.audioBuffer);
      await ttsAudioAssetStore.persistAudioAsset({
        contentHash,
        fileName: safeFileName,
        outputFormat: safeOutputFormat,
        buffer: response.audioBuffer,
        watermarkId,
        ownerUserId: userId,
        sourceTaskId: request.taskId,
        sourceFingerprintHash: this.hashFingerprint(request.fingerprint),
        policyVersion: request.policyVersion,
      });
      this.recordCircuitSuccess();

      return {
        fileName: safeFileName,
        audioUrl: this.buildAudioUrl(safeFileName),
        isDuplicate: false,
        outputFormat: safeOutputFormat,
        provider: response.provider,
        providerModel: response.providerModel,
        providerVoice: response.providerVoice,
        watermarkId,
      };
    } catch (error) {
      const mappedError = this.mapProviderError(error);
      if (mappedError.retryable || mappedError.statusCode >= 500) {
        this.recordCircuitFailure();
      }
      logger.error("生成语音失败:", mappedError);
      throw mappedError;
    }
  }
}
