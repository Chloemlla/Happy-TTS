import axios from "axios";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { mongoose } from "../services/mongoService";
import { config } from "../config/config";
import { ContentFilterService } from "../services/contentFilterService";
import { findDuplicateGeneration } from "../services/userGenerationService";
import { TurnstileService } from "../services/turnstileService";
import logger from "../utils/logger";
import { StorageManager } from "../utils/storage";
import { type User, UserStorage } from "../utils/userStorage";
import { TtsQueue } from "./tts.queue";
import { TtsService } from "./tts.service";
import { type TtsNextAction, ttsStorage } from "./tts.storage";

const TtsSettingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "GENERATION_CODE" },
    code: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "tts_settings" },
);

const TtsSettingModel = mongoose.models.TtsSetting || mongoose.model("TtsSetting", TtsSettingSchema);

async function getTtsGenerationCodeFromDb(): Promise<string | null> {
  try {
    const doc = (await TtsSettingModel.findOne({ key: "GENERATION_CODE" }).lean().exec()) as { code?: string } | null;
    return doc && typeof doc.code === "string" && doc.code.length > 0 ? doc.code : null;
  } catch {
    return null;
  }
}

export class TtsController {
  private static readonly ttsService = new TtsService();
  private static readonly ttsQueue = new TtsQueue({
    buildUsageSummary: (userId, isAdmin) => TtsController.buildUsageSummaryByUserId(userId, isAdmin),
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

  private static createRequestError(statusCode: number, message: string) {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = statusCode;
    return error;
  }

  private static async resolveCurrentUser(req: Request): Promise<User | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw TtsController.createRequestError(401, "登录状态已失效，请重新登录");
    }

    let decoded: jwt.JwtPayload | string;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch {
      throw TtsController.createRequestError(401, "登录状态已失效，请重新登录");
    }

    const userId =
      typeof decoded === "object" && decoded && "userId" in decoded
        ? String((decoded as jwt.JwtPayload & { userId?: string }).userId || "")
        : "";

    if (!userId) {
      throw TtsController.createRequestError(401, "登录状态已失效，请重新登录");
    }

    const user = await UserStorage.getUserById(userId);
    if (!user) {
      throw TtsController.createRequestError(401, "登录状态已失效，请重新登录");
    }

    if ((user as { accountStatus?: string }).accountStatus === "suspended") {
      throw TtsController.createRequestError(403, "账户已被封停");
    }

    return user;
  }

  private static buildUsageSummary(currentUser: User | null, remainingToday: number | null) {
    if (!currentUser) {
      return {
        authenticated: false,
        isAdmin: false,
        dailyLimit: null,
        usedToday: null,
        remainingToday: null,
      };
    }

    if (currentUser.role === "admin") {
      return {
        authenticated: true,
        isAdmin: true,
        dailyLimit: null,
        usedToday: null,
        remainingToday: null,
      };
    }

    const dailyLimit = UserStorage.getDailyLimit();
    const safeRemaining = remainingToday === null ? null : Math.max(0, remainingToday);

    return {
      authenticated: true,
      isAdmin: false,
      dailyLimit,
      usedToday: safeRemaining === null ? null : Math.max(0, dailyLimit - safeRemaining),
      remainingToday: safeRemaining,
    };
  }

  private static async buildUsageSummaryByUserId(userId?: string, isAdmin?: boolean) {
    if (!userId) {
      return TtsController.buildUsageSummary(null, null);
    }

    if (isAdmin) {
      return {
        authenticated: true,
        isAdmin: true,
        dailyLimit: null,
        usedToday: null,
        remainingToday: null,
      };
    }

    const user = await UserStorage.getUserById(userId);
    if (!user) {
      return TtsController.buildUsageSummary(null, null);
    }

    return TtsController.buildUsageSummary(user, await UserStorage.getRemainingUsage(userId));
  }

  private static buildNextAction(type: string, label: string, message: string): TtsNextAction {
    return { type, label, message };
  }

  private static resolveResponseOutputFormat(fileName: string | undefined, fallback: string) {
    const extension = fileName?.split(".").pop()?.toLowerCase();
    return extension && extension.length > 0 ? extension : fallback;
  }

  private static sendStructuredError(
    res: Response,
    statusCode: number,
    error: string,
    nextAction: TtsNextAction,
    usage?: Awaited<ReturnType<typeof TtsController.buildUsageSummaryByUserId>>,
  ) {
    return res.status(statusCode).json({
      success: false,
      error,
      nextAction,
      ...(usage ? { usage } : {}),
    });
  }

