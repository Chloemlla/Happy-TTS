import axios from "axios";
import crypto from "crypto";
import { config } from "../config/config";
import { AccessTokenDoc, AccessTokenModel } from "../models/accessTokenModel";
import { IpBanDoc, IpBanModel } from "../models/ipBanModel";
import { TempFingerprintDoc, TempFingerprintModel } from "../models/tempFingerprintModel";
import logger from "../utils/logger";
import { connectMongo, isConnected, mongoose } from "./mongoService";

// 输入验证和清理函数
const sanitizeString = (input: string, maxLength: number = 1500): string | null => {
  if (!input || typeof input !== "string") {
    return null;
  }

  // 移除危险字符和过长的输入
  const sanitized = input.trim().substring(0, maxLength);

  // 检查是否包含危险的字符序列
  const dangerousPatterns = [
    /[<>{}]/g, // 移除HTML/XML标签字符
    /javascript:/gi, // 移除JavaScript协议
    /data:/gi, // 移除data协议
    /vbscript:/gi, // 移除VBScript协议
    /on\w+\s*=/gi, // 移除事件处理器
  ];

  let cleaned = sanitized;
  dangerousPatterns.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, "");
  });

  return cleaned || null;
};

const validateFingerprint = (fingerprint: string): string | null => {
  if (!fingerprint || typeof fingerprint !== "string") {
    return null;
  }

  // 指纹应该是有效的字符串，长度在合理范围内
  const sanitized = sanitizeString(fingerprint, 200);
  if (!sanitized || sanitized.length < 8) {
    return null;
  }

  // 检查指纹格式（应该是字母数字组合）
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
};

const validateToken = (token: string): string | null => {
  if (!token || typeof token !== "string") {
    return null;
  }

  // 令牌应该是有效的字符串，长度在合理范围内
  const sanitized = sanitizeString(token, 2000); // 增加长度限制，Turnstile tokens 可能较长
  if (!sanitized || sanitized.length < 10) {
    return null;
  }

  // Turnstile tokens 可以包含各种字符，包括 Base64 编码字符
  // 主要的安全检查由 sanitizeString 函数处理（移除危险模式）
  // 这里只做基本的格式检查，确保不是纯空白字符
  if (!sanitized.trim()) {
    return null;
  }

  return sanitized;
};

const validateIpAddress = (ip: string): string | null => {
  if (!ip || typeof ip !== "string") {
    return null;
  }

  // 简单的IP地址验证（支持CIDR格式）
  const sanitized = sanitizeString(ip, 50);
  if (!sanitized) {
    return null;
  }

  // 检查是否为CIDR格式
  if (sanitized.includes("/")) {
    const parts = sanitized.split("/");
    if (parts.length !== 2) {
      return null;
    }

    const [ipPart, prefixPart] = parts;
    const prefix = parseInt(prefixPart, 10);

    // IPv4 CIDR验证
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4Regex.test(ipPart)) {
      // IPv4前缀长度范围：0-32
      if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        return null;
      }
      return sanitized;
    }

    // IPv6 CIDR验证（支持压缩格式）
    const ipv6Regex =
      /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|::)$/;
    if (ipv6Regex.test(ipPart)) {
      // IPv6前缀长度范围：0-128
      if (isNaN(prefix) || prefix < 0 || prefix > 128) {
        return null;
      }
      return sanitized;
    }

    return null;
  }

  // 检查是否为有效的单个IP地址格式
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex =
    /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|::)$/;

  if (ipv4Regex.test(sanitized) || ipv6Regex.test(sanitized)) {
    return sanitized;
  }

  return null;
};

const validateConfigKey = (key: string): "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY" | null => {
  if (!key || typeof key !== "string") {
    return null;
  }

  // 只允许预定义的配置键
  const validKeys = ["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"];
  return validKeys.includes(key) ? (key as "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY") : null;
};

const validateConfigValue = (value: string): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  // 配置值应该是有效的字符串，长度在合理范围内
  const sanitized = sanitizeString(value, 1000);
  if (!sanitized || sanitized.length < 1) {
    return null;
  }

  return sanitized;
};

// Turnstile配置文档接口
interface TurnstileSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}

// hCaptcha配置文档接口
interface HCaptchaSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}

// Turnstile配置Schema
const TurnstileSettingSchema = new mongoose.Schema<TurnstileSettingDoc>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "turnstile_settings" },
);

// hCaptcha配置Schema
const HCaptchaSettingSchema = new mongoose.Schema<HCaptchaSettingDoc>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "hcaptcha_settings" },
);

const TurnstileSettingModel =
  (mongoose.models.TurnstileSetting as mongoose.Model<TurnstileSettingDoc>) ||
  mongoose.model<TurnstileSettingDoc>("TurnstileSetting", TurnstileSettingSchema);

const HCaptchaSettingModel =
  (mongoose.models.HCaptchaSetting as mongoose.Model<HCaptchaSettingDoc>) ||
  mongoose.model<HCaptchaSettingDoc>("HCaptchaSetting", HCaptchaSettingSchema);

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

// hCaptcha响应接口
interface HCaptchaResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  credit?: boolean;
  score?: number;
  score_reason?: string[];
}

// 风险评估结构
interface RiskAssessment {
  riskLevel: string;
  riskScore: number;
  riskReasons: string[];
}

// 详细的验证失败响应结构，仿照 SmartHumanCheck
interface TurnstileVerificationFailure {
  success: false;
  reason: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  timestamp: string;
  clientInfo: {
    ip: string;
    userAgent?: string;
    fingerprint?: string;
  };
  riskAssessment?: RiskAssessment;
  violationInfo?: {
    violationCount: number;
    banned: boolean;
    banExpiresAt?: Date;
  };
  traceId?: string;
}

// 成功响应结构
interface TurnstileVerificationSuccess {
  success: true;
  timestamp: string;
  clientInfo: {
    ip: string;
    userAgent?: string;
    fingerprint?: string;
  };
  riskAssessment?: RiskAssessment;
  accessToken?: string;
  traceId?: string;
}

type TurnstileVerificationResult = TurnstileVerificationSuccess | TurnstileVerificationFailure;

// 从数据库获取Turnstile密钥
async function getTurnstileKey(keyName: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY"): Promise<string | null> {
  try {
    if (isConnected()) {
      const doc = await TurnstileSettingModel.findOne({ key: keyName }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        return doc.value.trim();
      }
    }
  } catch (error) {
    logger.error("获取Turnstile密钥失败", { keyName, error: error instanceof Error ? error.message : String(error) });
  }
  return null;
}

