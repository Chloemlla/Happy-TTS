import axios from "axios";
import { TempFingerprintModel } from "../../models/tempFingerprintModel";
import logger from "../../utils/logger";
import { mongoose } from "../mongoService";
import { generateAccessToken } from "./accessToken";
import { HCAPTCHA_VERIFY_URL, VERIFY_URL } from "./constants";
import { isIpBanned, recordViolation } from "./ipBan";
import { getHCaptchaKey, getTurnstileKey } from "./models";
import { assessClientRisk, recordVerificationOutcome, translateTurnstileErrors } from "./risk";
import { generateUniqueTraceId, persistTurnstileTrace } from "./trace";
import type { HCaptchaResponse, TurnstileResponse, TurnstileVerificationResult } from "./types";
import { validateFingerprint, validateIpAddress, validateToken } from "./validators";

export async function verifyToken(token: string, remoteIp?: string): Promise<boolean> {
  const traceId = generateUniqueTraceId();

  try {
    const validatedToken = validateToken(token);

    if (!validatedToken) {
      logger.warn("Turnstile token 验证失败：输入参数无效", { tokenLength: token?.length, traceId });

      const riskAssessmentBasic = assessClientRisk(remoteIp || "unknown", undefined, undefined);
      await persistTurnstileTrace({
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

    const secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");

    if (!secretKey) {
      logger.warn("Turnstile 密钥未配置，跳过验证", { traceId });

      const riskAssessmentBasic = assessClientRisk(remoteIp || "unknown", undefined, undefined);
      await persistTurnstileTrace({
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

    const response = await axios.post<TurnstileResponse>(VERIFY_URL, formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });

    const result = response.data;
    const now = new Date();

    if (!result.success) {
      recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

      logger.warn("Turnstile 验证失败", {
        errorCodes: result["error-codes"],
        remoteIp,
        timestamp: result.challenge_ts,
        hostname: result.hostname,
        traceId,
      });

      const riskAssessmentFail = assessClientRisk(remoteIp || "unknown", undefined, undefined);
      await persistTurnstileTrace({
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

    recordVerificationOutcome(remoteIp || "unknown", undefined, true, now);

    logger.info("Turnstile 验证成功", {
      remoteIp,
      timestamp: result.challenge_ts,
      hostname: result.hostname,
      traceId,
    });

    const riskAssessmentOk = assessClientRisk(remoteIp || "unknown", undefined, undefined);
    await persistTurnstileTrace({
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
    const now = new Date();
    recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

    logger.error("Turnstile 验证请求失败", {
      error: error instanceof Error ? error.message : "Unknown error",
      remoteIp,
      traceId,
      requestUrl: VERIFY_URL,
    });

    await persistTurnstileTrace({
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

export async function verifyTokenDetailed(
  token: string,
  remoteIp: string,
  userAgent?: string,
  fingerprint?: string,
  captchaType: "turnstile" | "hcaptcha" = "turnstile",
): Promise<TurnstileVerificationResult> {
  const timestamp = new Date().toISOString();
  const clientInfo = { ip: remoteIp, userAgent, fingerprint };
  const traceId = generateUniqueTraceId();

  try {
    const validatedToken = validateToken(token);
    const validatedIp = validateIpAddress(remoteIp);

    if (!validatedToken || !validatedIp) {
      const riskAssessment = assessClientRisk(remoteIp, userAgent, fingerprint);
      recordVerificationOutcome(remoteIp, userAgent, false, new Date(), fingerprint);

      await persistTurnstileTrace({
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

    const banStatus = await isIpBanned(validatedIp);
    if (banStatus.banned) {
      const riskAssessment = assessClientRisk(validatedIp, userAgent, fingerprint);
      recordVerificationOutcome(validatedIp, userAgent, false, new Date(), fingerprint);

      await persistTurnstileTrace({
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

    let secretKey: string | null;
    let verifyUrl: string;
    let serviceName: string;

    if (captchaType === "hcaptcha") {
      secretKey = await getHCaptchaKey("HCAPTCHA_SECRET_KEY");
      verifyUrl = HCAPTCHA_VERIFY_URL;
      serviceName = "hCaptcha";
    } else {
      secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");
      verifyUrl = VERIFY_URL;
      serviceName = "Turnstile";
    }

    if (!secretKey) {
      const riskAssessment = assessClientRisk(validatedIp, userAgent, fingerprint);
      recordVerificationOutcome(validatedIp, userAgent, false, new Date(), fingerprint);

      await persistTurnstileTrace({
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
      const riskAssessment = assessClientRisk(validatedIp, userAgent, fingerprint);

      const errorCodes = result["error-codes"] || [];
      const errorMessages =
        captchaType === "hcaptcha"
          ? errorCodes.map((code) => `hCaptcha错误: ${code}`)
          : translateTurnstileErrors(errorCodes);

      logger.warn(`${serviceName}验证失败 - 详细评分信息`, {
        ip: validatedIp,
        userAgent: userAgent?.substring(0, 100),
        fingerprint: fingerprint?.substring(0, 16),
        cfErrorCodes: errorCodes,
        errorMessages,
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

      const banned = await recordViolation(validatedIp, `${serviceName}验证失败`, fingerprint, userAgent);

      recordVerificationOutcome(validatedIp, userAgent, false, now, fingerprint);

      await persistTurnstileTrace({
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

    const riskAssessment = assessClientRisk(validatedIp, userAgent, fingerprint);
    recordVerificationOutcome(validatedIp, userAgent, true, now, fingerprint);

    await persistTurnstileTrace({
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

    return { success: true, timestamp, clientInfo, riskAssessment, traceId };
  } catch (error) {
    const riskAssessment = assessClientRisk(remoteIp, userAgent, fingerprint);
    recordVerificationOutcome(remoteIp, userAgent, false, new Date(), fingerprint);

    await persistTurnstileTrace({
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

    const requestUrl = captchaType === "hcaptcha" ? HCAPTCHA_VERIFY_URL : VERIFY_URL;
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

export async function verifyTempFingerprint(
  fingerprint: string,
  cfToken: string,
  remoteIp?: string,
  userAgent?: string,
  captchaType: "turnstile" | "hcaptcha" = "turnstile",
): Promise<{ success: boolean; accessToken?: string; details?: TurnstileVerificationResult; traceId?: string }> {
  const traceId = generateUniqueTraceId();

  try {
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

      const riskAssessmentInvalid = assessClientRisk(
        remoteIp || "unknown",
        userAgent,
        validatedFingerprint || undefined,
      );
      await persistTurnstileTrace({
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

    const banStatus = await isIpBanned(validatedIp);
    if (banStatus.banned) {
      logger.warn(`IP ${validatedIp} 已被封禁，拒绝验证`, {
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
        traceId,
      });

      await persistTurnstileTrace({
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

      await persistTurnstileTrace({
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

    const doc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).exec();
    if (!doc) {
      logger.warn("临时指纹不存在或已过期", {
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
        traceId,
      });

      await persistTurnstileTrace({
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
      isValid = true;
      logger.info("开发环境：本地IP跳过Turnstile验证", {
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
        devAutoPass,
        traceId,
      });

      const riskAssessmentDev = assessClientRisk(validatedIp, userAgent, validatedFingerprint);
      await persistTurnstileTrace({
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
      isValid = true;
      const riskAssessment = assessClientRisk(validatedIp, userAgent, validatedFingerprint);
      recordVerificationOutcome(validatedIp, userAgent, true, new Date(), validatedFingerprint);
      logger.info("开发环境：检测到 mock-token，直接通过Turnstile验证", {
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
        tokenPreview: `${validatedToken.substring(0, 16)}...`,
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
          fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
          ipAddress: validatedIp,
          traceId,
          riskAssessment: {
            level: riskAssessment.riskLevel,
            score: riskAssessment.riskScore,
            reasons: riskAssessment.riskReasons,
          },
        });
      }
      await persistTurnstileTrace({
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
      const detailedResult = await verifyTokenDetailed(
        validatedToken,
        validatedIp,
        userAgent,
        validatedFingerprint,
        captchaType,
      );
      isValid = detailedResult.success;

      if (!isValid) {
        logger.warn(`${captchaType === "hcaptcha" ? "hCaptcha" : "Turnstile"}详细验证失败`, {
          fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
          ipAddress: validatedIp,
          reason: !detailedResult.success ? detailedResult.reason : "unknown",
          errorCode: !detailedResult.success ? detailedResult.errorCode : "unknown",
          riskLevel: !detailedResult.success ? detailedResult.riskAssessment?.riskLevel : "unknown",
          traceId,
        });
        return { success: false, details: detailedResult, traceId };
      }

      logger.info("Turnstile验证成功，直接通过", {
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
        traceId,
      });
    }

    doc.verified = true;
    doc.updatedAt = new Date();
    await doc.save();

    const accessToken = await generateAccessToken(validatedFingerprint, validatedIp);

    logger.info("临时指纹验证成功，已生成访问密钥", {
      fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
      ipAddress: validatedIp,
      accessToken: `${accessToken.substring(0, 8)}...`,
      traceId,
    });

    const riskAssessmentFinal = assessClientRisk(validatedIp, userAgent, validatedFingerprint);
    await persistTurnstileTrace({
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

    await persistTurnstileTrace({
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
