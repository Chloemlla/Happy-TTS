import crypto from "node:crypto";
import { isIP } from "node:net";
import axios from "axios";
import { config } from "../config/config";
import { IpqsLookupLogModel } from "../models/ipqsLookupLogModel";
import { type IpqsQuotaDoc, IpqsQuotaModel } from "../models/ipqsQuotaModel";
import { IpVerificationTokenModel } from "../models/ipVerificationTokenModel";
import logger from "../utils/logger";
import { buildScamalyticsLookupUrl, normalizeScamalyticsUser } from "../utils/scamalytics";
import { mongoose } from "./mongoService";
import { TurnstileService } from "./turnstileService";
interface ScamalyticsResponse {
  scamalytics: {
    status: string;
    credits: number;
    exec: string;
    scamalytics_score: number;
    scamalytics_risk: string;
    scamalytics_isp: string;
    scamalytics_org: string;
    scamalytics_proxy: {
      is_datacenter: boolean;
      is_vpn: boolean;
      is_google: boolean;
      is_apple: boolean;
      is_icloud_relay: boolean;
    };
  };
  external_datasources?: {
    [key: string]: unknown;
  };
}

type LegacyIpRiskResponse = {
  fraud_score?: number;
  proxy?: boolean;
  vpn?: boolean;
  tor?: boolean;
  active_vpn?: boolean;
  active_tor?: boolean;
  recent_abuse?: boolean;
  bot_status?: boolean;
  request_id?: string;
};

interface LookupContext {
  fingerprint: string;
  ipAddress: string;
  userAgent?: string;
  userLanguage?: string;
}

interface LookupDecision {
  success: boolean;
  requiresVerification: boolean;
  decision: "allow" | "challenge" | "skip" | "error";
  reason: string;
  fraudScore?: number;
  riskFlags: string[];
  requestId?: string;
}

export interface IpVerificationSessionResult {
  success: boolean;
  verified: boolean;
  requiresVerification: boolean;
  fingerprint: string;
  ipAddress: string;
  token?: string;
  expiresAt?: string;
  issuedBy?: "auto" | "turnstile" | "hcaptcha";
  reason?: string;
  fraudScore?: number;
  riskFlags?: string[];
  tokenTtlMinutes: number;
}

function normalizeFingerprint(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const value = input.trim().slice(0, 200);
  if (value.length < 8) return null;
  return /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;
}

function normalizeIpAddress(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (isIP(trimmed)) return trimmed;
  if (trimmed.startsWith("::ffff:")) {
    const nested = trimmed.slice(7);
    return isIP(nested) ? nested : null;
  }
  return null;
}

function maskToken(token: string): string {
  return token.length > 10 ? `${token.slice(0, 8)}...` : token;
}

function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function hashApiKey(apiKey: string): string {
  // G5-14: 该哈希仅用于给配额/日志打"这是哪个 key"的标识，不需要口令级 KDF。
  // 改用 HMAC-SHA256，避免 pbkdf2Sync 12 万次迭代阻塞事件循环。
  const secret = config.jwtSecret || process.env.JWT_SECRET || "ip-verification-test-secret";
  // codeql[js/insufficient-password-hash] HMAC identifier digest (server-secret keyed) of a server-generated high-entropy apiKey, not a password hash (see G5-14)
  return crypto.createHmac("sha256", secret).update(`ipqs:${apiKey}`).digest("hex").slice(0, 32);
}

function normalizeRiskLookupResponse(response: ScamalyticsResponse | LegacyIpRiskResponse): ScamalyticsResponse {
  if ((response as ScamalyticsResponse).scamalytics) {
    return response as ScamalyticsResponse;
  }

  const legacy = response as LegacyIpRiskResponse;
  const score = Number(legacy.fraud_score || 0);
  const highRisk = score >= config.ipqs.challengeFraudScore || Boolean(legacy.proxy || legacy.vpn || legacy.tor);

  return {
    scamalytics: {
      status: "ok",
      credits: 0,
      exec: legacy.request_id || "",
      scamalytics_score: score,
      scamalytics_risk: highRisk ? "high" : "low",
      scamalytics_isp: "",
      scamalytics_org: "",
      scamalytics_proxy: {
        is_datacenter: Boolean(legacy.proxy),
        is_vpn: Boolean(legacy.vpn || legacy.active_vpn),
        is_google: false,
        is_apple: false,
        is_icloud_relay: false,
      },
    },
    external_datasources: {
      legacy,
    },
  };
}

