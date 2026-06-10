import crypto from "node:crypto";
import { ContentFilterService, type ContentFilterResult } from "../services/contentFilterService";
import { AuditLogService } from "../services/auditLogService";
import {
  CURRENT_POLICY_VERSION,
  hasValidPolicyConsent,
  shouldRequireTtsPolicyConsent,
} from "../services/policyConsentService";
import { TurnstileService } from "../services/turnstileService";
import type { User } from "../utils/userStorage";
import { UserStorage } from "../utils/userStorage";
import { TtsRequestError } from "./tts.errors";
import { generationHistoryStore } from "./tts.history";
import type { GenerationHistoryStore, QuotaLedger, TtsSettingsStore, TtsUsageSnapshot } from "./tts.ports";
import { quotaLedger } from "./tts.quota";
import { ttsSettingsStore } from "./tts.settings";
import type { TtsGovernanceSummary, TtsJobRequestPayload, TtsUsageSummary } from "./tts.storage";
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
  requestId?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  authenticatedByApiKey?: boolean;
}

export interface TtsSubmissionResult {
  requestPayload: TtsJobRequestPayload;
  ip: string;
  fingerprint: string;
  userId?: string;
  isAdmin?: boolean;
  usageSummary: TtsUsageSummary;
  governance: TtsGovernanceSummary;
  duplicateJobResult?: {
    fileName: string;
    audioUrl: string;
    audioFileId?: string;
    audioStorage?: "file" | "mongo";
    audioMimeType?: string;
    audioSize?: number;
    message: string;
    outputFormat: string;
    provider?: string;
    providerModel?: string;
    providerVoice?: string;
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

  private validateContentShape(text: string) {
    if (!text) {
      throw new TtsRequestError(400, "文本内容不能为空", "TTS_EMPTY_TEXT");
    }

    if (text.length > 4096) {
      throw new TtsRequestError(400, "文本长度不能超过4096个字符", "TTS_TEXT_TOO_LONG");
    }
  }

  private hashText(text: string): string {
    return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
  }

  private buildContentSafetySummary(result: ContentFilterResult): NonNullable<TtsGovernanceSummary["contentSafety"]> {
    return {
      decision: result.decision,
      confidence: result.confidence,
      categories: result.categories,
      source: result.source,
      remoteChecked: result.remoteChecked,
      remoteUnavailable: result.remoteUnavailable,
    };
  }

  private async auditGovernanceEvent(params: {
    context: TtsSubmissionContext;
    action: string;
    result: "success" | "failure";
    errorMessage?: string;
    detail: Record<string, unknown>;
  }) {
    const user = params.context.currentUser;
    await AuditLogService.log({
      requestId: params.context.requestId,
      userId: user?.id || "anonymous",
      username: user?.username || "anonymous",
      role: user?.role || "anonymous",
      action: params.action,
      module: "tts",
      result: params.result,
      errorMessage: params.errorMessage,
      detail: params.detail,
      ip: params.context.ip,
      userAgent: params.context.userAgent,
      path: params.context.path,
      method: params.context.method,
    });
  }

  private async validatePolicyConsent(context: TtsSubmissionContext, fingerprint: string) {
    if (!shouldRequireTtsPolicyConsent()) {
      return;
    }

    if (context.currentUser?.role === "admin") {
      return;
    }

    const hasConsent = await hasValidPolicyConsent(fingerprint, CURRENT_POLICY_VERSION);
    if (hasConsent) {
      return;
    }

    await this.auditGovernanceEvent({
      context,
      action: "tts.policy.consent_required",
      result: "failure",
      errorMessage: "Missing current policy consent",
      detail: {
        policyVersion: CURRENT_POLICY_VERSION,
        fingerprintHash: this.hashText(fingerprint),
      },
    });

    throw new TtsRequestError(
      403,
      "请先确认最新服务条款与隐私政策后再生成语音",
      "TTS_POLICY_CONSENT_REQUIRED",
    );
  }

  private async validateContentPolicy(
    text: string,
    context: TtsSubmissionContext,
  ): Promise<NonNullable<TtsGovernanceSummary["contentSafety"]>> {
    if (ContentFilterService.shouldSkipDetection()) {
      return {
        decision: "allow",
        confidence: 0,
        categories: [],
        source: "skipped",
        remoteChecked: false,
      };
    }

    const contentFilterResult = await ContentFilterService.detectProhibitedContent(text);
    if (contentFilterResult.error) {
      await this.auditGovernanceEvent({
        context,
        action: "tts.content_filter.unavailable",
        result: "failure",
        errorMessage: contentFilterResult.error,
        detail: {
          textHash: this.hashText(text),
          textLength: text.length,
          categories: contentFilterResult.categories,
          confidence: contentFilterResult.confidence,
          remoteUnavailable: contentFilterResult.remoteUnavailable,
          remoteError: contentFilterResult.remoteError,
        },
      });
      throw new TtsRequestError(500, contentFilterResult.error, "TTS_REMOTE_FILTER_UNAVAILABLE", true);
    }
    if (contentFilterResult.isProhibited) {
      await this.auditGovernanceEvent({
        context,
        action: "tts.content_filter.block",
        result: "failure",
        errorMessage: "Content safety policy blocked generation",
        detail: {
          textHash: this.hashText(text),
          textLength: text.length,
          decision: contentFilterResult.decision,
          categories: contentFilterResult.categories,
          confidence: contentFilterResult.confidence,
          source: contentFilterResult.source,
          findings: contentFilterResult.findings.map((finding) => ({
            source: finding.source,
            category: finding.category,
            severity: finding.severity,
            ruleId: finding.ruleId,
            variantHash: finding.variantHash,
          })),
        },
      });
      throw new TtsRequestError(403, "内容包含违禁词，无法生成语音", "TTS_CONTENT_PROHIBITED");
    }

    if (contentFilterResult.decision === "review") {
      await this.auditGovernanceEvent({
        context,
        action: "tts.content_filter.review",
        result: "success",
        detail: {
          textHash: this.hashText(text),
          textLength: text.length,
          categories: contentFilterResult.categories,
          confidence: contentFilterResult.confidence,
          source: contentFilterResult.source,
        },
      });
    }

    return this.buildContentSafetySummary(contentFilterResult);
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

    this.validateContentShape(requestPayload.text);
    if (!context.authenticatedByApiKey) {
      await this.validateGenerationCode(context.input.generationCode);
      await this.validateTurnstile(context.input.cfToken, context.ip);
    }

    if (!userId && fingerprint === "unknown") {
      throw new TtsRequestError(400, "匿名生成需要设备指纹", "TTS_FINGERPRINT_REQUIRED");
    }

    await this.validatePolicyConsent(context, fingerprint);
    const contentSafety = await this.validateContentPolicy(requestPayload.text, context);
    const governance: TtsGovernanceSummary = {
      policyVersion: CURRENT_POLICY_VERSION,
      contentSafety,
    };

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
          governance,
          duplicateJobResult: {
            fileName: duplicate.fileName,
            audioUrl: this.ttsService.buildAudioUrl(duplicate.fileName),
            audioFileId: duplicate.audioFileId,
            audioStorage: duplicate.audioStorage,
            audioMimeType: duplicate.audioMimeType,
            audioSize: duplicate.audioSize,
            message: "检测到重复内容，已返回已有音频。",
            outputFormat: duplicate.outputFormat,
            provider: duplicate.provider,
            providerModel: duplicate.providerModel,
            providerVoice: duplicate.providerVoice,
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
        governance,
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
      governance,
    };
  }
}
