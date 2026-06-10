import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";
import { TtsRequestError } from "./tts.errors";
import { generationHistoryStore, redactTtsTextForStorage } from "./tts.history";
import type { TtsHistoryRecord, TtsHistoryReviewStatus } from "./tts.ports";
import { TtsSubmissionPipeline } from "./tts.pipeline";
import { TtsQueue } from "./tts.queue";
import { ttsAssetAccessService } from "./tts.assetAccess";
import { type TtsNextAction, ttsStorage } from "./tts.storage";
import { signContent } from "../utils/sign";

export class TtsController {
  private static readonly submissionPipeline = new TtsSubmissionPipeline();
  private static readonly ttsQueue = new TtsQueue({
    buildUsageSummary: (userId, isAdmin) => TtsController.submissionPipeline.buildUsageSummaryByUserId(userId, isAdmin),
    buildNextAction: (type, label, message) => TtsController.buildNextAction(type, label, message),
  });

  private static getClientIp(req: Request): string {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      (req.headers["x-real-ip"] as string) ||
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      "unknown";

    return ip.replace(/^::ffff:/, "");
  }

  private static async resolveCurrentUser(req: Request): Promise<User | null> {
    const apiCredentialUser = ((req as any).apiKey || (req as any).oauthToken) && (req as any).user;
    if (apiCredentialUser?.id) {
      const user = await UserStorage.getUserById(apiCredentialUser.id);
      if (!user) {
        throw new TtsRequestError(401, "API 凭据所属用户不存在", "TTS_API_CREDENTIAL_USER_NOT_FOUND");
      }
      if ((user as { accountStatus?: string }).accountStatus === "suspended") {
        throw new TtsRequestError(403, "账户已被封停", "TTS_ACCOUNT_SUSPENDED");
      }
      return user;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new TtsRequestError(401, "登录状态已失效，请重新登录", "TTS_AUTH_MISSING");
    }

    let decoded: jwt.JwtPayload | string;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new TtsRequestError(401, "登录状态已失效，请重新登录", "TTS_AUTH_INVALID");
    }

    const userId =
      typeof decoded === "object" && decoded && "userId" in decoded
        ? String((decoded as jwt.JwtPayload & { userId?: string }).userId || "")
        : "";

    if (!userId) {
      throw new TtsRequestError(401, "登录状态已失效，请重新登录", "TTS_AUTH_INVALID");
    }

    const user = await UserStorage.getUserById(userId);
    if (!user) {
      throw new TtsRequestError(401, "登录状态已失效，请重新登录", "TTS_AUTH_INVALID");
    }

    if ((user as { accountStatus?: string }).accountStatus === "suspended") {
      throw new TtsRequestError(403, "账户已被封停", "TTS_ACCOUNT_SUSPENDED");
    }