function extractRiskFlags(response: ScamalyticsResponse): string[] {
  const flags: string[] = [];
  const proxy = response.scamalytics.scamalytics_proxy;
  if (proxy.is_datacenter) flags.push("proxy", "datacenter");
  if (proxy.is_vpn) flags.push("vpn");
  if (proxy.is_icloud_relay) flags.push("icloud_relay");

  // We can also check external datasources if needed, but Scamalytics' own assessment is usually enough
  if (response.scamalytics.scamalytics_risk === "high" || response.scamalytics.scamalytics_risk === "very high") {
    flags.push("high_risk");
  }

  return flags;
}

function shouldRequireVerification(response: ScamalyticsResponse): LookupDecision {
  const fraudScore = Number(response.scamalytics.scamalytics_score || 0);
  const riskFlags = extractRiskFlags(response);
  const requiresVerification = fraudScore >= config.ipqs.challengeFraudScore || riskFlags.length > 0;

  return {
    success: true,
    requiresVerification,
    decision: requiresVerification ? "challenge" : "allow",
    reason: requiresVerification
      ? `fraud_score=${fraudScore};flags=${riskFlags.join(",") || "none"}`
      : "risk_check_passed",
    fraudScore,
    riskFlags,
    requestId: response.scamalytics.exec,
  };
}

function toLookupLogRawResponse(response?: ScamalyticsResponse): Record<string, unknown> | undefined {
  return response ? { ...response } : undefined;
}

async function ensureMongoIfEnabled(): Promise<boolean> {
  // G5-04: 纯只读探测，不再每次调用 connectMongo()（正常时避免全量配置重载，
  // Mongo 故障时避免每请求 ~19s 阻塞与连接风暴）。建连职责交给启动流程。
  return mongoose.connection.readyState === 1;
}

export class IpVerificationService {
  private static getVerifyTtlMs(): number {
    return config.ipqs.tokenTtlMinutes * 60 * 1000;
  }

  private static getApiKeys(): string[] {
    // G5-23: 去掉 env 合并。env 值只应经由 runtimeConfigDefaults 进入（"DB 未配置时才用 env"），
    // 否则管理员在后台删掉泄露的 key，env 里的旧 key 仍被选中，界面显示与实际不一致。
    const configuredKeys = Array.isArray(config.ipqs.apiKeys) ? config.ipqs.apiKeys : [];
    return Array.from(new Set(configuredKeys.map((item) => item?.trim()).filter(Boolean) as string[]));
  }

  private static async getReusableToken(fingerprint: string, ipAddress: string): Promise<any | null> {
    if (!(await ensureMongoIfEnabled())) return null;

    return IpVerificationTokenModel.findOne({
      fingerprint,
      ipAddress,
      expiresAt: { $gt: new Date() },
    })
      .sort({ expiresAt: -1 })
      .exec();
  }