  private static buildRequestPayload(req: Request) {
    const { text, model, voice, outputFormat, output_format, speed } = req.body;
    const normalizedOutputFormat =
      typeof outputFormat === "string" && outputFormat.trim().length > 0
        ? outputFormat.trim()
        : typeof output_format === "string" && output_format.trim().length > 0
          ? output_format.trim()
          : "mp3";

    return {
      text,
      model,
      voice,
      outputFormat: normalizedOutputFormat,
      speed,
    };
  }

  private static async validateSubmission(req: Request, currentUser: User | null) {
    const { text, model, voice, outputFormat, speed } = TtsController.buildRequestPayload(req);
    const { fingerprint, generationCode, cfToken } = req.body;
    const ip = TtsController.getClientIp(req);
    const userId = currentUser?.id;
    const isAdmin = currentUser?.role === "admin";
    let usageSummary = await TtsController.buildUsageSummaryByUserId(userId, isAdmin);

    if (process.env.NODE_ENV !== "test") {
      logger.info("收到请求: POST /api/tts/jobs", { ip, headers: req.headers });
      logger.info("收到TTS任务提交", {
        ip,
        requestInfo: {
          model,
          voice,
          outputFormat,
          textLength: typeof text === "string" ? text.length : 0,
          userId,
        },
      });
    }

    if (!text) {
      throw TtsController.createRequestError(400, "文本内容不能为空");
    }

    if (!ContentFilterService.shouldSkipDetection()) {
      const contentFilterResult = await ContentFilterService.detectProhibitedContent(text);
      if (contentFilterResult.isProhibited) {
        throw TtsController.createRequestError(403, "内容包含违禁词，无法生成语音");
      }
    }

    const expectedCode = await getTtsGenerationCodeFromDb();
    if (!generationCode || !expectedCode || generationCode !== expectedCode) {
      throw TtsController.createRequestError(403, "生成码无效");
    }

    if (await TurnstileService.isEnabled()) {
      const cfVerified = await TurnstileService.verifyToken(cfToken, ip);
      if (!cfVerified) {
        throw TtsController.createRequestError(403, "人机验证失败，请重新验证");
      }
    }

    if (text.length > 4096) {
      throw TtsController.createRequestError(400, "文本长度不能超过4096个字符");
    }

    try {
      const detectResponse = await axios.get(`https://v2.xxapi.cn/api/detect?text=${encodeURIComponent(text)}`);
      if (detectResponse.data.is_prohibited) {
        throw TtsController.createRequestError(400, "文本包含违禁内容，请修改后重试");
      }
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        throw error;
      }
      logger.error("违禁词检测失败:", error);
      throw TtsController.createRequestError(500, "违禁词检测服务暂时不可用，请稍后重试");
    }

    if (userId && !isAdmin) {
      const remainingBefore = await UserStorage.getRemainingUsage(userId);
      usageSummary = TtsController.buildUsageSummary(currentUser, remainingBefore);
      if (remainingBefore <= 0) {
        throw TtsController.createRequestError(429, "您今日的使用次数已达上限");
      }
    } else if (!userId) {
      const isDuplicate = await StorageManager.checkDuplicate(ip, fingerprint || "unknown", text);
      if (isDuplicate) {
        throw TtsController.createRequestError(400, "您已经生成过相同的内容，请登录以获取更多使用次数");
      }
    }