    return user;
  }

  private static buildNextAction(type: string, label: string, message: string): TtsNextAction {
    return { type, label, message };
  }

  private static getTaskIdParam(req: Request): string {
    const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
    return taskId || "";
  }

  private static getRequestFingerprint(req: Request): string {
    const queryFingerprint = Array.isArray(req.query.fingerprint)
      ? req.query.fingerprint[0]
      : req.query.fingerprint;
    const headerFingerprint = req.headers["x-fingerprint"];
    const bodyFingerprint = req.body?.fingerprint;
    const fingerprint =
      (typeof queryFingerprint === "string" && queryFingerprint) ||
      (typeof headerFingerprint === "string" && headerFingerprint) ||
      (typeof bodyFingerprint === "string" && bodyFingerprint) ||
      "";
    return fingerprint.trim();
  }

  private static parsePositiveInt(value: unknown, fallback: number, max: number): number {
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.min(max, Math.floor(parsed)));
  }

  private static parseReviewStatus(value: unknown): TtsHistoryReviewStatus | "all" | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw !== "string") {
      return undefined;
    }

    if (raw === "all") {
      return "all";
    }

    const allowed: TtsHistoryReviewStatus[] = ["none", "needs_review", "in_review", "fixed", "dismissed"];
    return allowed.includes(raw as TtsHistoryReviewStatus) ? (raw as TtsHistoryReviewStatus) : undefined;
  }

  private static stringifyQueryValue(value: unknown): string | undefined {
    const raw = Array.isArray(value) ? value[0] : value;
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  }

  private static serializeHistoryRecord(record: TtsHistoryRecord) {
    let audioUrl = "";
    let signature = "";

    try {
      audioUrl = ttsAssetAccessService.buildAccessUrl({
        fileName: record.fileName,
        userId: record.userId,
        fingerprint: record.fingerprint,
        allowDownload: process.env.TTS_DOWNLOADS_ENABLED !== "false",
        allowShare: process.env.TTS_ASSET_SHARE_ENABLED === "true",
      });
      signature = signContent(audioUrl);
    } catch (error) {
      logger.warn("构建 TTS 历史音频访问地址失败", {
        recordId: record.id,
        fileName: record.fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      ...record,
      text: record.text || "",
      audioUrl,
      signature,
      permissions: {
        canDownload: process.env.TTS_DOWNLOADS_ENABLED !== "false",
        canShare: process.env.TTS_ASSET_SHARE_ENABLED === "true",
      },
    };
  }

  private static async assertCanAccessJob(req: Request, job: Awaited<ReturnType<typeof ttsStorage.getJob>>) {
    if (!job) {
      return;
    }

    const currentUser = await TtsController.resolveCurrentUser(req);
    if (job.userId) {
      if (!currentUser) {
        throw new TtsRequestError(401, "请登录后查询该任务", "TTS_JOB_AUTH_REQUIRED");
      }
      if (currentUser.role !== "admin" && currentUser.id !== job.userId) {
        throw new TtsRequestError(403, "无权访问该任务", "TTS_JOB_FORBIDDEN");
      }
      return;
    }

    if (currentUser?.role === "admin") {
      return;
    }

    const fingerprint = TtsController.getRequestFingerprint(req);
    const ip = TtsController.getClientIp(req);
    if (!fingerprint || fingerprint === "unknown" || !job.fingerprint || job.fingerprint === "unknown") {
      throw new TtsRequestError(403, "匿名任务需要提供设备指纹", "TTS_JOB_FINGERPRINT_REQUIRED");
    }
    if (job.ip !== ip || job.fingerprint !== fingerprint) {
      throw new TtsRequestError(403, "无权访问该任务", "TTS_JOB_FORBIDDEN");
    }
  }

  private static sendStructuredError(
    res: Response,
    statusCode: number,
    error: string,
    nextAction: TtsNextAction,
    usage?: Awaited<ReturnType<typeof TtsController.submissionPipeline.buildUsageSummaryByUserId>>,
    code?: string,
  ) {
    return res.status(statusCode).json({
      success: false,
      error,
      code,
      nextAction,
      ...(usage ? { usage } : {}),
    });
  }

  public static async submitJob(req: Request, res: Response) {
    const taskId = ttsStorage.createTaskId();

    try {
      const currentUser = await TtsController.resolveCurrentUser(req);
      const ip = TtsController.getClientIp(req);

      if (process.env.NODE_ENV !== "test") {
        logger.info("收到 TTS 任务提交", {
          ip,
          model: req.body?.model,
          voice: req.body?.voice,
          outputFormat: req.body?.outputFormat || req.body?.output_format,
          textLength: typeof req.body?.text === "string" ? req.body.text.length : 0,
          userId: currentUser?.id,
        });
      }

      const submission = await TtsController.submissionPipeline.validateAndBuild({
        input: req.body,
        ip,
        currentUser,
        taskId,
        requestId: (req as any).requestId,
        userAgent: req.headers["user-agent"],
        path: req.originalUrl || req.path,
        method: req.method,
        authenticatedByApiKey: Boolean((req as any).apiKey || (req as any).oauthToken),
      });

      const createdAt = new Date().toISOString();

      if (process.env.NODE_ENV === "test") {
        await ttsStorage.createJob({
          taskId,
          status: "completed",
          createdAt,
          updatedAt: createdAt,
          request: {
            ...submission.requestPayload,
            text: redactTtsTextForStorage(submission.requestPayload.text),
          },
          userId: submission.userId,
          isAdmin: submission.isAdmin,
          ip: submission.ip,
          fingerprint: submission.fingerprint,
          message: "测试环境 mock，不调用 OpenAI",
          usage: submission.usageSummary,
          governance: submission.governance,
          nextAction: TtsController.buildNextAction("play_or_download", "播放或下载音频", "测试音频已准备就绪，可直接播放或下载。"),
          result: {
            text: submission.requestPayload.text,
            status: "generated",
            message: "测试环境 mock，不调用 OpenAI",
            fileName: "mock-audio.wav",
            audioUrl: "/mock/audio/path.wav",
            audioStorage: "file",
            audioMimeType: "audio/wav",
            audioSize: 0,
            outputFormat: submission.requestPayload.outputFormat,
            isDuplicate: false,
          },
        });

        return res.status(200).json({
          success: true,
          status: "completed",
          taskId,
          message: "任务已完成",
          usage: submission.usageSummary,
          nextAction: TtsController.buildNextAction("play_or_download", "播放或下载音频", "测试音频已准备就绪，可直接播放或下载。"),
        });
      }

      if (submission.duplicateJobResult) {
        await ttsStorage.createJob({
          taskId,
          status: "completed",
          createdAt,
          updatedAt: createdAt,
          request: {
            ...submission.requestPayload,
            text: redactTtsTextForStorage(submission.requestPayload.text),
          },
          userId: submission.userId,
          isAdmin: submission.isAdmin,
          ip: submission.ip,
          fingerprint: submission.fingerprint,
          message: submission.duplicateJobResult.message,
          usage: submission.usageSummary,
          governance: submission.governance,
          nextAction: TtsController.buildNextAction(
            "reuse_existing_audio",
            "播放或下载音频",
            "已返回历史音频，可直接播放或下载。",
          ),
          result: {
            text: submission.requestPayload.text,
            status: "reused",
            message: submission.duplicateJobResult.message,
            fileName: submission.duplicateJobResult.fileName,
            audioUrl: submission.duplicateJobResult.audioUrl,
            audioFileId: submission.duplicateJobResult.audioFileId,
            audioStorage: submission.duplicateJobResult.audioStorage,
            audioMimeType: submission.duplicateJobResult.audioMimeType,
            audioSize: submission.duplicateJobResult.audioSize,
            outputFormat: submission.duplicateJobResult.outputFormat,
            provider: submission.duplicateJobResult.provider,
            providerModel: submission.duplicateJobResult.providerModel,
            providerVoice: submission.duplicateJobResult.providerVoice,
            isDuplicate: true,
          },
        });

        return res.status(200).json({
          success: true,
          status: "completed",
          taskId,
          message: "任务已完成",
          usage: submission.usageSummary,
          nextAction: TtsController.buildNextAction(
            "reuse_existing_audio",
            "播放或下载音频",
            "已返回历史音频，可直接播放或下载。",
          ),
        });
      }

      const job = {
        taskId,
        status: "queued" as const,
        createdAt,
        updatedAt: createdAt,
        request: submission.requestPayload,
        userId: submission.userId,
        isAdmin: submission.isAdmin,
        ip: submission.ip,
        fingerprint: submission.fingerprint,
        governance: submission.governance,
        message: "任务已提交，等待处理",
        usage: submission.usageSummary,
        nextAction: TtsController.buildNextAction("queued", "等待任务完成", "任务已进入队列，请稍后查询状态。"),
      };

      await TtsController.ttsQueue.enqueue(job);

      return res.status(202).json({
        success: true,
        status: "queued",
        taskId,
        queuePosition: await ttsStorage.getQueuePosition(taskId),
        pollAfterMs: 1500,
        message: "任务已提交，等待处理",
        usage: submission.usageSummary,
        nextAction: job.nextAction,
      });
    } catch (error) {
      if (error instanceof TtsRequestError) {
        return TtsController.sendStructuredError(
          res,
          error.statusCode,
          error.message,
          TtsController.buildNextAction("retry", "稍后重试", "请检查输入后重新提交。"),
          undefined,
          error.code,
        );
      }

      logger.error("提交 TTS 任务失败:", error);
      return TtsController.sendStructuredError(
        res,
        500,
        "任务提交失败",
        TtsController.buildNextAction("retry", "稍后重试", "任务提交失败，请稍后重试。"),
      );
    }
  }

  public static async getJobStatus(req: Request, res: Response) {
    const taskId = TtsController.getTaskIdParam(req);
    const job = await ttsStorage.getJob(taskId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "任务不存在",
      });
    }

    try {
      await TtsController.assertCanAccessJob(req, job);
    } catch (error) {
      if (error instanceof TtsRequestError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }

    return res.json({
      success: true,
      taskId: job.taskId,
      status: job.status,
      message: job.message,
      error: job.error,
      resultReady: job.status === "completed",
      queuePosition: job.status === "queued" ? await ttsStorage.getQueuePosition(job.taskId) : 0,
      usage: job.usage,
      nextAction: job.nextAction,
    });
  }

  public static async getJobResult(req: Request, res: Response) {
    const taskId = TtsController.getTaskIdParam(req);
    const job = await ttsStorage.getJob(taskId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "任务不存在",
      });
    }

    try {
      await TtsController.assertCanAccessJob(req, job);
    } catch (error) {
      if (error instanceof TtsRequestError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }

    if (job.status === "failed") {
      return TtsController.sendStructuredError(
        res,
        409,
        job.error || "生成语音失败",
        job.nextAction || TtsController.buildNextAction("retry", "稍后重试", "生成失败，请稍后重试。"),
        job.usage,
      );
    }

    if (job.status !== "completed" || !job.result) {
      return res.status(202).json({
        success: true,
        taskId: job.taskId,
        status: job.status,
        message: job.message,
        resultReady: false,
      });
    }

    const audioUrl = ttsAssetAccessService.buildAccessUrl({
      fileName: job.result.fileName,
      taskId: job.taskId,
      userId: job.userId,
      fingerprint: job.fingerprint,
      allowDownload: job.result.permissions?.canDownload,
      allowShare: job.result.permissions?.canShare,
      watermarkId: job.result.watermark?.id,
      policyVersion: job.governance?.policyVersion || job.result.watermark?.policyVersion,
    });

    return res.json({
      success: true,
      taskId: job.taskId,
      status: job.result.status,
      message: job.result.message,
      text: job.result.text || job.request.text,
      audioUrl,
      fileName: job.result.fileName,
      audioFileId: job.result.audioFileId,
      audioStorage: job.result.audioStorage,
      audioMimeType: job.result.audioMimeType,
      audioSize: job.result.audioSize,
      signature: signContent(audioUrl),
      isDuplicate: job.result.isDuplicate,
      outputFormat: job.result.outputFormat,
      watermark: job.result.watermark,
      permissions: job.result.permissions,
      governance: job.governance,
      usage: job.usage,
      nextAction: job.nextAction,
    });
  }

  public static async getAudioAsset(req: Request, res: Response) {
    const fileName = Array.isArray(req.params.fileName) ? req.params.fileName[0] : req.params.fileName;
    const accessToken = Array.isArray(req.query.accessToken) ? req.query.accessToken[0] : req.query.accessToken;
    const downloadValue = Array.isArray(req.query.download) ? req.query.download[0] : req.query.download;
    const download = downloadValue === "1" || downloadValue === "true";

    if (!fileName || typeof accessToken !== "string") {
      return res.status(403).json({
        success: false,
        error: "Audio access token is required",
        code: "TTS_ASSET_TOKEN_REQUIRED",
      });
    }

    await ttsAssetAccessService.serveAsset({
      req,
      res,
      fileName,
      accessToken,
      download,
    });
  }

  public static async getRecentGenerations(req: Request, res: Response) {
    try {
      const ip = TtsController.getClientIp(req);
      const fingerprint = (req.query.fingerprint as string) || "unknown";
      const currentUser = await TtsController.resolveCurrentUser(req);
      const limit = TtsController.parsePositiveInt(req.query.limit, 10, 50);

      logger.info("获取历史记录", {
        ip,
        fingerprint,
        userId: currentUser?.id,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      });

      const records = await generationHistoryStore.getRecentRecords({
        userId: currentUser?.id,
        ip,
        fingerprint,
        limit,
      });
      res.json(records.map((record) => TtsController.serializeHistoryRecord(record)));
    } catch (error) {
      if (error instanceof TtsRequestError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }

      logger.error("获取生成历史失败:", error);
      return res.status(500).json({ error: "获取生成历史失败" });
    }
  }

  public static async getAllGenerations(req: Request, res: Response) {
    try {
      const page = TtsController.parsePositiveInt(req.query.page, 1, 10000);
      const limit = TtsController.parsePositiveInt(req.query.limit, 20, 100);
      const scope = TtsController.stringifyQueryValue(req.query.scope);
      const result = await generationHistoryStore.getAllRecords({
        page,
        limit,
        userId: TtsController.stringifyQueryValue(req.query.userId),
        scope: scope === "user" || scope === "anonymous" ? scope : undefined,
        reviewStatus: TtsController.parseReviewStatus(req.query.reviewStatus),
        q: TtsController.stringifyQueryValue(req.query.q),
      });

      res.json({
        ...result,
        records: result.records.map((record) => TtsController.serializeHistoryRecord(record)),
      });
    } catch (error) {
      logger.error("获取全部 TTS 生成历史失败:", error);
      res.status(500).json({ error: "获取全部 TTS 生成历史失败" });
    }
  }

  public static async updateGenerationReview(req: Request, res: Response) {
    try {
      const recordId = Array.isArray(req.params.recordId) ? req.params.recordId[0] : req.params.recordId;
      const parsedReviewStatus = TtsController.parseReviewStatus(req.body?.reviewStatus);

      if (req.body?.reviewStatus !== undefined && (parsedReviewStatus === undefined || parsedReviewStatus === "all")) {
        return res.status(400).json({
          success: false,
          error: "审核状态无效",
        });
      }

      const reviewStatus = parsedReviewStatus && parsedReviewStatus !== "all" ? parsedReviewStatus : undefined;
      const admin = (req as any).user;
      const record = await generationHistoryStore.updateAdminReview(recordId, {
        adminNote: req.body?.adminNote,
        adminSuggestion: req.body?.adminSuggestion,
        reviewStatus,
        reviewedBy: admin?.username || admin?.id || "admin",
      });

      if (!record) {
        return res.status(404).json({
          success: false,
          error: "生成记录不存在",
        });
      }

      return res.json({
        success: true,
        record: TtsController.serializeHistoryRecord(record),
      });
    } catch (error) {
      logger.error("更新 TTS 生成历史人工审核信息失败:", error);
      return res.status(500).json({
        success: false,
        error: "更新生成记录失败",
      });
    }
  }
}
