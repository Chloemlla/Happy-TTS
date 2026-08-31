import type { Request } from "express";
import { DeviceTracking } from "../models/deviceTrackingModel";
import { SecurityEvent } from "../models/securityEventModel";
import logger from "../utils/logger";

export interface DeviceSecurityHeaders {
  deviceFingerprint?: string;
  appVersion?: string;
  appBuild?: string;
  riskScore: number;
  riskLevel: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isCompromised: boolean;
  isRoot: boolean;
  isDebugger: boolean;
  isEmulator: boolean;
  isVpn: boolean;
  isAdbEnabled: boolean;
  isDevelopmentSettingsEnabled: boolean;
  isDebugBuild: boolean;
  isTracerAttached: boolean;
  antiDebugScore: number;
  signatureValid: boolean;
  hashValid: boolean;
}

export type RiskStrategy = "NORMAL" | "MONITOR" | "RESTRICT" | "HONEYPOT" | "BLOCK";

/**
 * Extract security headers from request
 */
function parseFlagHeader(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseScoreHeader(value: unknown, fallback = 0): number {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

const RISK_LEVELS = ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

/**
 * G7-13: risk score is a client-reported integer on a 0..100 scale. Clamp it so
 * negative or absurd values cannot silently downgrade a device to NORMAL.
 */
function parseRiskScoreHeader(value: unknown): number {
  if (typeof value !== "string" || value.trim() === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function extractSecurityHeaders(req: Request): DeviceSecurityHeaders {
  const riskScore = parseRiskScoreHeader(req.headers["x-device-risk-score"]);
  const antiDebugScore = parseScoreHeader(req.headers["x-device-anti-debug-score"], 0);
  const isDebugger = parseFlagHeader(req.headers["x-device-debugger"]);
  const isAdbEnabled = parseFlagHeader(req.headers["x-device-adb"]);
  const isDevelopmentSettingsEnabled = parseFlagHeader(req.headers["x-device-dev-settings"]);
  const isDebugBuild = parseFlagHeader(req.headers["x-device-debug-build"]);
  const isTracerAttached = parseFlagHeader(req.headers["x-device-tracer"]);
  const isCompromised =
    parseFlagHeader(req.headers["x-device-compromised"]) ||
    isTracerAttached ||
    antiDebugScore >= 0.5;

  // G7-13: repeated headers arrive as string[] — never trust them as a plain
  // string (it would corrupt the (userId, deviceFingerprint) upsert key).
  const rawFingerprint = req.headers["x-device-fingerprint"];
  const deviceFingerprint =
    typeof rawFingerprint === "string" ? rawFingerprint : Array.isArray(rawFingerprint) ? rawFingerprint[0] : undefined;
  const rawAppVersion = req.headers["x-app-version"];
  const appVersion = typeof rawAppVersion === "string" ? rawAppVersion : Array.isArray(rawAppVersion) ? rawAppVersion[0] : undefined;
  const rawAppBuild = req.headers["x-app-build"];
  const appBuild = typeof rawAppBuild === "string" ? rawAppBuild : Array.isArray(rawAppBuild) ? rawAppBuild[0] : undefined;

  // G7-13: riskLevel must be one of the known enums; an arbitrary string would
  // be persisted verbatim and could reach an admin UI (stored XSS) or skew
  // risk-level aggregations.
  const rawRiskLevel = req.headers["x-device-risk-level"];
  const riskLevelHeader = typeof rawRiskLevel === "string" ? rawRiskLevel : Array.isArray(rawRiskLevel) ? rawRiskLevel[0] : undefined;
  const riskLevel =
    riskLevelHeader && (RISK_LEVELS as readonly string[]).includes(riskLevelHeader)
      ? (riskLevelHeader as DeviceSecurityHeaders["riskLevel"])
      : getRiskLevelFromScore(riskScore);

  return {
    deviceFingerprint,
    appVersion,
    appBuild,
    riskScore,
    riskLevel,
    isCompromised,
    isRoot: parseFlagHeader(req.headers["x-device-root"]),
    isDebugger,
    isEmulator: parseFlagHeader(req.headers["x-device-emulator"]),
    isVpn: parseFlagHeader(req.headers["x-device-vpn"]),
    isAdbEnabled,
    isDevelopmentSettingsEnabled,
    isDebugBuild,
    isTracerAttached,
    antiDebugScore,
    signatureValid: parseFlagHeader(req.headers["x-device-signature-valid"]),
    hashValid: parseFlagHeader(req.headers["x-device-hash-valid"]),
  };
}

/**
 * Convert risk score to risk level
 */
function getRiskLevelFromScore(score: number): "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 80) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 30) return "MEDIUM";
  if (score >= 10) return "LOW";
  return "SAFE";
}

/**
 * Determine risk strategy based on headers
 */
export function getRiskStrategy(headers: DeviceSecurityHeaders): RiskStrategy {
  const {
    riskScore,
    isCompromised,
    isDebugger,
    isTracerAttached,
    antiDebugScore,
    isAdbEnabled,
    isDebugBuild,
  } = headers;

  // Anti-debug enrichment: elevate strategy using native signals when present.
  const antiDebugElevated =
    isTracerAttached ||
    antiDebugScore >= 0.7 ||
    (isDebugger && (isAdbEnabled || isDebugBuild));

  if (riskScore >= 80 || (isCompromised && riskScore >= 50) || antiDebugScore >= 0.9) {
    return "BLOCK";
  }
  if (riskScore >= 50 || antiDebugElevated || antiDebugScore >= 0.5) {
    return "HONEYPOT";
  }
  if (riskScore >= 30 || isDebugger || isAdbEnabled || isDebugBuild) {
    return "RESTRICT";
  }
  if (riskScore >= 10 || antiDebugScore > 0) {
    return "MONITOR";
  }
  return "NORMAL";
}

/**
 * Track device information
 */
/**
 * Public clients self-report device headers. Never let unauthenticated
 * reports escalate to BLOCK/HONEYPOT solely from attacker-controlled headers.
 * Authenticated flows may still use getRiskStrategy for full enforcement.
 */
export function getPublicReportAction(headers: DeviceSecurityHeaders): "monitor" | "restrict" {
  const strategy = getRiskStrategy(headers);
  if (strategy === "RESTRICT" || strategy === "HONEYPOT" || strategy === "BLOCK") {
    return "restrict";
  }
  return "monitor";
}

export async function trackDevice(
  userId: string,
  headers: DeviceSecurityHeaders,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  try {
    if (!headers.deviceFingerprint) {
      logger.warn("Device tracking skipped: no device fingerprint");
      return;
    }

    const now = new Date();

    await DeviceTracking.findOneAndUpdate(
      {
        userId,
        deviceFingerprint: headers.deviceFingerprint,
      },
      {
        $set: {
          riskScore: headers.riskScore,
          riskLevel: headers.riskLevel,
          isCompromised: headers.isCompromised,
          isRoot: headers.isRoot,
          isDebugger: headers.isDebugger,
          isEmulator: headers.isEmulator,
          isVpn: headers.isVpn,
          isAdbEnabled: headers.isAdbEnabled,
          isDevelopmentSettingsEnabled: headers.isDevelopmentSettingsEnabled,
          isDebugBuild: headers.isDebugBuild,
          isTracerAttached: headers.isTracerAttached,
          antiDebugScore: headers.antiDebugScore,
          signatureValid: headers.signatureValid,
          hashValid: headers.hashValid,
          appVersion: headers.appVersion,
          appBuild: headers.appBuild,
          lastSeen: now,
          ipAddress,
          userAgent,
        },
        $setOnInsert: {
          firstSeen: now,
        },
        $inc: {
          requestCount: 1,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    logger.debug(`Device tracked: ${headers.deviceFingerprint} for user ${userId}`);
  } catch (error) {
    logger.error("Error tracking device:", error);
  }
}

/**
 * Record security event
 */
export async function recordSecurityEvent(
  deviceFingerprint: string,
  userId: string | undefined,
  eventType: string,
  eventData: Record<string, any>,
  riskScore: number,
  ipAddress: string,
  userAgent: string,
): Promise<void> {
  try {
    await SecurityEvent.create({
      deviceFingerprint,
      userId,
      eventType,
      eventData,
      riskScore,
      ipAddress,
      userAgent,
      createdAt: new Date(),
    });

    logger.info(`Security event recorded: ${eventType} for device ${deviceFingerprint}`);
  } catch (error) {
    logger.error("Error recording security event:", error);
  }
}

/**
 * Check for anomalies (multi-account, device switching, etc.)
 */
export async function detectAnomalies(
  deviceFingerprint: string,
  userId: string,
): Promise<{
  multiAccount: boolean;
  frequentDeviceSwitch: boolean;
  accountCount: number;
  deviceCount: number;
}> {
  try {
    // Check multi-account on same device
    const accountCount = await DeviceTracking.countDocuments({
      deviceFingerprint,
    });

    // Check frequent device switching (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deviceCount = await DeviceTracking.countDocuments({
      userId,
      lastSeen: { $gte: oneDayAgo },
    });

    return {
      multiAccount: accountCount > 5,
      frequentDeviceSwitch: deviceCount > 3,
      accountCount,
      deviceCount,
    };
  } catch (error) {
    logger.error("Error detecting anomalies:", error);
    return {
      multiAccount: false,
      frequentDeviceSwitch: false,
      accountCount: 0,
      deviceCount: 0,
    };
  }
}

/**
 * Get device status
 */
export async function getDeviceStatus(deviceFingerprint: string): Promise<{
  status: "normal" | "flagged" | "blocked";
  riskLevel: string;
  restrictions: string[];
  message: string;
} | null> {
  try {
    const device = await DeviceTracking.findOne({ deviceFingerprint }).sort({ lastSeen: -1 });

    if (!device) {
      return null;
    }

    const strategy = getRiskStrategy({
      deviceFingerprint,
      riskScore: device.riskScore,
      riskLevel: device.riskLevel,
      isCompromised: device.isCompromised,
      isRoot: device.isRoot,
      isDebugger: device.isDebugger,
      isEmulator: device.isEmulator,
      isVpn: device.isVpn,
      isAdbEnabled: Boolean((device as any).isAdbEnabled),
      isDevelopmentSettingsEnabled: Boolean((device as any).isDevelopmentSettingsEnabled),
      isDebugBuild: Boolean((device as any).isDebugBuild),
      isTracerAttached: Boolean((device as any).isTracerAttached),
      antiDebugScore: Number((device as any).antiDebugScore || 0),
      signatureValid: device.signatureValid,
      hashValid: device.hashValid,
    });

    const restrictions: string[] = [];
    let status: "normal" | "flagged" | "blocked" = "normal";
    let message = "Device is operating normally";

    // G7-13: the stored riskScore/riskLevel/signature flags below originate from
    // client-reported HTTP headers, so they are NOT trustworthy enough to issue
    // a hard BLOCK. Cap enforcement at "flagged/restrict" — an attacker can
    // always send clean headers, so BLOCK based on them would be both useless
    // and a way to (self-)DoS real users whose client misreports.
    if (strategy === "HONEYPOT" || strategy === "RESTRICT" || strategy === "BLOCK") {
      status = "flagged";
      restrictions.push("payment_disabled", "api_rate_limited");
      message = "Your device has been flagged due to security concerns";
    } else if (strategy === "MONITOR") {
      status = "flagged";
      message = "Your device is being monitored for security purposes";
    }

    return {
      status,
      riskLevel: device.riskLevel,
      restrictions,
      message,
    };
  } catch (error) {
    logger.error("Error getting device status:", error);
    return null;
  }
}

/**
 * Get high-risk device count in last hour
 */
export async function getHighRiskDeviceCount(): Promise<number> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return await DeviceTracking.countDocuments({
      riskScore: { $gte: 50 },
      lastSeen: { $gte: oneHourAgo },
    });
  } catch (error) {
    logger.error("Error getting high-risk device count:", error);
    return 0;
  }
}

/**
 * Increment blocked count for device
 */
export async function incrementBlockedCount(userId: string, deviceFingerprint: string): Promise<void> {
  try {
    await DeviceTracking.updateOne({ userId, deviceFingerprint }, { $inc: { blockedCount: 1 } });
  } catch (error) {
    logger.error("Error incrementing blocked count:", error);
  }
}