    return {
      requestPayload: {
        text,
        model,
        voice,
        outputFormat: TtsController.ttsService.resolveOutputFormat(outputFormat),
        speed,
      },
      ip,
      fingerprint: fingerprint || "unknown",
      userId,
      isAdmin,
      usageSummary,
    };
  }

  public static async submitJob(req: Request, res: Response) {
    try {
      const currentUser = await TtsController.resolveCurrentUser(req);
      const { requestPayload, ip, fingerprint, userId, isAdmin, usageSummary } = await TtsController.validateSubmission(
        req,
        currentUser,
      );

      const taskId = ttsStorage.createTaskId();

      if (process.env.NODE_ENV === "test") {
        await ttsStorage.createJob({
          taskId,
          status: "completed",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          request: requestPayload,
          userId,
          isAdmin,
          ip,
          fingerprint,
          message: "测试环境 mock，不调用 OpenAI",
          usage: usageSummary,
          nextAction: TtsController.buildNextAction("play_or_download", "播放或下载音频", "测试音频已准备就绪，可直接播放或下载。"),
          result: {
            status: "generated",
            message: "测试环境 mock，不调用 OpenAI",
            fileName: "mock-audio.wav",
            audioUrl: "/mock/audio/path.wav",
            outputFormat: requestPayload.outputFormat,
            isDuplicate: false,
          },
        });

        return res.status(200).json({
          success: true,
          status: "completed",
          taskId,
          message: "任务已完成",
          usage: usageSummary,
          nextAction: TtsController.buildNextAction("play_or_download", "播放或下载音频", "测试音频已准备就绪，可直接播放或下载。"),
        });
      }

      if (userId && !isAdmin) {
        const contentHash = TtsController.ttsService.generateContentHash(
          requestPayload.text,
          requestPayload.voice,
          requestPayload.model,
        );
        const duplicate = await findDuplicateGeneration({
          userId,
          text: requestPayload.text,
          voice: requestPayload.voice,
          model: requestPayload.model,
          contentHash,
        });

        if (duplicate?.fileName) {
          const audioUrl = `${process.env.VITE_API_URL || process.env.BASE_URL || "https://api.951100.xyz"}/static/audio/${duplicate.fileName}`;

          await ttsStorage.createJob({
            taskId,
            status: "completed",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            request: requestPayload,
            userId,
            isAdmin,
            ip,
            fingerprint,
            message: "检测到重复内容，已返回已有音频。",
            usage: usageSummary,
            nextAction: TtsController.buildNextAction("reuse_existing_audio", "播放或下载音频", "已返回历史音频，可直接播放或下载。"),
            result: {
              status: "reused",
              message: "检测到重复内容，已返回已有音频。",
              fileName: duplicate.fileName,
              audioUrl,
              outputFormat: TtsController.resolveResponseOutputFormat(duplicate.fileName, requestPayload.outputFormat),
              isDuplicate: true,
            },
          });

          return res.status(200).json({
            success: true,
            status: "completed",
            taskId,
            message: "任务已完成",
            usage: usageSummary,
            nextAction: TtsController.buildNextAction("reuse_existing_audio", "播放或下载音频", "已返回历史音频，可直接播放或下载。"),
          });
        }
      }

      const job = {
        taskId,
        status: "queued" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        request: requestPayload,
        userId,
        isAdmin,
        ip,
        fingerprint,
        message: "任务已提交，等待处理",
        usage: usageSummary,
        nextAction: TtsController.buildNextAction("queued", "等待任务完成", "任务已进入队列，请稍后查询状态。"),
      };

      await TtsController.ttsQueue.enqueue(job);

      return res.status(202).json({
        success: true,
        status: "queued",
        taskId,
        queuePosition: ttsStorage.getQueuePosition(taskId),
        pollAfterMs: 1500,
        message: "任务已提交，等待处理",
        usage: usageSummary,
        nextAction: job.nextAction,
      });
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        const statusCode = Number((error as { statusCode: number }).statusCode) || 500;
        return TtsController.sendStructuredError(
          res,
          statusCode,
          error instanceof Error ? error.message : "任务提交失败",
          TtsController.buildNextAction("retry", "稍后重试", "请检查输入后重新提交。"),
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
    const taskId = req.params.taskId;
    const job = ttsStorage.getJob(taskId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "任务不存在",
      });
    }

    return res.json({
      success: true,
      taskId: job.taskId,
      status: job.status,
      message: job.message,
      error: job.error,
      resultReady: job.status === "completed",
      queuePosition: job.status === "queued" ? ttsStorage.getQueuePosition(job.taskId) : 0,
      usage: job.usage,
      nextAction: job.nextAction,
    });
  }

  public static async getJobResult(req: Request, res: Response) {
    const taskId = req.params.taskId;
    const job = ttsStorage.getJob(taskId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "任务不存在",
      });
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

    const { signContent } = require("../utils/sign");

    return res.json({
      success: true,
      taskId: job.taskId,
      status: job.result.status,
      message: job.result.message,
      audioUrl: job.result.audioUrl,
      fileName: job.result.fileName,
      signature: signContent(job.result.audioUrl),
      isDuplicate: job.result.isDuplicate,
      outputFormat: job.result.outputFormat,
      usage: job.usage,
      nextAction: job.nextAction,
    });
  }

  public static async getRecentGenerations(req: Request, res: Response) {
    try {
      const ip = TtsController.getClientIp(req);
      const fingerprint = (req.query.fingerprint as string) || "unknown";
      const userId = req.headers["x-user-id"] as string;

      logger.info("获取历史记录", {
        ip,
        fingerprint,
        userId,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      });

      const records = await StorageManager.getRecentRecords(ip, fingerprint);
      res.json(records);
    } catch (error) {
      logger.error("获取生成历史失败:", error);
      res.status(500).json({ error: "获取生成历史失败" });
    }
  }
}
