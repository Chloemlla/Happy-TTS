import type { Request } from "express";
import logger from "../utils/logger";
import { DeviceTracking } from "../models/deviceTrackingModel";
import { SecurityEvent } from "../models/securityEventModel";

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
  signatureValid: boolean;
  hashValid: boolean;
}

export type RiskStrategy = "NORMAL" | "MONITOR" | "RESTRICT" | "HONEYPOT" | "BLOCK";

/**
 * Extract security headers from request
 */
export function extractSecurityHeaders(req: Request): DeviceSecurityHeaders {
  const riskScore = parseInt(req.headers["x-device-risk-score"] as string) || 0;

  return {
    deviceFingerprint: req.headers["x-device-fingerprint"] as string,
    appVersion: req.headers["x-app-version"] as string,
    appBuild: req.headers["x-app-build"] as string,
    riskScore,
    riskLevel: (req.headers["x-device-risk-level"] as any) || getRiskLevelFromScore(riskScore),
    isCompromised: req.headers["x-device-compromised"] === "1",
    isRoot: req.headers["x-device-root"] === "1",
    isDebugger: req.headers["x-device-debugger"] === "1",
    isEmulator: req.headers["x-device-emulator"] === "1",
    isVpn: req.headers["x-device-vpn"] === "1",
    signatureValid: req.headers["x-device-signature-valid"] === "1",
    hashValid: req.headers["x-device-hash-valid"] === "1",
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
  const { riskScore, isCompromised } = headers;

  if (riskScore >= 80 || (isCompromised && riskScore >= 50)) {
    return "BLOCK";
  }
  if (riskScore >= 50) {
    return "HONEYPOT";
  }
  if (riskScore >= 30) {
    return "RESTRICT";
  }
  if (riskScore >= 10) {
    return "MONITOR";
  }
  return "NORMAL";
}

/**
 * Track device information
 */
export async function trackDevice(
  userId: string,
  headers: DeviceSecurityHeaders,
  ipAddress: string,
  userAgent: string
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
        new: true,
      }
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
  userAgent: string
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
  userId: string
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
      signatureValid: device.signatureValid,
      hashValid: device.hashValid,
    });

    const restrictions: string[] = [];
    let status: "normal" | "flagged" | "blocked" = "normal";
    let message = "Device is operating normally";

    if (strategy === "BLOCK") {
      status = "blocked";
      restrictions.push("all_operations_blocked");
      message = "Your device has been blocked due to security concerns";
    } else if (strategy === "HONEYPOT" || strategy === "RESTRICT") {
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
export async function incrementBlockedCount(
  userId: string,
  deviceFingerprint: string
): Promise<void> {
  try {
    await DeviceTracking.updateOne(
      { userId, deviceFingerprint },
      { $inc: { blockedCount: 1 } }
    );
  } catch (error) {
    logger.error("Error incrementing blocked count:", error);
  }
}