  private static async issueToken(
    fingerprint: string,
    ipAddress: string,
    issuedBy: "auto" | "turnstile" | "hcaptcha",
    fraudScore?: number,
    riskFlags: string[] = [],
  ): Promise<IpVerificationSessionResult> {
    if (!(await ensureMongoIfEnabled())) {
      return {
        success: false,
        verified: false,
        requiresVerification: false,
        fingerprint,
        ipAddress,
        reason: "database_unavailable",
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + IpVerificationService.getVerifyTtlMs());

    await IpVerificationTokenModel.deleteMany({
      fingerprint,
      ipAddress,
    }).exec();

    await IpVerificationTokenModel.create({
      token,
      fingerprint,
      ipAddress,
      issuedBy,
      challengePassed: issuedBy !== "auto",
      fraudScore,
      riskFlags,
      expiresAt,
      lastValidatedAt: new Date(),
    });

    logger.info("[IpVerification] Issued session token", {
      fingerprint: `${fingerprint.slice(0, 8)}...`,
      ipAddress,
      issuedBy,
      fraudScore,
      riskFlags,
      token: maskToken(token),
      expiresAt,
    });

    return {
      success: true,
      verified: true,
      requiresVerification: false,
      fingerprint,
      ipAddress,
      token,
      expiresAt: expiresAt.toISOString(),
      issuedBy,
      fraudScore,
      riskFlags,
      tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
    };
  }

  private static async selectApiKey(
    month: string,
  ): Promise<
    | { status: "ok"; slot: number; key: string }
    | { status: "no_keys" }
    | { status: "database_unavailable" }
    | { status: "quota_exhausted" }
  > {
    const apiKeys = IpVerificationService.getApiKeys();
    if (apiKeys.length === 0) return { status: "no_keys" };

    if (!(await ensureMongoIfEnabled())) return { status: "database_unavailable" };

    const quotaDocs = await IpqsQuotaModel.find({ monthKey: month }).lean().exec();
    const quotaMap = new Map<number, number>();

    quotaDocs.forEach((doc: IpqsQuotaDoc) => {
      quotaMap.set(doc.apiKeySlot, Number(doc.usageCount || 0));
    });

    for (let index = 0; index < apiKeys.length; index += 1) {
      const usageCount = quotaMap.get(index) || 0;
      if (usageCount < config.ipqs.monthlyQuotaPerKey) {
        return { status: "ok", slot: index, key: apiKeys[index] };
      }
    }

    return { status: "quota_exhausted" };
  }

  private static async incrementQuota(month: string, slot: number, apiKey: string): Promise<void> {
    if (!(await ensureMongoIfEnabled())) return;

    const usageCount = (
      await IpqsQuotaModel.findOneAndUpdate(
        { monthKey: month, apiKeySlot: slot },
        {
          $setOnInsert: { apiKeyHash: hashApiKey(apiKey) },
          $inc: { usageCount: 1 },
          $set: { lastUsedAt: new Date() },
        },
        { upsert: true, returnDocument: "after" },
      ).lean()
    )?.usageCount;

    if ((usageCount || 0) >= config.ipqs.monthlyQuotaPerKey) {
      await IpqsQuotaModel.updateOne(
        { monthKey: month, apiKeySlot: slot },
        { $set: { exhaustedAt: new Date() } },
      ).exec();
    }
  }

  private static async logLookup(
    month: string,
    slot: number,
    apiKeyHashValue: string,
    context: LookupContext,
    decision: LookupDecision,
    response?: ScamalyticsResponse,
    errorMessage?: string,
  ): Promise<void> {
    if (!(await ensureMongoIfEnabled())) return;

    await IpqsLookupLogModel.create({
      monthKey: month,
      apiKeySlot: slot,
      apiKeyHash: apiKeyHashValue,
      ipAddress: context.ipAddress,
      fingerprint: context.fingerprint,
      userAgent: context.userAgent,
      userLanguage: context.userLanguage,
      requestId: decision.requestId,
      success: decision.success,
      decision: decision.decision,
      reason: decision.reason,
      fraudScore: decision.fraudScore,
      proxy: response?.scamalytics.scamalytics_proxy.is_datacenter || response?.scamalytics.scamalytics_proxy.is_vpn,
      vpn: response?.scamalytics.scamalytics_proxy.is_vpn,
      tor: false, // Scamalytics includes TOR in proxy or risk if enabled
      activeVpn: response?.scamalytics.scamalytics_proxy.is_vpn,
      activeTor: false,
      recentAbuse:
        response?.scamalytics.scamalytics_risk === "high" || response?.scamalytics.scamalytics_risk === "very high",
      botStatus: false,
      strictness: config.ipqs.strictness,
      rawResponse: toLookupLogRawResponse(response),
      errorMessage,
      createdAt: new Date(),
    });
  }

  private static async lookupIpqs(context: LookupContext): Promise<LookupDecision> {
    if (!config.ipqs.enabled) {
      return {
        success: true,
        requiresVerification: false,
        decision: "skip",
        reason: "ip_verification_disabled",
        riskFlags: [],
      };
    }

    const month = monthKey();
    const selected = await IpVerificationService.selectApiKey(month);
    const scamalyticsUser = normalizeScamalyticsUser(config.ipqs.scamalyticsUser);

    // G5-15: 区分"未配置 key"、"配额耗尽"与"Mongo 不可用"，不再把库不可用误报成配额耗尽。
    if (selected.status === "no_keys" || selected.status === "quota_exhausted") {
      const exhaustedDecision: LookupDecision = {
        success: config.ipqs.failOpen,
        requiresVerification: false,
        decision: config.ipqs.failOpen ? "skip" : "error",
        reason:
          selected.status === "quota_exhausted" ? "ip_verification_quota_exhausted" : "ip_verification_not_configured",
        riskFlags: [],
      };
      await IpVerificationService.logLookup(
        month,
        -1,
        selected.status === "quota_exhausted" ? "quota-exhausted" : "not-configured",
        context,
        exhaustedDecision,
      );
      return exhaustedDecision;
    }

    if (selected.status === "database_unavailable") {
      const dbErrorDecision: LookupDecision = {
        success: config.ipqs.failOpen,
        requiresVerification: false,
        decision: config.ipqs.failOpen ? "skip" : "error",
        reason: "ip_verification_database_unavailable",
        riskFlags: [],
      };
      await IpVerificationService.logLookup(month, -1, "database-unavailable", context, dbErrorDecision);
      return dbErrorDecision;
    }

    // 走到这里 selected.status === "ok"
    const apiKey = selected.key;
    const slot = selected.slot;
    const scamalyticsUrl = buildScamalyticsLookupUrl(scamalyticsUser);

    try {
      const response = await axios.get<ScamalyticsResponse | LegacyIpRiskResponse>(scamalyticsUrl, {
        params: {
          key: apiKey,
          ip: context.ipAddress,
        },
        timeout: config.ipqs.timeoutMs,
        maxRedirects: 0,
      });

      // G5-15: 只在上游真正返回业务响应时计入配额；网络错误/超时不计费。
      await IpVerificationService.incrementQuota(month, slot, apiKey);

      const normalizedResponse = normalizeRiskLookupResponse(response.data);
      const decision = shouldRequireVerification(normalizedResponse);

      await IpVerificationService.logLookup(month, slot, hashApiKey(apiKey), context, decision, normalizedResponse);

      logger.info("[IpVerification] Scamalytics lookup completed", {
        ipAddress: context.ipAddress,
        fingerprint: `${context.fingerprint.slice(0, 8)}...`,
        decision: decision.decision,
        fraudScore: decision.fraudScore,
        riskFlags: decision.riskFlags,
      });

      return decision;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failedDecision: LookupDecision = {
        success: config.ipqs.failOpen,
        requiresVerification: false,
        decision: config.ipqs.failOpen ? "skip" : "error",
        reason: "ip_verification_lookup_failed",
        riskFlags: [],
      };

      await IpVerificationService.logLookup(
        month,
        slot,
        hashApiKey(apiKey),
        context,
        failedDecision,
        undefined,
        errorMessage,
      );

      logger.warn("[IpVerification] Scamalytics lookup failed", {
        ipAddress: context.ipAddress,
        error: errorMessage,
        failOpen: config.ipqs.failOpen,
      });

      return failedDecision;
    }
  }

  public static async initializeSession(context: LookupContext): Promise<IpVerificationSessionResult> {
    const fingerprint = normalizeFingerprint(context.fingerprint);
    const ipAddress = normalizeIpAddress(context.ipAddress);

    if (!fingerprint || !ipAddress) {
      return {
        success: false,
        verified: false,
        requiresVerification: false,
        fingerprint: context.fingerprint,
        ipAddress: context.ipAddress,
        reason: "invalid_fingerprint_or_ip",
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    if (config.enableFirstVisitVerification === false || !config.ipqs.enabled) {
      return {
        success: true,
        verified: true,
        requiresVerification: false,
        fingerprint,
        ipAddress,
        issuedBy: "auto",
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    const reusableToken = await IpVerificationService.getReusableToken(fingerprint, ipAddress);
    if (reusableToken) {
      return {
        success: true,
        verified: true,
        requiresVerification: false,
        fingerprint,
        ipAddress,
        token: reusableToken.token,
        expiresAt: reusableToken.expiresAt.toISOString(),
        issuedBy: reusableToken.issuedBy,
        fraudScore: reusableToken.fraudScore,
        riskFlags: reusableToken.riskFlags || [],
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    const lookupDecision = await IpVerificationService.lookupIpqs({
      fingerprint,
      ipAddress,
      userAgent: context.userAgent,
      userLanguage: context.userLanguage,
    });

    if (!lookupDecision.success && !config.ipqs.failOpen) {
      return {
        success: false,
        verified: false,
        requiresVerification: false,
        fingerprint,
        ipAddress,
        reason: lookupDecision.reason,
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    if (lookupDecision.requiresVerification) {
      return {
        success: true,
        verified: false,
        requiresVerification: true,
        fingerprint,
        ipAddress,
        reason: lookupDecision.reason,
        fraudScore: lookupDecision.fraudScore,
        riskFlags: lookupDecision.riskFlags,
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    return IpVerificationService.issueToken(
      fingerprint,
      ipAddress,
      "auto",
      lookupDecision.fraudScore,
      lookupDecision.riskFlags,
    );
  }

  public static async completeVerification(
    fingerprintInput: string,
    ipAddressInput: string,
    captchaToken: string,
    userAgent?: string,
    captchaType: "turnstile" | "hcaptcha" = "turnstile",
  ): Promise<IpVerificationSessionResult> {
    const fingerprint = normalizeFingerprint(fingerprintInput);
    const ipAddress = normalizeIpAddress(ipAddressInput);

    if (!fingerprint || !ipAddress || !captchaToken) {
      return {
        success: false,
        verified: false,
        requiresVerification: true,
        fingerprint: fingerprintInput,
        ipAddress: ipAddressInput,
        reason: "invalid_verification_payload",
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    const captchaResult = await TurnstileService.verifyTokenDetailed(
      captchaToken,
      ipAddress,
      userAgent,
      fingerprint,
      captchaType,
    );

    if (!captchaResult.success) {
      return {
        success: false,
        verified: false,
        requiresVerification: true,
        fingerprint,
        ipAddress,
        reason: captchaResult.errorCode || captchaResult.reason || "captcha_verification_failed",
        tokenTtlMinutes: config.ipqs.tokenTtlMinutes,
      };
    }

    return IpVerificationService.issueToken(fingerprint, ipAddress, captchaType, undefined, []);
  }

  public static async verifyRequestToken(
    tokenInput: string,
    fingerprintInput: string,
    ipAddressInput: string,
  ): Promise<boolean> {
    if (config.enableFirstVisitVerification === false || !config.ipqs.enabled) {
      return true;
    }

    const token = tokenInput?.trim();
    const fingerprint = normalizeFingerprint(fingerprintInput);
    const ipAddress = normalizeIpAddress(ipAddressInput);

    if (!token || !fingerprint || !ipAddress) return false;
    if (!(await ensureMongoIfEnabled())) return false;

    const doc = await IpVerificationTokenModel.findOne({
      token,
      fingerprint,
      ipAddress,
      expiresAt: { $gt: new Date() },
    }).exec();

    if (!doc) return false;

    // G5-14: lastValidatedAt 节流更新（距上次超过 60 秒才写），避免每个受保护请求多一次 Mongo 写。
    const lastValidatedAt = doc.lastValidatedAt ? new Date(doc.lastValidatedAt).getTime() : 0;
    if (!lastValidatedAt || Date.now() - lastValidatedAt > 60_000) {
      doc.lastValidatedAt = new Date();
      await doc.save();
    }
    return true;
  }
}

export default IpVerificationService;
