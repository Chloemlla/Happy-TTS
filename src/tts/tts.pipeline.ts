import axios from "axios";
import { ContentFilterService } from "../services/contentFilterService";
import { TurnstileService } from "../services/turnstileService";
import type { User } from "../utils/userStorage";
import { UserStorage } from "../utils/userStorage";
import { TtsRequestError } from "./tts.errors";
import { generationHistoryStore } from "./tts.history";
import type { GenerationHistoryStore, QuotaLedger, TtsSettingsStore, TtsUsageSnapshot } from "./tts.ports";
import { quotaLedger } from "./tts.quota";
import { ttsSettingsStore } from "./tts.settings";
import type { TtsJobRequestPayload, TtsUsageSummary } from "./tts.storage";
import { TtsService } from "./tts.service";

export interface TtsSubmissionInput {
  text: unknown;
  model: unknown;
  voice: unknown;
  outputFormat: unknown;
  output_format: unknown;
  speed: unknown;
  fingerprint: unknown;
  generationCode: unknown;
  cfToken: unknown;
}

export interface TtsSubmissionContext {
  input: TtsSubmissionInput;
  ip: string;
  currentUser: User | null;
  taskId?: string;
}

export interface TtsSubmissionResult {
  requestPayload: TtsJobRequestPayload;
  ip: string;
  fingerprint: string;
  userId?: string;
  isAdmin?: boolean;
  usageSummary: TtsUsageSummary;
  duplicateJobResult?: {
    fileName: string;
    audioUrl: string;
    message: string;
    outputFormat: string;
  };
}

export class TtsSubmissionPipeline {
  private readonly ttsService = new TtsService();

  constructor(
    private readonly settingsStore: TtsSettingsStore = ttsSettingsStore,
    private readonly historyStore: GenerationHistoryStore = generationHistoryStore,
    private readonly ledger: QuotaLedger = quotaLedger,
  ) {}

  private buildUsageSummaryFromSnapshot(currentUser: User | null, snapshot: TtsUsageSnapshot | null): TtsUsageSummary {
    if (!currentUser) {
      return {
        authenticated: false,
        isAdmin: false,
        dailyLimit: null,
        usedToday: null,
        remainingToday: null,
        reservedToday: null,
      };
    }

    if (currentUser.role === "admin") {
      return {
        authenticated: true,
        isAdmin: true,
        dailyLimit: null,
        usedToday: null,
        remainingToday: null,
        reservedToday: null,
      };
    }

    const dailyLimit = UserStorage.getDailyLimit();
    const reservedToday = snapshot?.reservedToday ?? 0;
    const consumedToday = snapshot?.consumedToday ?? 0;
    const remainingToday = snapshot?.remainingToday ?? Math.max(0, dailyLimit - reservedToday - consumedToday);

    return {
      authenticated: true,
      isAdmin: false,
      dailyLimit,
      usedToday: consumedToday,
      remainingToday,
      reservedToday,
    };
  }

  public async buildUsageSummaryByUserId(userId?: string, isAdmin?: boolean): Promise<TtsUsageSummary> {
    if (!userId) {
      return this.buildUsageSummaryFromSnapshot(null, null);
    }

    if (isAdmin) {
      return {
        authenticated: true,
        isAdmin: true,
        dailyLimit: null,
        usedToday: null,
        remainingToday: null,
        reservedToday: null,
      };
    }

    const snapshot = await this.ledger.getUsageSnapshot(userId);
    return this.buildUsageSummaryFromSnapshot(snapshot.user, snapshot);
  }

  private buildRequestPayload(input: TtsSubmissionInput): TtsJobRequestPayload {
    const normalizedOutputFormat =
      typeof input.outputFormat === "string" && input.outputFormat.trim().length > 0
        ? input.outputFormat.trim()
        : typeof input.output_format === "string" && input.output_format.trim().length > 0
          ? input.output_format.trim()
          : "mp3";

    return {
      text: typeof input.text === "string" ? input.text : "",
      model: typeof input.model === "string" ? input.model : "",
      voice: typeof input.voice === "string" ? input.voice : "",
      outputFormat: this.ttsService.resolveOutputFormat(normalizedOutputFormat),
      speed: typeof input.speed === "number" ? input.speed : Number(input.speed ?? 0),
    };
  }

