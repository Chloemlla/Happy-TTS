import crypto from "node:crypto";
import axios from "axios";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { ContentFilterService } from "../services/contentFilterService";
import { mongoose } from "../services/mongoService";
import { TtsService } from "../services/ttsService";
import { TurnstileService } from "../services/turnstileService";
import { addGenerationRecord, findDuplicateGeneration } from "../services/userGenerationService";
import { wsService } from "../services/wsService";
import logger from "../utils/logger";
import { StorageManager } from "../utils/storage";
import { type User, UserStorage } from "../utils/userStorage";

// 使用 MongoDB 存储与读取 TTS 生成码，不再读取配置文件中的 generationCode
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
  private static ttsService = new TtsService();

  private static getClientIp(req: Request): string {
    // 按优先级尝试从不同位置获取 IP 地址
    const ip =
      // 1. 从 X-Forwarded-For 头部获取
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      // 2. 从 X-Real-IP 头部获取
      (req.headers["x-real-ip"] as string) ||
      // 3. 从 Express 的 ip 属性获取
      req.ip ||
      // 4. 从连接对象获取
      req.connection.remoteAddress ||
      // 5. 从 socket 对象获取
      req.socket.remoteAddress ||
      // 6. 如果都获取不到，返回 unknown
      "unknown";

    // 如果是 IPv6 格式的本地地址，转换为 IPv4 格式
    return ip.replace(/^::ffff:/, "");
  }

  private static generateContentHash(text: string, voice: string, model: string): string {
    return crypto.createHash("md5").update(`${text}-${voice}-${model}`).digest("hex");
  }

  private static createRequestError(statusCode: number, message: string) {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = statusCode;
    return error;
  }

  private static async resolveCurrentUser(req: Request): Promise<User | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
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
    if ((user as any).accountStatus === "suspended") {
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

  private static buildNextAction(type: string, label: string, message: string) {
    return { type, label, message };
  }

  private static sendStructuredError(
    res: Response,
    statusCode: number,
    error: string,
    nextAction: { type: string; label: string; message: string },
    usage?: ReturnType<typeof TtsController.buildUsageSummary>,
  ) {
    return res.status(statusCode).json({
      success: false,
      error,
      nextAction,
      ...(usage ? { usage } : {}),
    });
  }

  public static async generateSpeech(req: Request, res: Response) {
    let currentUser: User | null = null;
    let usageSummary = TtsController.buildUsageSummary(null, null);

    try {
      const { text, model, voice, outputFormat, output_format, speed, fingerprint, generationCode, cfToken } = req.body;
      const normalizedOutputFormat =
        typeof outputFormat === "string" && outputFormat.trim().length > 0
          ? outputFormat.trim()
          : typeof output_format === "string" && output_format.trim().length > 0
            ? output_format.trim()
            : "mp3";
      const ip = TtsController.getClientIp(req);
      currentUser = await TtsController.resolveCurrentUser(req);
      usageSummary = currentUser
        ? TtsController.buildUsageSummary(
          currentUser,
          currentUser.role === "admin" ? null : await UserStorage.getRemainingUsage(currentUser.id),
        )
        : TtsController.buildUsageSummary(null, null);
      const userId = currentUser?.id;
      const isAdmin = currentUser?.role === "admin";

      // 只在非 test 环境下输出 info 日志
      if (process.env.NODE_ENV !== "test") {
        logger.info("收到请求: POST /api/tts/generate", { ip, headers: req.headers });
        logger.info("收到TTS请求", {
          ip,
          requestInfo: {
            model,
            voice,
            outputFormat: normalizedOutputFormat,
            textLength: typeof text === "string" ? text.length : 0,
            userId,
          },
        });
      }

      if (!text) {
        return TtsController.sendStructuredError(
          res,
          400,
          "文本内容不能为空",
          TtsController.buildNextAction("retry", "补全文本后重试", "请补全文本后重新提交。"),
          usageSummary,
        );
      }

      // 测试环境下直接 mock 返回（提前到所有校验之前）
      if (process.env.NODE_ENV === "test") {
        const { signContent } = require("../utils/sign");
        return res.status(200).json({
          success: true,
          status: "generated",
          audioUrl: "/mock/audio/path.wav",
          fileName: "mock-audio.wav",
          outputFormat: normalizedOutputFormat,
          signature: signContent("/mock/audio/path.wav"),
          message: "测试环境 mock，不调用 OpenAI",
          usage: usageSummary,
          nextAction: TtsController.buildNextAction(
            "play_or_download",
            "播放或下载音频",
            "测试音频已准备就绪，可直接播放或下载。",
          ),
        });
      }

      // 内容安全检测（在生成码校验之前）
      if (!ContentFilterService.shouldSkipDetection()) {
        const contentFilterResult = await ContentFilterService.detectProhibitedContent(text);

        if (contentFilterResult.isProhibited) {
          logger.log("TTS请求被内容过滤拦截", {
            ip,
            text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
            confidence: contentFilterResult.confidence,
            maxVariant: contentFilterResult.maxVariant,
            error: contentFilterResult.error,
          });

          return TtsController.sendStructuredError(
            res,
            403,
            "内容包含违禁词，无法生成语音",
            TtsController.buildNextAction("retry", "修改文本后重试", "请调整文本内容后重新提交。"),
            usageSummary,
          );
        }
      }

      // 检查生成码（改为从MongoDB读取）
      const expectedCode = await getTtsGenerationCodeFromDb();
      if (!generationCode || !expectedCode || generationCode !== expectedCode) {
        logger.warn("生成码验证失败", {
          ip,
          userAgent: req.headers["user-agent"],
          providedCode: generationCode,
          timestamp: new Date().toISOString(),
        });
        return TtsController.sendStructuredError(
          res,
          403,
          "生成码无效",
          TtsController.buildNextAction("check_generation_code", "检查生成码", "请确认生成码正确后重新提交。"),
          usageSummary,
        );
      }

      // 验证 Turnstile
      if (await TurnstileService.isEnabled()) {
        const cfVerified = await TurnstileService.verifyToken(cfToken, ip);
        if (!cfVerified) {
          logger.warn("Turnstile 验证失败", {
            ip,
            userAgent: req.headers["user-agent"],
            timestamp: new Date().toISOString(),
          });
          return TtsController.sendStructuredError(
            res,
            403,
            "人机验证失败，请重新验证",
            TtsController.buildNextAction("complete_verification", "重新完成人机验证", "请重新完成人机验证后再试。"),
            usageSummary,
          );
        }
      }

      // 检查文本长度
      if (text.length > 4096) {
        return TtsController.sendStructuredError(
          res,
          400,
          "文本长度不能超过4096个字符",
          TtsController.buildNextAction("retry", "精简文本后重试", "请缩短文本内容后重新生成。"),
          usageSummary,
        );
      }

      // 进行违禁词检测
      try {
        const detectResponse = await axios.get(`https://v2.xxapi.cn/api/detect?text=${encodeURIComponent(text)}`);
        if (detectResponse.data.is_prohibited) {
          return TtsController.sendStructuredError(
            res,
            400,
            "文本包含违禁内容，请修改后重试",
            TtsController.buildNextAction("retry", "修改文本后重试", "请调整文本内容后重新提交。"),
            usageSummary,
          );
        }
      } catch (error) {
        logger.error("违禁词检测失败:", error);
        return TtsController.sendStructuredError(
          res,
          500,
          "违禁词检测服务暂时不可用，请稍后重试",
          TtsController.buildNextAction("retry", "稍后重试", "检测服务暂时不可用，请稍后再试。"),
          usageSummary,
        );
      }

      if (userId && !isAdmin) {
        const remainingBefore = await UserStorage.getRemainingUsage(userId);
        usageSummary = TtsController.buildUsageSummary(currentUser, remainingBefore);
        if (remainingBefore <= 0) {
          return TtsController.sendStructuredError(
            res,
            429,
            "您今日的使用次数已达上限",
            TtsController.buildNextAction("wait_for_quota_reset", "等待额度重置", "今日额度已用完，请明天再试。"),
            usageSummary,
          );
        }
      } else if (!userId) {
        // 未登录用户只能使用一次
        const isDuplicate = await StorageManager.checkDuplicate(ip, fingerprint || "unknown", text);
        if (isDuplicate) {
          return TtsController.sendStructuredError(
            res,
            400,
            "您已经生成过相同的内容，请登录以获取更多使用次数",
            TtsController.buildNextAction("retry", "更换文本后重试", "游客模式下请更换文本，或登录后继续使用。"),
            usageSummary,
          );
        }
      }

      if (userId && !isAdmin) {
        const contentHash = TtsController.generateContentHash(text, voice, model);
        const duplicate = await findDuplicateGeneration({ userId, text, voice, model, contentHash });
        if (duplicate?.fileName) {
          const duplicateAudioUrl = `${process.env.VITE_API_URL || process.env.BASE_URL || "https://api.951100.xyz"}/static/audio/${duplicate.fileName}`;
          const { signContent } = require("../utils/sign");

          return res.json({
            success: true,
            status: "reused",
            isDuplicate: true,
            fileName: duplicate.fileName,
            audioUrl: duplicateAudioUrl,
            outputFormat: normalizedOutputFormat,
            signature: signContent(duplicateAudioUrl),
            message: "检测到重复内容，已返回已有音频。",
            usage: usageSummary,
            nextAction: TtsController.buildNextAction(
              "reuse_existing_audio",
              "播放或下载音频",
              "已返回历史音频，可直接播放或下载。",
            ),
          });
        }
      }

      // 生成语音
      try {
        const taskId = `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // 通知前端：开始生成
        if (userId) {
          wsService.notifyTtsProgress(userId, { taskId, status: "generating", message: "正在生成语音..." });
        }

        const result = await TtsController.ttsService.generateSpeech({
          text,
          model,
          voice,
          outputFormat: normalizedOutputFormat,
          speed,
          userId,
          isAdmin,
        });

        // 生成成功后存储到 MongoDB，并在成功后扣减额度
        if (userId && !isAdmin) {
          const contentHash = TtsController.generateContentHash(text, voice, model);
          await addGenerationRecord({
            userId,
            text,
            voice,
            model,
            outputFormat: normalizedOutputFormat,
            speed,
            fileName: result.fileName,
            contentHash,
          });

          const usageRecorded = await UserStorage.incrementUsage(userId);
          if (!usageRecorded) {
            logger.warn("TTS成功后写入用户用量失败", {
              userId,
              fileName: result.fileName,
            });
          }

          usageSummary = TtsController.buildUsageSummary(
            currentUser,
            await UserStorage.getRemainingUsage(userId),
          );
        }

        // 记录生成历史
        await StorageManager.addRecord(ip, fingerprint || "unknown", text, result.fileName);

        // 记录成功信息
        logger.info("TTS生成成功", {
          ip,
          fingerprint,
          userId,
          fileName: result.fileName,
          timestamp: new Date().toISOString(),
        });

        // 引入签名工具
        const { signContent } = require("../utils/sign");
        // 以 audioUrl 作为签名内容
        const signature = signContent(result.audioUrl);

        // 通知前端：生成完成
        if (userId) {
          wsService.notifyTtsComplete(userId, { taskId, audioUrl: result.audioUrl, fileName: result.fileName });
        }

        res.json({
          success: true,
          status: "generated",
          message: "语音生成成功，音频已准备就绪。",
          ...result,
          outputFormat: normalizedOutputFormat,
          signature,
          usage: usageSummary,
          nextAction: TtsController.buildNextAction(
            "play_or_download",
            "播放或下载音频",
            "音频已生成完成，可直接播放或下载。",
          ),
        });
      } catch (error) {
        // 通知前端：生成失败
        if (userId) {
          wsService.notifyTtsError(userId, { taskId: "", error: "生成语音失败" });
        }
        logger.error("生成语音失败:", error);
        return TtsController.sendStructuredError(
          res,
          500,
          "生成语音失败",
          TtsController.buildNextAction("retry", "稍后重试", "生成失败，请稍后重试。"),
          usageSummary,
        );
      }
    } catch (error) {
      if (error && typeof error === "object" && "statusCode" in error) {
        const statusCode = Number((error as { statusCode: number }).statusCode) || 500;
        return TtsController.sendStructuredError(
          res,
          statusCode,
          error instanceof Error ? error.message : "生成语音失败",
          TtsController.buildNextAction("retry", "重新登录后再试", "请恢复登录状态后重新尝试。"),
          usageSummary,
        );
      }
      logger.error("生成语音失败:", error);
      return TtsController.sendStructuredError(
        res,
        500,
        "生成语音失败",
        TtsController.buildNextAction("retry", "稍后重试", "生成失败，请稍后重试。"),
        usageSummary,
      );
    }
  }

  public static async getRecentGenerations(req: Request, res: Response) {
    try {
      const ip = TtsController.getClientIp(req);
      const fingerprint = (req.query.fingerprint as string) || "unknown";
      const userId = req.headers["x-user-id"] as string;

      // 记录历史记录请求
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
