import axios from "axios";
import logger from "../../utils/logger";
import { mongoose } from "../mongoService";
import { HCAPTCHA_VERIFY_URL } from "./constants";
import { getHCaptchaKey, HCaptchaSettingModel } from "./models";
import { assessClientRisk, recordVerificationOutcome } from "./risk";
import { generateUniqueTraceId, persistTurnstileTrace } from "./trace";
import type { HCaptchaResponse } from "./types";
import { validateConfigValue, validateToken } from "./validators";

export async function verifyHCaptchaToken(token: string, remoteIp?: string, siteKey?: string): Promise<boolean> {
  const traceId = generateUniqueTraceId();

  try {
    const validatedToken = validateToken(token);

    if (!validatedToken) {
      logger.warn("hCaptcha token 验证失败：输入参数无效", { tokenLength: token?.length, traceId });

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
        verificationMethod: "hcaptcha",
      });

      return false;
    }

    const secretKey = await getHCaptchaKey("HCAPTCHA_SECRET_KEY");

    if (!secretKey) {
      logger.warn("hCaptcha 密钥未配置，跳过验证", { traceId });

      const riskAssessmentBasic = assessClientRisk(remoteIp || "unknown", undefined, undefined);
      await persistTurnstileTrace({
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

    const response = await axios.post<HCaptchaResponse>(HCAPTCHA_VERIFY_URL, formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });

    const result = response.data;
    const now = new Date();

    if (!result.success) {
      recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

      logger.warn("hCaptcha 验证失败", {
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
        errorMessage: `hCaptcha验证失败: ${result["error-codes"]?.join(", ") || "unknown"}`,
        fingerprint: undefined,
        riskLevel: riskAssessmentFail.riskLevel,
        riskScore: riskAssessmentFail.riskScore,
        riskReasons: riskAssessmentFail.riskReasons,
        verificationMethod: "hcaptcha",
      });

      return false;
    }

    recordVerificationOutcome(remoteIp || "unknown", undefined, true, now);

    logger.info("hCaptcha 验证成功", {
      remoteIp,
      timestamp: result.challenge_ts,
      hostname: result.hostname,
      score: result.score,
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
      verificationMethod: "hcaptcha",
    });

    return true;
  } catch (error) {
    const now = new Date();
    recordVerificationOutcome(remoteIp || "unknown", undefined, false, now);

    logger.error("hCaptcha 验证请求失败", {
      error: error instanceof Error ? error.message : "Unknown error",
      remoteIp,
      traceId,
      requestUrl: HCAPTCHA_VERIFY_URL,
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
      verificationMethod: "hcaptcha",
    });

    return false;
  }
}

export async function isHCaptchaEnabled(): Promise<boolean> {
  const secretKey = await getHCaptchaKey("HCAPTCHA_SECRET_KEY");
  return !!secretKey;
}

export async function getHCaptchaConfig(): Promise<{
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
}> {
  const [secretKey, siteKey] = await Promise.all([
    getHCaptchaKey("HCAPTCHA_SECRET_KEY"),
    getHCaptchaKey("HCAPTCHA_SITE_KEY"),
  ]);

  return { enabled: !!secretKey, siteKey, secretKey };
}

export async function updateHCaptchaConfig(
  key: "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY",
  value: string,
): Promise<boolean> {
  try {
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

    if (key === "HCAPTCHA_SECRET_KEY") {
      await HCaptchaSettingModel.findOneAndUpdate(
        { key: "HCAPTCHA_SECRET_KEY" },
        { key: "HCAPTCHA_SECRET_KEY", value: validatedValue, updatedAt: new Date() },
        { upsert: true, returnDocument: "after" },
      );
    } else if (key === "HCAPTCHA_SITE_KEY") {
      await HCaptchaSettingModel.findOneAndUpdate(
        { key: "HCAPTCHA_SITE_KEY" },
        { key: "HCAPTCHA_SITE_KEY", value: validatedValue, updatedAt: new Date() },
        { upsert: true, returnDocument: "after" },
      );
    } else {
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

export async function deleteHCaptchaConfig(key: "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY"): Promise<boolean> {
  try {
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
