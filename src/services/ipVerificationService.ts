import crypto from "node:crypto";
import { isIP } from "node:net";
import axios from "axios";
import { config } from "../config/config";
import { IpVerificationTokenModel } from "../models/ipVerificationTokenModel";
import { IpqsLookupLogModel } from "../models/ipqsLookupLogModel";
import { IpqsQuotaModel, type IpqsQuotaDoc } from "../models/ipqsQuotaModel";
import { connectMongo, mongoose } from "./mongoService";
import { TurnstileService } from "./turnstileService";
import logger from "../utils/logger";
import {
  buildScamalyticsLookupUrl,
  normalizeScamalyticsUser,
} from "../utils/scamalytics";

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
  return crypto
    .pbkdf2Sync(apiKey, `ipqs:${config.jwtSecret}`, 120_000, 16, "sha256")
    .toString("hex");
}

function extractRiskFlags(response: ScamalyticsResponse): string[] {
  const flags: string[] = [];
  const proxy = response.scamalytics.scamalytics_proxy;
  if (proxy.is_datacenter) flags.push("datacenter");
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
  const requiresVerification =
    fraudScore >= config.ipqs.challengeFraudScore || riskFlags.length > 0;

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

function toLookupLogRawResponse(
  response?: ScamalyticsResponse,
): Record<string, unknown> | undefined {
  return response ? { ...response } : undefined;
}

async function ensureMongoIfEnabled(): Promise<boolean> {
  try {
    await connectMongo();
    return mongoose.connection.readyState === 1;
  } catch (error) {
    logger.warn("[IpVerification] MongoDB unavailable", error);
    return false;
  }
}

export class IpVerificationService {
  private static getVerifyTtlMs(): number {
    return config.ipqs.tokenTtlMinutes * 60 * 1000;
  }

  private static getApiKeys(): string[] {
    return Array.from(new Set(config.ipqs.apiKeys.map((item) => item.trim()).filter(Boolean)));
  }

  private static async getReusableToken(
    fingerprint: string,
    ipAddress: string,
  ): Promise<any | null> {
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

  private static async selectApiKey(month: string): Promise<{ slot: number; key: string } | null> {
    const apiKeys = IpVerificationService.getApiKeys();
    if (apiKeys.length === 0) return null;

    if (!(await ensureMongoIfEnabled())) return null;

    const quotaDocs = await IpqsQuotaModel.find({ monthKey: month }).lean().exec();
    const quotaMap = new Map<number, number>();

    quotaDocs.forEach((doc: IpqsQuotaDoc) => {
      quotaMap.set(doc.apiKeySlot, Number(doc.usageCount || 0));
    });

    for (let index = 0; index < apiKeys.length; index += 1) {
      const usageCount = quotaMap.get(index) || 0;
      if (usageCount < config.ipqs.monthlyQuotaPerKey) {
        return { slot: index, key: apiKeys[index] };
      }
    }

    return null;
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
        { upsert: true, new: true },
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
      recentAbuse: response?.scamalytics.scamalytics_risk === "high" || response?.scamalytics.scamalytics_risk === "very high",
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
    const selectedKey = await IpVerificationService.selectApiKey(month);
    const scamalyticsUser = normalizeScamalyticsUser(
      config.ipqs.scamalyticsUser,
    );

    if (!selectedKey && config.ipqs.apiKeys.length > 0) {
      const exhaustedDecision: LookupDecision = {
        success: config.ipqs.failOpen,
        requiresVerification: false,
        decision: config.ipqs.failOpen ? "skip" : "error",
        reason: "ip_verification_quota_exhausted",
        riskFlags: [],
      };
      await IpVerificationService.logLookup(month, -1, "quota-exhausted", context, exhaustedDecision);
      return exhaustedDecision;
    }

    // If no keys are configured but scamalyticsUser is, we might still want to proceed if we hardcode a key or use the one provided
    const apiKey = selectedKey?.key || config.ipqs.apiKeys[0]?.trim();
    const slot = selectedKey?.slot ?? 0;
    const scamalyticsUrl = buildScamalyticsLookupUrl(scamalyticsUser);

    try {
      const response = await axios.get<ScamalyticsResponse>(
        scamalyticsUrl,
        {
          params: {
            key: apiKey,
            ip: context.ipAddress,
          },
          timeout: config.ipqs.timeoutMs,
          maxRedirects: 0,
        }
      );

      if (selectedKey) {
        await IpVerificationService.incrementQuota(month, selectedKey.slot, selectedKey.key);
      }
      
      const decision = shouldRequireVerification(response.data);

      await IpVerificationService.logLookup(
        month,
        slot,
        hashApiKey(apiKey),
        context,
        decision,
        response.data,
      );

      logger.info("[IpVerification] Scamalytics lookup completed", {
        ipAddress: context.ipAddress,
        fingerprint: `${context.fingerprint.slice(0, 8)}...`,
        decision: decision.decision,
        fraudScore: decision.fraudScore,
        riskFlags: decision.riskFlags,
      });

      return decision;
    } catch (error) {
      if (selectedKey) {
        await IpVerificationService.incrementQuota(month, selectedKey.slot, selectedKey.key);
      }

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

    if (!config.ipqs.enabled) {
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

    return IpVerificationService.issueToken(
      fingerprint,
      ipAddress,
      captchaType,
      undefined,
      [],
    );
  }

  public static async verifyRequestToken(
    tokenInput: string,
    fingerprintInput: string,
    ipAddressInput: string,
  ): Promise<boolean> {
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

    doc.lastValidatedAt = new Date();
    await doc.save();
    return true;
  }
}

export default IpVerificationService;