// 从数据库获取hCaptcha密钥
async function getHCaptchaKey(keyName: "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY"): Promise<string | null> {
  try {
    if (isConnected()) {
      const doc = await HCaptchaSettingModel.findOne({ key: keyName }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error(`读取hCaptcha ${keyName} 失败，回退到环境变量`, e);
  }

  // 回退到环境变量
  const envKey = process.env[keyName]?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

export class TurnstileService {
  private static readonly VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  private static readonly HCAPTCHA_VERIFY_URL = "https://api.hcaptcha.com/siteverify";
  private static readonly MAX_VIOLATIONS = 3; // 最大违规次数
  private static readonly BAN_DURATION = 60 * 60 * 1000; // 封禁时长：60分钟

  /** 获取/复用 Turnstile 溯源模型（使用与SmartHumanCheck相同的集合） */
  private static getTraceModel() {
    const schema = new mongoose.Schema(
      {
        traceId: { type: String, required: true, unique: true },
        time: { type: Date, default: Date.now },
        ip: String,
        ua: String,
        success: Boolean,
        reason: String,
        errorCode: String,
        errorMessage: String,
        score: Number,
        thresholdBase: Number,
        thresholdUsed: Number,
        passRateIp: Number,
        passRateUa: Number,
        policy: String,
        riskLevel: String,
        riskScore: Number,
        riskReasons: [String],
        challengeRequired: Boolean,
        // Turnstile 特有字段
        verificationMethod: { type: String, default: "turnstile" },
        fingerprint: String,
        violationCount: Number,
        banned: Boolean,
        banExpiresAt: Date,
        cfErrorCodes: [String],
      },
      { collection: "shc_traces", timestamps: false },
    );
    return mongoose.models.SHCTrace || mongoose.model("SHCTrace", schema);
  }

  /**
   * 生成唯一的 traceId
   * @returns 唯一的 traceId
   */
  private static generateUniqueTraceId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = crypto.randomBytes(8).toString("hex");
    return `${timestamp}-${randomPart}`;
  }

  /**
   * 持久化 Turnstile 验证溯源信息到数据库
   * @param traceData 溯源数据
   */
  private static async persistTurnstileTrace(traceData: any): Promise<void> {
    try {
      await connectMongo();
      const TraceModel = TurnstileService.getTraceModel();

      // 如果 traceId 已存在，尝试更新而不是插入
      const existingTrace = await TraceModel.findOne({ traceId: traceData.traceId });
      if (existingTrace) {
        await TraceModel.updateOne(
          { traceId: traceData.traceId },
          {
            ...traceData,
            verificationMethod: "turnstile",
            time: new Date(), // 更新时间
          },
        );
        logger.info("[Turnstile] 更新现有溯源信息", { traceId: traceData.traceId });
      } else {
        await TraceModel.create({
          ...traceData,
          verificationMethod: "turnstile",
        });
        logger.info("[Turnstile] 创建新溯源信息", { traceId: traceData.traceId });
      }
    } catch (error) {
      // Type guard to check if error is a MongoDB duplicate key error
      if (error && typeof error === "object" && "code" in error && (error as any).code === 11000) {
        // 处理重复键错误，尝试更新
        try {
          const TraceModel = TurnstileService.getTraceModel();
          await TraceModel.updateOne(
            { traceId: traceData.traceId },
            {
              ...traceData,
              verificationMethod: "turnstile",
              time: new Date(),
            },
          );
          logger.info("[Turnstile] 处理重复键，更新溯源信息", { traceId: traceData.traceId });
        } catch (updateError) {
          logger.warn("[Turnstile] 更新溯源信息失败", updateError);
        }
      } else {
        logger.warn("[Turnstile] 持久化溯源信息失败", error);
      }
    }
  }

  /**
   * 检查IP是否被封禁
   * @param ipAddress IP地址
   * @returns 封禁状态
   */
  public static async isIpBanned(ipAddress: string): Promise<{ banned: boolean; reason?: string; expiresAt?: Date }> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        return { banned: false };
      }

      if (!isConnected()) {
        return { banned: false };
      }

      const banDoc = await IpBanModel.findOne({
        ipAddress: validatedIp,
        expiresAt: { $gt: new Date() }, // 确保封禁未过期
      })
        .lean()
        .exec();

      if (banDoc) {
        return {
          banned: true,
          reason: banDoc.reason,
          expiresAt: banDoc.expiresAt,
        };
      }

      return { banned: false };
    } catch (error) {
      logger.error("检查IP封禁状态失败", error);
      return { banned: false };
    }
  }

  /**
   * 记录违规并可能封禁IP
   * @param ipAddress IP地址
   * @param reason 违规原因
   * @param fingerprint 指纹（可选）
   * @param userAgent 用户代理（可选）
   * @returns 是否被封禁
   */
  public static async recordViolation(
    ipAddress: string,
    reason: string,
    fingerprint?: string,
    userAgent?: string,
  ): Promise<boolean> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        return false;
      }

      // 查找现有的封禁记录
      const banDoc = await IpBanModel.findOne({ ipAddress: validatedIp }).exec();

      if (banDoc) {
        // 更新现有记录
        banDoc.violationCount += 1;
        banDoc.reason = reason;
        // 由于 lean() 查询返回的对象没有 updatedAt 字段，这里不再直接赋值
        // 如果 banDoc 有 updatedAt 字段则更新，否则跳过
        if ("updatedAt" in banDoc) {
          banDoc.updatedAt = new Date();
        }

        // 如果违规次数达到阈值，延长封禁时间
        if (banDoc.violationCount >= TurnstileService.MAX_VIOLATIONS) {
          banDoc.expiresAt = new Date(Date.now() + TurnstileService.BAN_DURATION);
        }

        await banDoc.save();

        logger.warn(`IP ${validatedIp} 违规次数增加到 ${banDoc.violationCount}`, {
          reason,
          fingerprint: fingerprint?.substring(0, 8) + "...",
          banned: banDoc.violationCount >= TurnstileService.MAX_VIOLATIONS,
        });

        return banDoc.violationCount >= TurnstileService.MAX_VIOLATIONS;
      } else {
        // 创建新的封禁记录
        const expiresAt = new Date(Date.now() + TurnstileService.BAN_DURATION);
        await IpBanModel.create({
          ipAddress: validatedIp,
          reason,
          violationCount: 1,
          expiresAt,
          fingerprint,
          userAgent,
        });

        logger.warn(`IP ${validatedIp} 首次违规，已封禁60分钟`, {
          reason,
          fingerprint: fingerprint?.substring(0, 8) + "...",
        });

        return true;
      }
    } catch (error) {
      logger.error("记录违规失败", error);
      return false;
    }
  }

  /**
   * 翻译Turnstile错误代码为可读消息
   * @param errorCodes Cloudflare返回的错误代码数组
   * @returns 错误消息数组
   */
  private static translateTurnstileErrors(errorCodes: string[]): string[] {
    const errorMap: Record<string, string> = {
      "missing-input-secret": "缺少密钥参数",
      "invalid-input-secret": "密钥无效",
      "missing-input-response": "缺少响应令牌",
      "invalid-input-response": "响应令牌无效或已过期",
      "bad-request": "请求格式错误",
      "timeout-or-duplicate": "令牌超时或重复使用",
      "internal-error": "Cloudflare内部错误",
      "invalid-widget-id": "无效的组件ID",
      "invalid-parsed-secret": "解析的密钥无效",
      "invalid-request": "无效请求",
      "challenge-expired": "挑战已过期",
      "challenge-already-used": "挑战已被使用",
      "challenge-not-found": "挑战未找到",
    };

    return errorCodes.map((code) => errorMap[code] || `未知错误代码: ${code}`);
  }

  /**
   * 评估客户端风险等级
   * @param ip IP地址
   * @param userAgent 用户代理
   * @param fingerprint 浏览器指纹
   * @returns 风险评估结果
   */
  private static assessClientRisk(
    ip: string,
    userAgent?: string,
    fingerprint?: string,
  ): { riskLevel: "low" | "medium" | "high"; riskScore: number; riskReasons: string[]; scoreBreakdown: any } {
    const reasons: string[] = [];
    let score = 0;
    const scoreBreakdown: any = {
      baseScore: 0,
      ipScore: 0,
      userAgentScore: 0,
      fingerprintScore: 0,
      devMultiplier: 1,
      finalScore: 0,
      userAgentSkipped: false, // 标记已跳过用户代理验证
    };

    // 开发环境特殊处理
    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";

    // IP风险评估
    if (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("192.168.") ||
      ip.startsWith("10.") ||
      ip.startsWith("172.")
    ) {
      // 本地IP，低风险
      scoreBreakdown.ipScore = 0.05;
      scoreBreakdown.ipType = "local";
      score += 0.05;
      reasons.push("本地IP");
    } else {
      // 公网IP，轻微风险（降低评分）
      scoreBreakdown.ipScore = 0.15;
      scoreBreakdown.ipType = "public";
      score += 0.15;
      reasons.push("公网IP");
    }

    // // User-Agent风险评估（放宽标准）
    if (userAgent) {
      const ua = userAgent.toLowerCase();
      if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider")) {
        scoreBreakdown.userAgentScore = 0.4; // 降低机器人风险评分
        scoreBreakdown.userAgentType = "bot";
        score += 0.4;
        reasons.push("疑似机器人用户代理");
      } else if (ua.includes("curl") || ua.includes("wget") || ua.includes("python")) {
        scoreBreakdown.userAgentScore = 0.6; // 降低自动化工具风险评分
        scoreBreakdown.userAgentType = "automation_tool";
        score += 0.6;
        reasons.push("自动化工具用户代理");
      } else if (
        !ua.includes("mozilla") &&
        !ua.includes("chrome") &&
        !ua.includes("safari") &&
        !ua.includes("firefox") &&
        !ua.includes("edge")
      ) {
        scoreBreakdown.userAgentScore = 0.2; // 降低异常UA风险评分
        scoreBreakdown.userAgentType = "unusual";
        score += 0.2;
        reasons.push("异常用户代理");
      } else {
        scoreBreakdown.userAgentScore = 0;
        scoreBreakdown.userAgentType = "normal";
      }
    } else {
      scoreBreakdown.userAgentScore = 0.2; // 降低缺少UA的风险评分
      scoreBreakdown.userAgentType = "missing";
      score += 0.2;
      reasons.push("缺少用户代理信息");
    }
    // 跳过 User-Agent 风险评估
    // scoreBreakdown.userAgentScore = 0;
    // scoreBreakdown.userAgentType = 'skipped';
    // 不再基于用户代理添加风险评分或原因

    // 指纹风险评估（放宽标准）
    if (!fingerprint || fingerprint.length < 8) {
      scoreBreakdown.fingerprintScore = 0.1; // 降低指纹缺失的风险评分
      scoreBreakdown.fingerprintStatus = "invalid_or_missing";
      score += 0.1;
      reasons.push("无效或缺失浏览器指纹");
    } else {
      scoreBreakdown.fingerprintScore = 0;
      scoreBreakdown.fingerprintStatus = "valid";
    }

    scoreBreakdown.baseScore = score;

    // 开发环境进一步降低风险评分
    // if (isDev) {
    //   scoreBreakdown.devMultiplier = 0.3;
    //   score = score * 0.3; // 开发环境风险评分降低70%
    //   reasons.push('开发环境');
    // }

    scoreBreakdown.finalScore = Math.min(score, 1);

    // 确定风险等级（提高阈值，降低风险等级）
    let riskLevel: "low" | "medium" | "high";
    if (score >= 0.8) {
      riskLevel = "high";
    } else if (score >= 0.5) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    scoreBreakdown.thresholds = {
      high: 0.8,
      medium: 0.5,
      low: 0,
    };

    const finalScore = Math.min(score, 1);
    if (finalScore > 0 && reasons.length === 0) {
      reasons.push("基础风险评分");
    }

    return { riskLevel, riskScore: finalScore, riskReasons: reasons, scoreBreakdown };
  }

  /**
   * 记录验证结果到内存统计（跳过用户代理验证）
   * @param ip IP地址
   * @param userAgent 用户代理（已跳过验证）
   * @param success 是否成功
   * @param timestamp 时间戳
   * @param fingerprint 浏览器指纹
   */
  private static recordVerificationOutcome(
    ip: string,
    userAgent: string | undefined,
    success: boolean,
    timestamp: Date,
    fingerprint?: string,
  ) {
    try {
      const outcome = success ? "成功" : "失败";
      logger.info(`[Turnstile] 验证${outcome}`, {
        ip: ip,
        fingerprint: fingerprint?.substring(0, 16),
        timestamp: timestamp.toISOString(),
        success,
        userAgentSkipped: true, // 标记已跳过用户代理验证
      });
    } catch (error) {
      logger.error("[Turnstile] 记录验证结果失败", error);
    }
  }

  /**
   * 验证 Turnstile token（基础版本，保持向后兼容）
   * @param token 前端返回的 token
   * @param remoteIp 用户 IP 地址
   * @returns 验证结果
   */
  public static async verifyToken(token: string, remoteIp?: string): Promise<boolean> {
    const traceId = TurnstileService.generateUniqueTraceId();

    try {
      // 验证输入参数
      const validatedToken = validateToken(token);

      if (!validatedToken) {
        logger.warn("Turnstile token 验证失败：输入参数无效", { tokenLength: token?.length, traceId });

        const riskAssessmentBasic = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: remoteIp || "unknown",
          ua: undefined,
          success: false,
          reason: "invalid_input",
          errorCode: "INVALID_INPUT",
          errorMessage: "输入参数无效",
          fingerprint: undefined,
          riskLevel: riskAssessmentBasic.riskLevel,
          riskScore: riskAssessmentBasic.riskScore,
          riskReasons: riskAssessmentBasic.riskReasons,
        });

        return false;
      }

      // 从数据库获取密钥
      const secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");

      // 检查是否配置了密钥
      if (!secretKey) {
        logger.warn("Turnstile 密钥未配置，跳过验证", { traceId });

        const riskAssessmentBasic = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
        // 记录服务未配置到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: remoteIp || "unknown",
          ua: undefined,
          success: false,
          reason: "service_unavailable",
          errorCode: "SERVICE_UNAVAILABLE",
          errorMessage: "Turnstile服务未配置",
          fingerprint: undefined,
          riskLevel: riskAssessmentBasic.riskLevel,
          riskScore: riskAssessmentBasic.riskScore,
          riskReasons: riskAssessmentBasic.riskReasons,
        });

        return true;
      }

      const formData = new URLSearchParams();
      formData.append("secret", secretKey);
      formData.append("response", validatedToken);

      if (remoteIp) {
        formData.append("remoteip", remoteIp);
      }

      const response = await axios.post<TurnstileResponse>(TurnstileService.VERIFY_URL, formData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000, // 10秒超时
      });

      const result = response.data;

      const now = new Date();

      if (!result.success) {
        // 记录失败结果
        TurnstileService.recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

        logger.warn("Turnstile 验证失败", {
          errorCodes: result["error-codes"],
          remoteIp,
          timestamp: result.challenge_ts,
          hostname: result.hostname,
          traceId,
        });

        const riskAssessmentFail = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
        // 记录验证失败到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: now,
          ip: remoteIp || "unknown",
          ua: undefined,
          success: false,
          reason: "verification_failed",
          errorCode: result["error-codes"]?.[0] || "VERIFICATION_FAILED",
          errorMessage: `Turnstile验证失败: ${result["error-codes"]?.join(", ") || "unknown"}`,
          fingerprint: undefined,
          riskLevel: riskAssessmentFail.riskLevel,
          riskScore: riskAssessmentFail.riskScore,
          riskReasons: riskAssessmentFail.riskReasons,
        });

        return false;
      }

      // 记录成功结果
      TurnstileService.recordVerificationOutcome(remoteIp || "unknown", undefined, true, now);

      logger.info("Turnstile 验证成功", {
        remoteIp,
        timestamp: result.challenge_ts,
        hostname: result.hostname,
        traceId,
      });

      const riskAssessmentOk = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
      // 记录成功验证到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: now,
        ip: remoteIp || "unknown",
        ua: undefined,
        success: true,
        reason: "verification_success",
        errorCode: null,
        errorMessage: null,
        fingerprint: undefined,
        riskLevel: riskAssessmentOk.riskLevel,
        riskScore: riskAssessmentOk.riskScore,
        riskReasons: riskAssessmentOk.riskReasons,
      });

      return true;
    } catch (error) {
      // 记录异常失败
      const now = new Date();
      TurnstileService.recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

      logger.error("Turnstile 验证请求失败", {
        error: error instanceof Error ? error.message : "Unknown error",
        remoteIp,
        traceId,
        requestUrl: TurnstileService.VERIFY_URL,
      });

      // 记录网络错误到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: now,
        ip: remoteIp || "unknown",
        ua: undefined,
        success: false,
        reason: "network_error",
        errorCode: "NETWORK_ERROR",
        errorMessage: error instanceof Error ? error.message : "网络请求失败",
        fingerprint: undefined,
        riskLevel: "MEDIUM",
        riskScore: 50,
        riskReasons: ["network_error"],
      });

      return false;
    }
  }

  /**
   * 检查是否启用了 Turnstile
   */
  public static async isEnabled(): Promise<boolean> {
    const secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");
    return !!secretKey;
  }

  /**
   * 获取Turnstile配置
   */
  public static async getConfig(): Promise<{
    enabled: boolean;
    siteKey: string | null;
    secretKey: string | null;
  }> {
    const [secretKey, siteKey] = await Promise.all([
      getTurnstileKey("TURNSTILE_SECRET_KEY"),
      getTurnstileKey("TURNSTILE_SITE_KEY"),
    ]);

    return {
      enabled: !!secretKey,
      siteKey,
      secretKey,
    };
  }

  /**
   * 更新Turnstile配置
   */
  public static async updateConfig(
    key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY",
    value: string,
  ): Promise<boolean> {
    try {
      // 严格验证输入参数 - 防止NoSQL注入
      const allowedKeys = ["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"] as const;
      if (!allowedKeys.includes(key as any)) {
        logger.warn("Turnstile配置更新失败：不允许的配置键", { key });
        return false;
      }

      const validatedValue = validateConfigValue(value);
      if (!validatedValue) {
        logger.warn("Turnstile配置更新失败：输入参数无效", { key, valueLength: value?.length });
        return false;
      }

      if (!isConnected()) {
        logger.error("数据库连接不可用，无法更新Turnstile配置");
        return false;
      }

      // 使用字面量对象防止NoSQL注入
      const updateQuery =
        key === "TURNSTILE_SECRET_KEY" ? { key: "TURNSTILE_SECRET_KEY" } : { key: "TURNSTILE_SITE_KEY" };

      const updateData =
        key === "TURNSTILE_SECRET_KEY"
          ? {
              key: "TURNSTILE_SECRET_KEY",
              value: validatedValue,
              updatedAt: new Date(),
            }
          : {
              key: "TURNSTILE_SITE_KEY",
              value: validatedValue,
              updatedAt: new Date(),
            };

      await TurnstileSettingModel.findOneAndUpdate(updateQuery, updateData, { upsert: true, new: true });

      logger.info(`Turnstile配置更新成功: ${key}`);
      return true;
    } catch (error) {
      logger.error(`更新Turnstile配置失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 删除Turnstile配置
   */
  public static async deleteConfig(key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY"): Promise<boolean> {
    try {
      // 验证输入参数
      const validatedKey = validateConfigKey(key);

      if (!validatedKey) {
        logger.warn("Turnstile配置删除失败：输入参数无效", { key });
        return false;
      }

      if (!isConnected()) {
        logger.error("数据库连接不可用，无法删除Turnstile配置");
        return false;
      }

      await TurnstileSettingModel.findOneAndDelete({ key: validatedKey });
      logger.info(`Turnstile配置删除成功: ${validatedKey}`);
      return true;
    } catch (error) {
      logger.error(`删除Turnstile配置失败: ${key}`, error);
      return false;
    }
  }

  // ==================== 临时指纹管理 ====================

  /**
   * 上报临时指纹
   * @param fingerprint 浏览器指纹
   * @param ipAddress IP地址
   * @returns 是否首次访问和验证状态
   */
  public static async reportTempFingerprint(
    fingerprint: string,
    ipAddress: string,
  ): Promise<{
    isFirstVisit: boolean;
    verified: boolean;
  }> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedFingerprint || !validatedIp) {
        logger.warn("临时指纹上报失败：输入参数无效", {
          fingerprintLength: fingerprint?.length,
          ipAddress,
        });
        return { isFirstVisit: false, verified: false };
      }

      // 检查IP是否被封禁
      const banStatus = await TurnstileService.isIpBanned(validatedIp);
      if (banStatus.banned) {
        logger.warn(`IP ${validatedIp} 已被封禁，拒绝访问`, {
          reason: banStatus.reason,
          expiresAt: banStatus.expiresAt,
        });
        return { isFirstVisit: false, verified: false };
      }

      if (!isConnected()) {
        logger.error("数据库连接不可用，无法上报临时指纹");
        return { isFirstVisit: false, verified: false };
      }

      // 开发环境下本地IP的特殊处理
      const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
      const isLocalhost = validatedIp === "127.0.0.1" || validatedIp === "::1" || validatedIp === "::ffff:127.0.0.1";

      // 开发环境本地IP自动验证开关（默认启用）
      const enableDevAutoVerify = process.env.TURNSTILE_DEV_AUTO_VERIFY !== "false";

      // 检查指纹是否已存在
      const existingDoc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).lean().exec();

      if (existingDoc) {
        // 开发环境本地IP自动标记为已验证（需要开关启用）
        if (isDev && isLocalhost && enableDevAutoVerify && !existingDoc.verified) {
          await TempFingerprintModel.updateOne(
            { fingerprint: validatedFingerprint },
            { verified: true, updatedAt: new Date() },
          );
          logger.info("开发环境：本地IP指纹自动标记为已验证", {
            fingerprint: validatedFingerprint.substring(0, 8) + "...",
            ipAddress: validatedIp,
            autoVerifyEnabled: enableDevAutoVerify,
          });
          return {
            isFirstVisit: false,
            verified: true,
          };
        }

        // 指纹已存在，返回当前状态
        return {
          isFirstVisit: false,
          verified: existingDoc.verified,
        };
      }

      // 首次访问，创建新记录
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期
      const isVerified = isDev && isLocalhost && enableDevAutoVerify; // 开发环境本地IP自动验证（需要开关启用）

      const newDoc = await TempFingerprintModel.create({
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        verified: isVerified,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info("创建新的临时指纹记录", {
        fingerprint: validatedFingerprint.substring(0, 8) + "...",
        ipAddress: validatedIp,
        verified: isVerified,
        expiresAt,
      });

      return {
        isFirstVisit: true,
        verified: isVerified,
      };
    } catch (error) {
      logger.error("临时指纹上报失败", error);
      return { isFirstVisit: false, verified: false };
    }
  }

  /**
   * 详细验证 Turnstile token（增强版本，返回详细信息）
   * @param token 前端返回的 token
   * @param remoteIp 用户 IP 地址
   * @param userAgent 用户代理
   * @param fingerprint 浏览器指纹
   * @param captchaType CAPTCHA类型
   * @returns 详细验证结果
   */
  public static async verifyTokenDetailed(
    token: string,
    remoteIp: string,
    userAgent?: string,
    fingerprint?: string,
    captchaType: "turnstile" | "hcaptcha" = "turnstile",
  ): Promise<TurnstileVerificationResult> {
    const timestamp = new Date().toISOString();
    const clientInfo = { ip: remoteIp, userAgent, fingerprint };
    const traceId = TurnstileService.generateUniqueTraceId();

    try {
      // 验证输入参数
      const validatedToken = validateToken(token);
      const validatedIp = validateIpAddress(remoteIp);

      if (!validatedToken || !validatedIp) {
        const riskAssessment = TurnstileService.assessClientRisk(remoteIp, userAgent, fingerprint);
        TurnstileService.recordVerificationOutcome(remoteIp, userAgent, false, new Date(), fingerprint);

        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: remoteIp,
          ua: userAgent,
          success: false,
          reason: "invalid_input",
          errorCode: "INVALID_INPUT",
          errorMessage: "输入参数无效",
          fingerprint,
          riskLevel: riskAssessment?.riskLevel,
          riskScore: riskAssessment?.riskScore,
          riskReasons: riskAssessment?.riskReasons,
        });

        return {
          success: false,
          reason: "invalid_input",
          errorCode: "INVALID_INPUT",
          errorMessage: "输入参数无效",
          retryable: true,
          timestamp,
          clientInfo,
          riskAssessment,
          traceId,
        };
      }

      // 检查IP封禁状态
      const banStatus = await TurnstileService.isIpBanned(validatedIp);
      if (banStatus.banned) {
        const riskAssessment = TurnstileService.assessClientRisk(validatedIp, userAgent, fingerprint);
        TurnstileService.recordVerificationOutcome(validatedIp, userAgent, false, new Date(), fingerprint);

        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: validatedIp,
          ua: userAgent,
          success: false,
          reason: "ip_banned",
          errorCode: "IP_BANNED",
          errorMessage: "IP地址已被封禁",
          fingerprint,
          riskLevel: riskAssessment?.riskLevel,
          riskScore: riskAssessment?.riskScore,
          riskReasons: riskAssessment?.riskReasons,
          banned: true,
          banExpiresAt: banStatus.expiresAt,
        });

        return {
          success: false,
          reason: "ip_banned",
          errorCode: "IP_BANNED",
          errorMessage: "IP地址已被封禁",
          retryable: false,
          timestamp,
          clientInfo,
          riskAssessment,
          violationInfo: {
            violationCount: 0,
            banned: true,
            banExpiresAt: banStatus.expiresAt,
          },
          traceId,
        };
      }

      // 根据验证类型获取对应的密钥
      let secretKey: string | null;
      let verifyUrl: string;
      let serviceName: string;

      if (captchaType === "hcaptcha") {
        secretKey = await getHCaptchaKey("HCAPTCHA_SECRET_KEY");
        verifyUrl = TurnstileService.HCAPTCHA_VERIFY_URL;
        serviceName = "hCaptcha";
      } else {
        secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");
        verifyUrl = TurnstileService.VERIFY_URL;
        serviceName = "Turnstile";
      }

      if (!secretKey) {
        const riskAssessment = TurnstileService.assessClientRisk(validatedIp, userAgent, fingerprint);
        TurnstileService.recordVerificationOutcome(validatedIp, userAgent, false, new Date(), fingerprint);

        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: validatedIp,
          ua: userAgent,
          success: false,
          reason: "service_unavailable",
          errorCode: "SERVICE_UNAVAILABLE",
          errorMessage: `${serviceName}服务未配置`,
          fingerprint,
          riskLevel: riskAssessment?.riskLevel,
          riskScore: riskAssessment?.riskScore,
          riskReasons: riskAssessment?.riskReasons,
        });

        return {
          success: false,
          reason: "service_unavailable",
          errorCode: "SERVICE_UNAVAILABLE",
          errorMessage: `${serviceName}服务未配置`,
          retryable: true,
          timestamp,
          clientInfo,
          riskAssessment,
          traceId,
        };
      }

      // 调用对应的 CAPTCHA API 验证
      const formData = new URLSearchParams();
      formData.append("secret", secretKey);
      formData.append("response", validatedToken);
      formData.append("remoteip", validatedIp);

      const response = await axios.post<TurnstileResponse | HCaptchaResponse>(verifyUrl, formData, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      });

      const result = response.data;
      const now = new Date();

      if (!result.success) {
        const riskAssessment = TurnstileService.assessClientRisk(validatedIp, userAgent, fingerprint);

        // 详细记录验证失败信息
        const errorCodes = result["error-codes"] || [];
        const errorMessages =
          captchaType === "hcaptcha"
            ? errorCodes.map((code) => `hCaptcha错误: ${code}`)
            : TurnstileService.translateTurnstileErrors(errorCodes);

        logger.warn(`${serviceName}验证失败 - 详细评分信息`, {
          ip: validatedIp,
          userAgent: userAgent?.substring(0, 100),
          fingerprint: fingerprint?.substring(0, 16),
          cfErrorCodes: errorCodes,
          errorMessages: errorMessages,
          challengeTs: result.challenge_ts,
          hostname: result.hostname,
          riskAssessment: {
            level: riskAssessment.riskLevel,
            score: riskAssessment.riskScore,
            reasons: riskAssessment.riskReasons,
            scoreBreakdown: riskAssessment.scoreBreakdown,
          },
          traceId,
        });

        // 记录违规并可能封禁IP
        const banned = await TurnstileService.recordViolation(
          validatedIp,
          `${serviceName}验证失败`,
          fingerprint,
          userAgent,
        );

        TurnstileService.recordVerificationOutcome(validatedIp, userAgent, false, now, fingerprint);

        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: now,
          ip: validatedIp,
          ua: userAgent,
          success: false,
          reason: "verification_failed",
          errorCode: "VERIFICATION_FAILED",
          errorMessage: `${serviceName}验证失败: ${result["error-codes"]?.join(", ") || "未知错误"}`,
          fingerprint,
          riskLevel: riskAssessment?.riskLevel,
          riskScore: riskAssessment?.riskScore,
          riskReasons: riskAssessment?.riskReasons,
          banned,
        });

        return {
          success: false,
          reason: "verification_failed",
          errorCode: "VERIFICATION_FAILED",
          errorMessage: `${serviceName}验证失败: ${errorMessages.join(", ")}`,
          retryable: !banned,
          timestamp,
          clientInfo,
          riskAssessment,
          violationInfo: {
            violationCount: 0,
            banned,
            banExpiresAt: banned ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,
          },
          traceId,
        };
      }

      // 验证成功，但仍需进行风险评估
      const riskAssessment = TurnstileService.assessClientRisk(validatedIp, userAgent, fingerprint);
      TurnstileService.recordVerificationOutcome(validatedIp, userAgent, true, now, fingerprint);

      // 记录成功验证到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: now,
        ip: validatedIp,
        ua: userAgent,
        success: true,
        reason: "verification_success",
        errorCode: null,
        errorMessage: null,
        fingerprint,
        riskLevel: riskAssessment?.riskLevel,
        riskScore: riskAssessment?.riskScore,
        riskReasons: riskAssessment?.riskReasons,
      });

      // 即使验证成功，也要记录高风险情况
      if (riskAssessment.riskLevel === "high") {
        logger.warn(`${serviceName}验证成功但风险评估为高风险`, {
          ip: validatedIp,
          userAgent: userAgent?.substring(0, 100),
          fingerprint: fingerprint?.substring(0, 16),
          riskAssessment: {
            level: riskAssessment.riskLevel,
            score: riskAssessment.riskScore,
            reasons: riskAssessment.riskReasons,
            scoreBreakdown: riskAssessment.scoreBreakdown,
          },
          traceId,
        });
      }

      return {
        success: true,
        timestamp,
        clientInfo,
        riskAssessment,
        traceId,
      };
    } catch (error) {
      const riskAssessment = TurnstileService.assessClientRisk(remoteIp, userAgent, fingerprint);
      TurnstileService.recordVerificationOutcome(remoteIp, userAgent, false, new Date(), fingerprint);

      // 记录错误到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: new Date(),
        ip: remoteIp,
        ua: userAgent,
        success: false,
        reason: "network_error",
        errorCode: "NETWORK_ERROR",
        errorMessage: `网络错误: ${error instanceof Error ? error.message : "未知错误"}`,
        fingerprint,
        riskLevel: riskAssessment?.riskLevel,
        riskScore: riskAssessment?.riskScore,
        riskReasons: riskAssessment?.riskReasons,
      });

      const requestUrl =
        captchaType === "hcaptcha" ? TurnstileService.HCAPTCHA_VERIFY_URL : TurnstileService.VERIFY_URL;
      logger.error("CAPTCHA验证过程中发生错误", {
        error: error instanceof Error ? error.message : error,
        ip: remoteIp,
        userAgent,
        fingerprint: fingerprint?.substring(0, 16),
        traceId,
        requestUrl,
      });

      return {
        success: false,
        reason: "network_error",
        errorCode: "NETWORK_ERROR",
        errorMessage: "网络连接错误，请稍后重试",
        retryable: true,
        timestamp,
        clientInfo,
        riskAssessment,
        traceId,
      };
    }
  }

  /**
   * 检查临时指纹验证状态
   * @param fingerprint 浏览器指纹
   * @param ip IP地址
   * @returns 验证状态
   */
  public static async checkTempFingerprintVerificationStatus(
    fingerprint: string,
    ip: string,
  ): Promise<{ isFirstVisit: boolean; verified: boolean }> {
    try {
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ip);

      if (!validatedFingerprint || !validatedIp) {
        return { isFirstVisit: false, verified: false };
      }

      const doc = await TempFingerprintModel.findOne({
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        expiresAt: { $gt: new Date() },
      });

      if (doc) {
        return {
          isFirstVisit: false,
          verified: doc.verified,
        };
      }

      // 创建新的临时指纹记录
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期
      const isVerified = false; // 默认未验证，需要通过CAPTCHA验证

      await TempFingerprintModel.create({
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        verified: isVerified,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info("创建新的临时指纹记录", {
        fingerprint: validatedFingerprint.substring(0, 8) + "...",
        ipAddress: validatedIp,
        verified: isVerified,
        expiresAt,
      });

      return {
        isFirstVisit: true,
        verified: isVerified,
      };
    } catch (error) {
      logger.error("临时指纹验证失败", error);
      return { isFirstVisit: false, verified: false };
    }
  }

  /**
   * 验证临时指纹
   * @param fingerprint 浏览器指纹
   * @param cfToken Turnstile验证令牌
   * @param remoteIp 用户IP地址
   * @param userAgent 用户代理
   * @returns 验证结果
   */
  public static async verifyTempFingerprint(
    fingerprint: string,
    cfToken: string,
    remoteIp?: string,
    userAgent?: string,
    captchaType: "turnstile" | "hcaptcha" = "turnstile",
  ): Promise<{ success: boolean; accessToken?: string; details?: TurnstileVerificationResult; traceId?: string }> {
    const traceId = TurnstileService.generateUniqueTraceId();

    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedToken = validateToken(cfToken);
      const validatedIp = validateIpAddress(remoteIp || "");

      if (!validatedFingerprint || !validatedToken || !validatedIp) {
        logger.warn("临时指纹验证失败：输入参数无效", {
          fingerprintLength: fingerprint?.length,
          tokenLength: cfToken?.length,
          ipAddress: remoteIp,
          traceId,
        });

        const riskAssessmentInvalid = TurnstileService.assessClientRisk(
          remoteIp || "unknown",
          userAgent,
          validatedFingerprint || undefined,
        );
        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: remoteIp || "unknown",
          ua: userAgent,
          success: false,
          reason: "invalid_input",
          errorCode: "INVALID_INPUT",
          errorMessage: "临时指纹验证输入参数无效",
          fingerprint: validatedFingerprint,
          riskLevel: riskAssessmentInvalid?.riskLevel,
          riskScore: riskAssessmentInvalid?.riskScore,
          riskReasons: riskAssessmentInvalid?.riskReasons,
        });

        return { success: false, traceId };
      }

      // 检查IP是否被封禁
      const banStatus = await TurnstileService.isIpBanned(validatedIp);
      if (banStatus.banned) {
        logger.warn(`IP ${validatedIp} 已被封禁，拒绝验证`, {
          reason: banStatus.reason,
          expiresAt: banStatus.expiresAt,
          traceId,
        });

        // 记录IP封禁到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: validatedIp,
          ua: userAgent,
          success: false,
          reason: "ip_banned",
          errorCode: "IP_BANNED",
          errorMessage: "IP地址已被封禁",
          fingerprint: validatedFingerprint,
          riskLevel: "EXTREME",
          riskScore: 100,
          riskReasons: ["ip_banned"],
          banned: true,
          banExpiresAt: banStatus.expiresAt,
        });

        return { success: false, traceId };
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法验证临时指纹", { traceId });

        // 记录数据库连接错误
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: validatedIp,
          ua: userAgent,
          success: false,
          reason: "database_unavailable",
          errorCode: "DATABASE_UNAVAILABLE",
          errorMessage: "数据库连接不可用",
          fingerprint: validatedFingerprint,
          riskLevel: "MEDIUM",
          riskScore: 50,
          riskReasons: ["database_error"],
        });

        return { success: false, traceId };
      }

      // 查找指纹记录
      const doc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).exec();
      if (!doc) {
        logger.warn("临时指纹不存在或已过期", {
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
          traceId,
        });

        // 记录指纹不存在错误
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: validatedIp,
          ua: userAgent,
          success: false,
          reason: "fingerprint_not_found",
          errorCode: "FINGERPRINT_NOT_FOUND",
          errorMessage: "临时指纹不存在或已过期",
          fingerprint: validatedFingerprint,
          riskLevel: "HIGH",
          riskScore: 80,
          riskReasons: ["invalid_fingerprint", "expired_fingerprint"],
        });

        return { success: false, traceId };
      }

      // 开发环境下本地IP跳过Turnstile验证
      const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
      const isLocalhost =
        validatedIp === "127.0.0.1" ||
        validatedIp === "::1" ||
        validatedIp === "::ffff:127.0.0.1" ||
        validatedIp.startsWith("192.168.") ||
        validatedIp.startsWith("10.") ||
        validatedIp.startsWith("172.");
      const devAutoPass = process.env.TURNSTILE_DEV_AUTO_PASS === "true";

      let isValid = false;

      if (isDev && isLocalhost && devAutoPass) {
        // 开发环境本地IP自动通过验证
        isValid = true;
        logger.info("开发环境：本地IP跳过Turnstile验证", {
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
          devAutoPass,
          traceId,
        });

        const riskAssessmentDev = TurnstileService.assessClientRisk(validatedIp, userAgent, validatedFingerprint);
        // 记录开发环境跳过验证到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: validatedIp,
          ua: userAgent,
          success: true,
          reason: "dev_temp_fingerprint_auto_pass",
          errorCode: null,
          errorMessage: null,
          fingerprint: validatedFingerprint,
          riskLevel: riskAssessmentDev?.riskLevel,
          riskScore: riskAssessmentDev?.riskScore,
          riskReasons: riskAssessmentDev?.riskReasons,
        });
      } else if (isDev && isLocalhost && /^mock-token-\d+$/.test(validatedToken)) {
        // 本地开发下识别 mock-token-<timestamp> 直接通过
        isValid = true;
        const riskAssessment = TurnstileService.assessClientRisk(validatedIp, userAgent, validatedFingerprint);
        TurnstileService.recordVerificationOutcome(validatedIp, userAgent, true, new Date(), validatedFingerprint);
        logger.info("开发环境：检测到 mock-token，直接通过Turnstile验证", {
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
          tokenPreview: validatedToken.substring(0, 16) + "...",
          riskAssessment: {
            level: riskAssessment.riskLevel,
            score: riskAssessment.riskScore,
            reasons: riskAssessment.riskReasons,
            scoreBreakdown: riskAssessment.scoreBreakdown,
          },
          traceId,
        });
        if (riskAssessment.riskLevel === "high") {
          logger.warn("开发环境：mock-token直通但风险评估为高风险", {
            fingerprint: validatedFingerprint.substring(0, 8) + "...",
            ipAddress: validatedIp,
            traceId,
            riskAssessment: {
              level: riskAssessment.riskLevel,
              score: riskAssessment.riskScore,
              reasons: riskAssessment.riskReasons,
            },
          });
        }
        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: validatedIp,
          ua: userAgent,
          success: true,
          reason: "dev_mock_token_pass",
          errorCode: null,
          errorMessage: null,
          fingerprint: validatedFingerprint,
          riskLevel: riskAssessment?.riskLevel,
          riskScore: riskAssessment?.riskScore,
          riskReasons: riskAssessment?.riskReasons,
        });
      } else {
        // 使用详细验证方法
        const detailedResult = await TurnstileService.verifyTokenDetailed(
          validatedToken,
          validatedIp,
          userAgent,
          validatedFingerprint,
          captchaType,
        );
        isValid = detailedResult.success;

        if (!isValid) {
          logger.warn(`${captchaType === "hcaptcha" ? "hCaptcha" : "Turnstile"}详细验证失败`, {
            fingerprint: validatedFingerprint.substring(0, 8) + "...",
            ipAddress: validatedIp,
            reason: !detailedResult.success ? detailedResult.reason : "unknown",
            errorCode: !detailedResult.success ? detailedResult.errorCode : "unknown",
            riskLevel: !detailedResult.success ? detailedResult.riskAssessment?.riskLevel : "unknown",
            traceId,
          });
          return { success: false, details: detailedResult, traceId };
        }

        // 人机验证成功，记录成功日志
        logger.info("Turnstile验证成功，直接通过", {
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
          traceId,
        });
      }

      // 标记为已验证
      doc.verified = true;
      doc.updatedAt = new Date();
      await doc.save();

      // 生成访问密钥
      const accessToken = await TurnstileService.generateAccessToken(validatedFingerprint, validatedIp);

      logger.info("临时指纹验证成功，已生成访问密钥", {
        fingerprint: validatedFingerprint.substring(0, 8) + "...",
        ipAddress: validatedIp,
        accessToken: accessToken.substring(0, 8) + "...",
        traceId,
      });

      const riskAssessmentFinal = TurnstileService.assessClientRisk(validatedIp, userAgent, validatedFingerprint);
      // 记录成功验证到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: new Date(),
        ip: validatedIp,
        ua: userAgent,
        success: true,
        reason: "temp_fingerprint_verification_success",
        errorCode: null,
        errorMessage: null,
        fingerprint: validatedFingerprint,
        riskLevel: riskAssessmentFinal?.riskLevel,
        riskScore: riskAssessmentFinal?.riskScore,
        riskReasons: riskAssessmentFinal?.riskReasons,
      });

      return { success: true, accessToken, traceId };
    } catch (error) {
      logger.error("临时指纹验证失败", { error, traceId });

      // 记录异常错误到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: new Date(),
        ip: remoteIp || "unknown",
        ua: userAgent,
        success: false,
        reason: "unexpected_error",
        errorCode: "UNEXPECTED_ERROR",
        errorMessage: error instanceof Error ? error.message : "未知错误",
        fingerprint,
        riskLevel: "MEDIUM",
        riskScore: 50,
        riskReasons: ["unexpected_error"],
      });

      return { success: false, traceId };
    }
  }

  /**
   * 检查临时指纹状态
   * @param fingerprint 浏览器指纹
   * @returns 指纹状态
   */
  public static async checkTempFingerprintStatus(fingerprint: string): Promise<{
    exists: boolean;
    verified: boolean;
  }> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);

      if (!validatedFingerprint) {
        logger.warn("检查临时指纹状态失败：输入参数无效", { fingerprintLength: fingerprint?.length });
        return { exists: false, verified: false };
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法检查临时指纹状态");
        return { exists: false, verified: false };
      }

      const doc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).lean().exec();

      if (!doc) {
        return { exists: false, verified: false };
      }

      return {
        exists: true,
        verified: doc.verified,
      };
    } catch (error) {
      logger.error("检查临时指纹状态失败", error);
      return { exists: false, verified: false };
    }
  }

  /**
   * 清理过期的临时指纹
   * @returns 清理的文档数量
   */
  public static async cleanupExpiredFingerprints(): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法清理过期指纹");
        return 0;
      }

      const now = new Date();
      const result = await TempFingerprintModel.deleteMany({
        expiresAt: { $lt: now },
      });

      if (result.deletedCount > 0) {
        logger.info(`清理过期临时指纹完成，删除 ${result.deletedCount} 条记录`);
      }

      return result.deletedCount || 0;
    } catch (error) {
      logger.error("清理过期临时指纹失败", error);
      return 0;
    }
  }

  /**
   * 获取临时指纹统计信息
   * @returns 统计信息
   */
  public static async getTempFingerprintStats(): Promise<{
    total: number;
    verified: number;
    unverified: number;
    expired: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法获取临时指纹统计");
        return { total: 0, verified: 0, unverified: 0, expired: 0 };
      }

      const now = new Date();

      const [total, verified, unverified, expired] = await Promise.all([
        TempFingerprintModel.countDocuments(),
        TempFingerprintModel.countDocuments({ verified: true }),
        TempFingerprintModel.countDocuments({ verified: false }),
        TempFingerprintModel.countDocuments({ expiresAt: { $lt: now } }),
      ]);

      return {
        total,
        verified,
        unverified,
        expired,
      };
    } catch (error) {
      logger.error("获取临时指纹统计失败", error);
      return { total: 0, verified: 0, unverified: 0, expired: 0 };
    }
  }

  // ==================== 访问密钥管理 ====================

  /**
   * 生成访问密钥
   * @param fingerprint 浏览器指纹
   * @param ipAddress IP地址
   * @returns 访问密钥
   */
  public static async generateAccessToken(fingerprint: string, ipAddress: string): Promise<string> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedFingerprint || !validatedIp) {
        logger.warn("生成访问密钥失败：输入参数无效", {
          fingerprintLength: fingerprint?.length,
          ipAddress,
        });
        throw new Error("无效的指纹或IP参数");
      }

      // 开发环境下为 127.0.0.1 提供永久访问令牌
      const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
      const isLocalhost = validatedIp === "127.0.0.1" || validatedIp === "::1" || validatedIp === "::ffff:127.0.0.1";

      // 检查开发环境永久令牌开关（默认启用）
      const devPermanentTokenEnabled = process.env.TURNSTILE_DEV_PERMANENT_TOKEN !== "false";

      logger.debug("开发环境永久令牌配置", {
        isDev,
        isLocalhost,
        devPermanentTokenEnabled,
        envValue: process.env.TURNSTILE_DEV_PERMANENT_TOKEN,
      });

      if (isDev && isLocalhost && devPermanentTokenEnabled) {
        // 为开发环境生成固定的永久令牌
        const devToken = crypto
          .createHash("sha256")
          .update(`dev-token-${validatedFingerprint}-${validatedIp}`)
          .digest("hex");

        logger.info("开发环境：为本地IP生成永久访问密钥", {
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
          token: devToken.substring(0, 8) + "...",
          switchEnabled: devPermanentTokenEnabled,
        });

        return devToken;
      }

      // 如果开发环境但开关被禁用，记录日志
      if (isDev && isLocalhost && !devPermanentTokenEnabled) {
        logger.info("开发环境：永久令牌开关已禁用，使用标准令牌生成流程", {
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
          switchDisabled: true,
        });
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法生成访问密钥");
        throw new Error("数据库连接不可用");
      }

      // 生成随机密钥
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期

      // 保存到数据库
      await AccessTokenModel.create({
        token,
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        expiresAt,
      });

      logger.info("访问密钥生成成功", {
        fingerprint: validatedFingerprint.substring(0, 8) + "...",
        ipAddress: validatedIp,
        expiresAt,
      });

      return token;
    } catch (error) {
      logger.error("生成访问密钥失败", error);
      throw error;
    }
  }

  /**
   * 生成开发环境永久令牌
   * @param fingerprint 浏览器指纹 (可选)
   * @param ipAddress IP地址 (可选)
   * @returns 开发环境令牌信息
   */
  public static generateDevToken(
    fingerprint?: string,
    ipAddress?: string,
  ): {
    fixedToken: string;
    fingerprintToken?: string;
    usage: string;
  } {
    const FIXED_DEV_TOKEN = "dev-permanent-token-2025";

    let fingerprintToken: string | undefined;
    if (fingerprint && ipAddress) {
      fingerprintToken = crypto.createHash("sha256").update(`dev-token-${fingerprint}-${ipAddress}`).digest("hex");
    }

    return {
      fixedToken: FIXED_DEV_TOKEN,
      fingerprintToken,
      usage: `开发环境永久令牌:
1. 固定令牌: "${FIXED_DEV_TOKEN}"
2. 指纹令牌: ${fingerprintToken || "需要提供fingerprint和ipAddress参数"}

使用方法:
- 在开发环境(NODE_ENV=development)且本地IP(127.0.0.1)下有效
- 可以直接使用固定令牌，无需动态生成
- 也支持基于指纹的动态令牌`,
    };
  }

  /**
   * 验证访问密钥
   * @param token 访问密钥
   * @param fingerprint 浏览器指纹
   * @param ipAddress IP地址
   * @returns 验证结果
   */
  public static async verifyAccessToken(token: string, fingerprint: string, ipAddress: string): Promise<boolean> {
    try {
      // 验证输入参数
      const validatedToken = validateToken(token);
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedToken || !validatedFingerprint || !validatedIp) {
        logger.warn("验证访问密钥失败：输入参数无效", {
          tokenLength: token?.length,
          fingerprintLength: fingerprint?.length,
          ipAddress,
        });
        return false;
      }

      // 开发环境下验证永久访问令牌
      const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
      const isLocalhost = validatedIp === "127.0.0.1" || validatedIp === "::1" || validatedIp === "::ffff:127.0.0.1";

      if (isDev && isLocalhost) {
        // 固定的开发环境永久令牌
        const FIXED_DEV_TOKEN = "dev-permanent-token-2025";

        // 生成基于指纹的开发环境令牌
        const expectedDevToken = crypto
          .createHash("sha256")
          .update(`dev-token-${validatedFingerprint}-${validatedIp}`)
          .digest("hex");

        // 验证固定令牌或基于指纹的令牌
        if (validatedToken === FIXED_DEV_TOKEN || validatedToken === expectedDevToken) {
          const tokenType = validatedToken === FIXED_DEV_TOKEN ? "固定令牌" : "指纹令牌";
          logger.info(`开发环境：永久访问密钥验证成功 (${tokenType})`, {
            fingerprint: validatedFingerprint.substring(0, 8) + "...",
            ipAddress: validatedIp,
            token: validatedToken.substring(0, 8) + "...",
            tokenType,
          });
          return true;
        }
      }

      // 检查IP是否被封禁（开发环境本地IP跳过封禁检查）
      if (!(isDev && isLocalhost)) {
        const banStatus = await TurnstileService.isIpBanned(validatedIp);
        if (banStatus.banned) {
          logger.warn(`IP ${validatedIp} 已被封禁，拒绝验证访问密钥`, {
            reason: banStatus.reason,
            expiresAt: banStatus.expiresAt,
          });
          return false;
        }
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法验证访问密钥");
        return false;
      }

      // 查找并验证密钥（必须匹配token、fingerprint和ipAddress）
      const doc = await AccessTokenModel.findOne({
        token: validatedToken,
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        expiresAt: { $gt: new Date() }, // 确保未过期
      }).exec();

      if (!doc) {
        logger.warn("访问密钥无效或已过期", {
          token: validatedToken.substring(0, 8) + "...",
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
        });
        return false;
      }

      // 更新最后访问时间
      doc.updatedAt = new Date();
      await doc.save();

      logger.info("访问密钥验证成功", {
        token: validatedToken.substring(0, 8) + "...",
        fingerprint: validatedFingerprint.substring(0, 8) + "...",
        ipAddress: validatedIp,
      });

      return true;
    } catch (error) {
      logger.error("验证访问密钥失败", error);
      return false;
    }
  }

  /**
   * 检查指纹是否有有效的访问密钥
   * @param fingerprint 浏览器指纹
   * @param ipAddress IP地址
   * @returns 是否有有效密钥
   */
  public static async hasValidAccessToken(fingerprint: string, ipAddress: string): Promise<boolean> {
    try {
      // 验证输入参数
      const validatedFingerprint = validateFingerprint(fingerprint);
      const validatedIp = validateIpAddress(ipAddress);

      if (!validatedFingerprint || !validatedIp) {
        logger.warn("检查访问密钥失败：输入参数无效", {
          fingerprintLength: fingerprint?.length,
          ipAddress,
        });
        return false;
      }

      // 开发环境下本地IP自动拥有有效访问密钥的开关（默认启用）
      const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
      const isLocalhost = validatedIp === "127.0.0.1" || validatedIp === "::1" || validatedIp === "::ffff:127.0.0.1";
      const enableDevAutoAccess = process.env.TURNSTILE_DEV_AUTO_ACCESS !== "false";

      if (isDev && isLocalhost && enableDevAutoAccess) {
        logger.info("开发环境：本地IP自动拥有有效访问密钥", {
          fingerprint: validatedFingerprint.substring(0, 8) + "...",
          ipAddress: validatedIp,
          autoAccessEnabled: enableDevAutoAccess,
        });
        return true;
      }

      // 检查IP是否被封禁
      const banStatus = await TurnstileService.isIpBanned(validatedIp);
      if (banStatus.banned) {
        logger.warn(`IP ${validatedIp} 已被封禁，拒绝检查访问密钥`, {
          reason: banStatus.reason,
          expiresAt: banStatus.expiresAt,
        });
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        return false;
      }

      const doc = await AccessTokenModel.findOne({
        fingerprint: validatedFingerprint,
        ipAddress: validatedIp,
        expiresAt: { $gt: new Date() }, // 确保未过期
      }).exec();

      return !!doc;
    } catch (error) {
      logger.error("检查访问密钥失败", error);
      return false;
    }
  }

  /**
   * 清理过期的访问密钥
   * @returns 清理的数量
   */
  public static async cleanupExpiredAccessTokens(): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return 0;
      }

      const result = await AccessTokenModel.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      if (result.deletedCount > 0) {
        logger.info(`清理了 ${result.deletedCount} 个过期访问密钥`);
      }

      return result.deletedCount;
    } catch (error) {
      logger.error("清理过期访问密钥失败", error);
      return 0;
    }
  }

  /**
   * 获取访问密钥统计信息
   * @returns 统计信息
   */
  public static async getAccessTokenStats(): Promise<{
    total: number;
    valid: number;
    expired: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { total: 0, valid: 0, expired: 0 };
      }

      const now = new Date();
      const [total, valid, expired] = await Promise.all([
        AccessTokenModel.countDocuments(),
        AccessTokenModel.countDocuments({ expiresAt: { $gt: now } }),
        AccessTokenModel.countDocuments({ expiresAt: { $lte: now } }),
      ]);

      return { total, valid, expired };
    } catch (error) {
      logger.error("获取访问密钥统计失败", error);
      return { total: 0, valid: 0, expired: 0 };
    }
  }

  // ==================== IP封禁管理 ====================

  /**
   * 清理过期的IP封禁记录
   * @returns 清理的数量
   */
  public static async cleanupExpiredIpBans(): Promise<number> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return 0;
      }

      const result = await IpBanModel.deleteMany({
        expiresAt: { $lt: new Date() },
      });

      if (result.deletedCount > 0) {
        logger.info(`清理了 ${result.deletedCount} 条过期IP封禁记录`);
      }

      return result.deletedCount;
    } catch (error) {
      logger.error("清理过期IP封禁记录失败", error);
      return 0;
    }
  }

  /**
   * 获取IP封禁统计信息
   * @returns 统计信息
   */
  public static async getIpBanStats(): Promise<{
    total: number;
    active: number;
    expired: number;
  }> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return { total: 0, active: 0, expired: 0 };
      }

      const now = new Date();
      const [total, active, expired] = await Promise.all([
        IpBanModel.countDocuments(),
        IpBanModel.countDocuments({ expiresAt: { $gt: now } }),
        IpBanModel.countDocuments({ expiresAt: { $lte: now } }),
      ]);

      return { total, active, expired };
    } catch (error) {
      logger.error("获取IP封禁统计失败", error);
      return { total: 0, active: 0, expired: 0 };
    }
  }

  /**
   * 手动封禁IP地址
   * @param ipAddress IP地址
   * @param reason 封禁原因
   * @param durationMinutes 封禁时长（分钟）
   * @param fingerprint 用户指纹（可选）
   * @param userAgent 用户代理（可选）
   * @returns 封禁结果
   */
  public static async manualBanIp(
    ipAddress: string,
    reason: string,
    durationMinutes: number = 60,
    fingerprint?: string,
    userAgent?: string,
  ): Promise<{
    success: boolean;
    error?: string;
    expiresAt?: Date;
    bannedAt?: Date;
  }> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        return {
          success: false,
          error: "IP地址格式无效",
        };
      }

      const sanitizedReason = sanitizeString(reason, 500);
      if (!sanitizedReason) {
        return {
          success: false,
          error: "封禁原因无效",
        };
      }

      // 验证封禁时长
      let validDuration = 60; // 默认60分钟

      if (durationMinutes !== undefined && durationMinutes !== null) {
        // 确保是数字类型
        const duration = Number(durationMinutes);

        // 检查是否为有效数字
        if (isNaN(duration) || !isFinite(duration)) {
          return {
            success: false,
            error: "封禁时长必须是有效的数字",
          };
        }

        // 设置合理的范围：1分钟到24小时（1440分钟）
        validDuration = Math.min(Math.max(duration, 1), 24 * 60);
      }

      if (mongoose.connection.readyState !== 1) {
        return {
          success: false,
          error: "数据库连接不可用",
        };
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + validDuration * 60 * 1000);

      // 检查IP是否已经被封禁
      const existingBan = await IpBanModel.findOne({ ipAddress: validatedIp });

      let isUpdate = false;
      let bannedAt = now;

      if (existingBan) {
        // 如果IP已被封禁，更新过期时间和封禁原因
        isUpdate = true;
        bannedAt = existingBan.bannedAt;
        existingBan.expiresAt = expiresAt;
        existingBan.reason = sanitizedReason;

        // 如果提供了新的指纹或用户代理，也更新它们
        if (fingerprint) {
          const sanitizedFingerprint = sanitizeString(fingerprint, 200);
          if (sanitizedFingerprint) {
            existingBan.fingerprint = sanitizedFingerprint;
          }
        }
        if (userAgent) {
          const sanitizedUserAgent = sanitizeString(userAgent, 500);
          if (sanitizedUserAgent) {
            existingBan.userAgent = sanitizedUserAgent;
          }
        }

        await existingBan.save();

        logger.info(`更新IP封禁: ${validatedIp}, 原因: ${sanitizedReason}, 新过期时间: ${expiresAt}`);
      } else {
        // 创建新的封禁记录
        const banRecord = new IpBanModel({
          ipAddress: validatedIp,
          reason: sanitizedReason,
          violationCount: 1,
          bannedAt: now,
          expiresAt: expiresAt,
          fingerprint: fingerprint ? sanitizeString(fingerprint, 200) : undefined,
          userAgent: userAgent ? sanitizeString(userAgent, 500) : undefined,
        });

        await banRecord.save();

        logger.info(`手动封禁IP: ${validatedIp}, 原因: ${sanitizedReason}, 时长: ${validDuration}分钟`);
      }

      // 同步到 Redis
      try {
        const { redisService } = await import("./redisService");
        if (redisService && redisService.isAvailable()) {
          await redisService.banIP(validatedIp, sanitizedReason, validDuration, {
            fingerprint: fingerprint ? sanitizeString(fingerprint, 200) || undefined : undefined,
            userAgent: userAgent ? sanitizeString(userAgent, 500) || undefined : undefined,
          });
          logger.info(`✅ IP封禁已同步到Redis: ${validatedIp}`);
        }
      } catch (redisError) {
        logger.warn(`同步IP封禁到Redis失败，但MongoDB已更新`, { error: redisError });
      }

      // 清除缓存 - 确保封禁立即生效
      try {
        const { clearIPBanCache } = await import("../middleware/ipBanCheck");
        if (clearIPBanCache) {
          clearIPBanCache(validatedIp);
        }
      } catch (cacheError) {
        logger.warn(`清除IP缓存失败，但封禁已生效`, { error: cacheError });
      }

      return {
        success: true,
        expiresAt: expiresAt,
        bannedAt: bannedAt,
      };
    } catch (error) {
      logger.error("手动封禁IP失败", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      };
    }
  }

  /**
   * 手动解除IP封禁
   * @param ipAddress IP地址
   * @returns 是否成功
   */
  public static async unbanIp(ipAddress: string): Promise<boolean> {
    try {
      const validatedIp = validateIpAddress(ipAddress);
      if (!validatedIp) {
        logger.warn(`解封IP失败：IP地址格式无效`, { ipAddress });
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        logger.warn("解封IP失败：MongoDB连接不可用");
        return false;
      }

      let mongoDeleted = false;
      let redisDeleted = false;

      // 1. 从 MongoDB 删除
      const mongoResult = await IpBanModel.deleteOne({ ipAddress: validatedIp });
      mongoDeleted = mongoResult.deletedCount > 0;

      // 2. 从 Redis 删除
      try {
        const { redisService } = await import("./redisService");
        if (redisService && redisService.isAvailable()) {
          redisDeleted = await redisService.unbanIP(validatedIp);
        }
      } catch (redisError) {
        logger.warn(`从Redis删除IP封禁失败，继续执行`, { error: redisError });
      }

      // 3. 清除缓存 - 通过ipBanCheck中间件的缓存清除接口
      try {
        const { clearIPBanCache } = await import("../middleware/ipBanCheck");
        if (clearIPBanCache) {
          clearIPBanCache(validatedIp);
        }
      } catch (cacheError) {
        logger.warn(`清除IP缓存失败，继续执行`, { error: cacheError });
      }

      if (mongoDeleted || redisDeleted) {
        logger.info(`✅ 手动解除IP封禁: ${validatedIp}`, {
          mongoDeleted,
          redisDeleted,
          source: mongoDeleted && redisDeleted ? "both" : mongoDeleted ? "mongodb" : "redis",
        });
        return true;
      }

      logger.warn(`⚠️ IP未在封禁列表中: ${validatedIp}`);
      return false;
    } catch (error) {
      logger.error("手动解除IP封禁失败", error);
      return false;
    }
  }

  // ==================== hCaptcha 验证功能 ====================

  /**
   * 验证 hCaptcha token
   * @param token hCaptcha 返回的 token
   * @param remoteIp 用户 IP 地址
   * @param siteKey 站点密钥（可选）
   * @returns 验证结果
   */
  public static async verifyHCaptchaToken(token: string, remoteIp?: string, siteKey?: string): Promise<boolean> {
    const traceId = TurnstileService.generateUniqueTraceId();

    try {
      // 验证输入参数
      const validatedToken = validateToken(token);

      if (!validatedToken) {
        logger.warn("hCaptcha token 验证失败：输入参数无效", { tokenLength: token?.length, traceId });

        const riskAssessmentBasic = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
        // 记录到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: remoteIp || "unknown",
          ua: undefined,
          success: false,
          reason: "invalid_input",
          errorCode: "INVALID_INPUT",
          errorMessage: "输入参数无效",
          fingerprint: undefined,
          riskLevel: riskAssessmentBasic.riskLevel,
          riskScore: riskAssessmentBasic.riskScore,
          riskReasons: riskAssessmentBasic.riskReasons,
          verificationMethod: "hcaptcha",
        });

        return false;
      }

      // 从数据库获取密钥
      const secretKey = await getHCaptchaKey("HCAPTCHA_SECRET_KEY");

      // 检查是否配置了密钥
      if (!secretKey) {
        logger.warn("hCaptcha 密钥未配置，跳过验证", { traceId });

        const riskAssessmentBasic = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
        // 记录服务未配置到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: new Date(),
          ip: remoteIp || "unknown",
          ua: undefined,
          success: false,
          reason: "service_unavailable",
          errorCode: "SERVICE_UNAVAILABLE",
          errorMessage: "hCaptcha服务未配置",
          fingerprint: undefined,
          riskLevel: riskAssessmentBasic.riskLevel,
          riskScore: riskAssessmentBasic.riskScore,
          riskReasons: riskAssessmentBasic.riskReasons,
          verificationMethod: "hcaptcha",
        });

        return true;
      }

      const formData = new URLSearchParams();
      formData.append("secret", secretKey);
      formData.append("response", validatedToken);

      if (remoteIp) {
        formData.append("remoteip", remoteIp);
      }

      if (siteKey) {
        formData.append("sitekey", siteKey);
      }

      const response = await axios.post<HCaptchaResponse>(TurnstileService.HCAPTCHA_VERIFY_URL, formData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 10000, // 10秒超时
      });

      const result = response.data;
      const now = new Date();

      if (!result.success) {
        // 记录失败结果
        TurnstileService.recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

        logger.warn("hCaptcha 验证失败", {
          errorCodes: result["error-codes"],
          remoteIp,
          timestamp: result.challenge_ts,
          hostname: result.hostname,
          traceId,
        });

        const riskAssessmentFail = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
        // 记录验证失败到溯源数据库
        await TurnstileService.persistTurnstileTrace({
          traceId,
          time: now,
          ip: remoteIp || "unknown",
          ua: undefined,
          success: false,
          reason: "verification_failed",
          errorCode: result["error-codes"]?.[0] || "VERIFICATION_FAILED",
          errorMessage: `hCaptcha验证失败: ${result["error-codes"]?.join(", ") || "unknown"}`,
          fingerprint: undefined,
          riskLevel: riskAssessmentFail.riskLevel,
          riskScore: riskAssessmentFail.riskScore,
          riskReasons: riskAssessmentFail.riskReasons,
          verificationMethod: "hcaptcha",
        });

        return false;
      }

      // 记录成功结果
      TurnstileService.recordVerificationOutcome(remoteIp || "unknown", undefined, true, now);

      logger.info("hCaptcha 验证成功", {
        remoteIp,
        timestamp: result.challenge_ts,
        hostname: result.hostname,
        score: result.score,
        traceId,
      });

      const riskAssessmentOk = TurnstileService.assessClientRisk(remoteIp || "unknown", undefined, undefined);
      // 记录成功验证到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: now,
        ip: remoteIp || "unknown",
        ua: undefined,
        success: true,
        reason: "verification_success",
        errorCode: null,
        errorMessage: null,
        fingerprint: undefined,
        riskLevel: riskAssessmentOk.riskLevel,
        riskScore: riskAssessmentOk.riskScore,
        riskReasons: riskAssessmentOk.riskReasons,
        verificationMethod: "hcaptcha",
      });

      return true;
    } catch (error) {
      // 记录异常失败
      const now = new Date();
      TurnstileService.recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

      logger.error("hCaptcha 验证请求失败", {
        error: error instanceof Error ? error.message : "Unknown error",
        remoteIp,
        traceId,
        requestUrl: TurnstileService.HCAPTCHA_VERIFY_URL,
      });

      // 记录网络错误到溯源数据库
      await TurnstileService.persistTurnstileTrace({
        traceId,
        time: now,
        ip: remoteIp || "unknown",
        ua: undefined,
        success: false,
        reason: "network_error",
        errorCode: "NETWORK_ERROR",
        errorMessage: error instanceof Error ? error.message : "网络请求失败",
        fingerprint: undefined,
        riskLevel: "MEDIUM",
        riskScore: 50,
        riskReasons: ["network_error"],
        verificationMethod: "hcaptcha",
      });

      return false;
    }
  }

  /**
   * 检查是否启用了 hCaptcha
   */
  public static async isHCaptchaEnabled(): Promise<boolean> {
    const secretKey = await getHCaptchaKey("HCAPTCHA_SECRET_KEY");
    return !!secretKey;
  }

  /**
   * 获取hCaptcha配置
   */
  public static async getHCaptchaConfig(): Promise<{
    enabled: boolean;
    siteKey: string | null;
    secretKey: string | null;
  }> {
    const [secretKey, siteKey] = await Promise.all([
      getHCaptchaKey("HCAPTCHA_SECRET_KEY"),
      getHCaptchaKey("HCAPTCHA_SITE_KEY"),
    ]);

    return {
      enabled: !!secretKey,
      siteKey,
      secretKey,
    };
  }

  /**
   * 更新hCaptcha配置
   */
  public static async updateHCaptchaConfig(
    key: "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY",
    value: string,
  ): Promise<boolean> {
    try {
      // 严格验证输入参数 - 防止NoSQL注入
      const allowedKeys = ["HCAPTCHA_SECRET_KEY", "HCAPTCHA_SITE_KEY"] as const;
      if (!allowedKeys.includes(key as any)) {
        logger.warn("hCaptcha配置更新失败：不允许的配置键", { key });
        return false;
      }

      const validatedValue = validateConfigValue(value);
      if (!validatedValue) {
        logger.warn("hCaptcha配置更新失败：输入参数无效", { key, valueLength: value?.length });
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法更新hCaptcha配置");
        return false;
      }

      // 使用完全静态的查询对象防止NoSQL注入
      // 不直接使用用户输入构建查询条件
      if (key === "HCAPTCHA_SECRET_KEY") {
        await HCaptchaSettingModel.findOneAndUpdate(
          { key: "HCAPTCHA_SECRET_KEY" }, // 静态字面量
          {
            key: "HCAPTCHA_SECRET_KEY", // 静态字面量
            value: validatedValue,
            updatedAt: new Date(),
          },
          { upsert: true, new: true },
        );
      } else if (key === "HCAPTCHA_SITE_KEY") {
        await HCaptchaSettingModel.findOneAndUpdate(
          { key: "HCAPTCHA_SITE_KEY" }, // 静态字面量
          {
            key: "HCAPTCHA_SITE_KEY", // 静态字面量
            value: validatedValue,
            updatedAt: new Date(),
          },
          { upsert: true, new: true },
        );
      } else {
        // 额外的安全检查
        logger.error("hCaptcha配置更新失败：未知的配置键", { key });
        return false;
      }

      logger.info(`hCaptcha配置更新成功: ${key}`);
      return true;
    } catch (error) {
      logger.error(`更新hCaptcha配置失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 删除hCaptcha配置
   */
  public static async deleteHCaptchaConfig(key: "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY"): Promise<boolean> {
    try {
      // 验证输入参数
      const validatedKey = key === "HCAPTCHA_SECRET_KEY" || key === "HCAPTCHA_SITE_KEY" ? key : null;

      if (!validatedKey) {
        logger.warn("hCaptcha配置删除失败：输入参数无效", { key });
        return false;
      }

      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法删除hCaptcha配置");
        return false;
      }

      await HCaptchaSettingModel.findOneAndDelete({ key: validatedKey });
      logger.info(`hCaptcha配置删除成功: ${validatedKey}`);
      return true;
    } catch (error) {
      logger.error(`删除hCaptcha配置失败: ${key}`, error);
      return false;
    }
  }
}