  private async validateContent(text: string) {
    if (!text) {
      throw new TtsRequestError(400, "文本内容不能为空", "TTS_EMPTY_TEXT");
    }

    if (text.length > 4096) {
      throw new TtsRequestError(400, "文本长度不能超过4096个字符", "TTS_TEXT_TOO_LONG");
    }

    if (!ContentFilterService.shouldSkipDetection()) {
      const contentFilterResult = await ContentFilterService.detectProhibitedContent(text);
      if (contentFilterResult.isProhibited) {
        throw new TtsRequestError(403, "内容包含违禁词，无法生成语音", "TTS_CONTENT_PROHIBITED");
      }
    }

    try {
      const detectResponse = await axios.get(`https://v2.xxapi.cn/api/detect?text=${encodeURIComponent(text)}`, {
        timeout: 10000,
      });
      if (detectResponse.data.is_prohibited) {
        throw new TtsRequestError(400, "文本包含违禁内容，请修改后重试", "TTS_REMOTE_CONTENT_PROHIBITED");
      }
    } catch (error) {
      if (error instanceof TtsRequestError) {
        throw error;
      }
      throw new TtsRequestError(500, "违禁词检测服务暂时不可用，请稍后重试", "TTS_REMOTE_FILTER_UNAVAILABLE", true);
    }
  }

  private async validateGenerationCode(generationCode: unknown) {
    const expectedCode = await this.settingsStore.getGenerationCode();
    if (
      typeof generationCode !== "string" ||
      generationCode.length === 0 ||
      !expectedCode ||
      generationCode !== expectedCode
    ) {
      throw new TtsRequestError(403, "生成码无效", "TTS_INVALID_GENERATION_CODE");
    }
  }

  private async validateTurnstile(cfToken: unknown, ip: string) {
    if (!(await TurnstileService.isEnabled())) {
      return;
    }

    const verified = await TurnstileService.verifyToken(typeof cfToken === "string" ? cfToken : "", ip);
    if (!verified) {
      throw new TtsRequestError(403, "人机验证失败，请重新验证", "TTS_TURNSTILE_FAILED");
    }
  }

  public async validateAndBuild(context: TtsSubmissionContext): Promise<TtsSubmissionResult> {
    const requestPayload = this.buildRequestPayload(context.input);
    const fingerprint =
      typeof context.input.fingerprint === "string" && context.input.fingerprint.trim().length > 0
        ? context.input.fingerprint.trim()
        : "unknown";
    const userId = context.currentUser?.id;
    const isAdmin = context.currentUser?.role === "admin";

    await this.validateContent(requestPayload.text);
    await this.validateGenerationCode(context.input.generationCode);
    await this.validateTurnstile(context.input.cfToken, context.ip);

    const contentHash = this.ttsService.generateContentHash(
      requestPayload.text,
      requestPayload.voice,
      requestPayload.model,
    );

    if (userId && !isAdmin) {
      const snapshot = await this.ledger.getUsageSnapshot(userId);
      const usageSummary = this.buildUsageSummaryFromSnapshot(context.currentUser, snapshot);
      if ((snapshot.remainingToday || 0) <= 0) {
        throw new TtsRequestError(429, "您今日的使用次数已达上限", "TTS_USAGE_LIMIT_REACHED");
      }

      const duplicate = await this.historyStore.findDuplicateForUser({
        userId,
        text: requestPayload.text,
        voice: requestPayload.voice,
        model: requestPayload.model,
        contentHash,
      });

      if (duplicate?.fileName) {
        return {
          requestPayload,
          ip: context.ip,
          fingerprint,
          userId,
          isAdmin,
          usageSummary,
          duplicateJobResult: {
            fileName: duplicate.fileName,
            audioUrl: duplicate.audioUrl,
            message: "检测到重复内容，已返回已有音频。",
            outputFormat: duplicate.outputFormat,
          },
        };
      }

      if (!context.taskId) {
        throw new TtsRequestError(500, "任务标识缺失", "TTS_TASK_ID_MISSING");
      }

      const reservation = await this.ledger.reserve(userId, context.taskId);
      if (!reservation.success) {
        throw new TtsRequestError(429, "您今日的使用次数已达上限", "TTS_USAGE_LIMIT_REACHED");
      }

      return {
        requestPayload,
        ip: context.ip,
        fingerprint,
        userId,
        isAdmin,
        usageSummary: this.buildUsageSummaryFromSnapshot(context.currentUser, reservation.snapshot),
      };
    }

    const duplicate = await this.historyStore.findDuplicateForAnonymous({
      ip: context.ip,
      fingerprint,
      text: requestPayload.text,
      contentHash,
    });
    if (duplicate) {
      throw new TtsRequestError(
        400,
        "您已经生成过相同的内容，请登录以获取更多使用次数",
        "TTS_DUPLICATE_ANONYMOUS_REQUEST",
      );
    }

    return {
      requestPayload,
      ip: context.ip,
      fingerprint,
      userId,
      isAdmin,
      usageSummary: this.buildUsageSummaryFromSnapshot(context.currentUser, null),
    };
  }
}
