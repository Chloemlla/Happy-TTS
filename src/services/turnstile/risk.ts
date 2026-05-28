import logger from "../../utils/logger";
import type { RiskAssessmentDetail } from "./types";

export function assessClientRisk(ip: string, userAgent?: string, fingerprint?: string): RiskAssessmentDetail {
  const reasons: string[] = [];
  let score = 0;
  const scoreBreakdown: any = {
    baseScore: 0,
    ipScore: 0,
    userAgentScore: 0,
    fingerprintScore: 0,
    devMultiplier: 1,
    finalScore: 0,
    userAgentSkipped: false,
  };

  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.")
  ) {
    scoreBreakdown.ipScore = 0.05;
    scoreBreakdown.ipType = "local";
    score += 0.05;
    reasons.push("本地IP");
  } else {
    scoreBreakdown.ipScore = 0.15;
    scoreBreakdown.ipType = "public";
    score += 0.15;
    reasons.push("公网IP");
  }

  if (userAgent) {
    const ua = userAgent.toLowerCase();
    if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider")) {
      scoreBreakdown.userAgentScore = 0.4;
      scoreBreakdown.userAgentType = "bot";
      score += 0.4;
      reasons.push("疑似机器人用户代理");
    } else if (ua.includes("curl") || ua.includes("wget") || ua.includes("python")) {
      scoreBreakdown.userAgentScore = 0.6;
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
      scoreBreakdown.userAgentScore = 0.2;
      scoreBreakdown.userAgentType = "unusual";
      score += 0.2;
      reasons.push("异常用户代理");
    } else {
      scoreBreakdown.userAgentScore = 0;
      scoreBreakdown.userAgentType = "normal";
    }
  } else {
    scoreBreakdown.userAgentScore = 0.2;
    scoreBreakdown.userAgentType = "missing";
    score += 0.2;
    reasons.push("缺少用户代理信息");
  }

  if (!fingerprint || fingerprint.length < 8) {
    scoreBreakdown.fingerprintScore = 0.1;
    scoreBreakdown.fingerprintStatus = "invalid_or_missing";
    score += 0.1;
    reasons.push("无效或缺失浏览器指纹");
  } else {
    scoreBreakdown.fingerprintScore = 0;
    scoreBreakdown.fingerprintStatus = "valid";
  }

  scoreBreakdown.baseScore = score;
  scoreBreakdown.finalScore = Math.min(score, 1);

  let riskLevel: "low" | "medium" | "high";
  if (score >= 0.8) {
    riskLevel = "high";
  } else if (score >= 0.5) {
    riskLevel = "medium";
  } else {
    riskLevel = "low";
  }

  scoreBreakdown.thresholds = { high: 0.8, medium: 0.5, low: 0 };

  const finalScore = Math.min(score, 1);
  if (finalScore > 0 && reasons.length === 0) {
    reasons.push("基础风险评分");
  }

  return { riskLevel, riskScore: finalScore, riskReasons: reasons, scoreBreakdown };
}

export function recordVerificationOutcome(
  ip: string,
  _userAgent: string | undefined,
  success: boolean,
  timestamp: Date,
  fingerprint?: string,
): void {
  try {
    const outcome = success ? "成功" : "失败";
    logger.info(`[Turnstile] 验证${outcome}`, {
      ip,
      fingerprint: fingerprint?.substring(0, 16),
      timestamp: timestamp.toISOString(),
      success,
      userAgentSkipped: true,
    });
  } catch (error) {
    logger.error("[Turnstile] 记录验证结果失败", error);
  }
}

export function translateTurnstileErrors(errorCodes: string[]): string[] {
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
