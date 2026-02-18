import crypto from "node:crypto";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { PolicyConsent } from "../models/policyConsentModel";
import { getClientIP } from "../utils/ipUtils";
import logger from "../utils/logger";

// 当前政策版本
const CURRENT_POLICY_VERSION = "2.0";
const CONSENT_VALIDITY_DAYS = 30;
const SECRET_SALT = process.env.POLICY_SECRET_SALT || "hapxtts_secret_salt";

// 验证校验和
function verifyChecksum(
  consent: { timestamp: number; version: string; fingerprint: string },
  checksum: string,
): boolean {
  const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
  const expectedChecksum = crypto
    .createHash("sha256")
    .update(data + SECRET_SALT)
    .digest("hex")
    .substring(0, 8);

  return checksum === expectedChecksum;
}

// 生成校验和（用于验证客户端逻辑）
function _generateChecksum(consent: { timestamp: number; version: string; fingerprint: string }): string {
  const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
  return crypto
    .createHash("sha256")
    .update(data + SECRET_SALT)
    .digest("hex")
    .substring(0, 8);
}

// 记录隐私政策同意
export const recordPolicyConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { consent, userAgent, timestamp } = req.body;
    const clientIP = getClientIP(req);

    // 验证必需字段
    if (!consent || !consent.timestamp || !consent.version || !consent.fingerprint || !consent.checksum) {
      res.status(400).json({
        success: false,
        error: "Missing required consent fields",
        code: "MISSING_FIELDS",
      });
      return;
    }

    // 输入验证和清理
    if (
      typeof consent.fingerprint !== "string" ||
      consent.fingerprint.trim().length === 0 ||
      consent.fingerprint.trim().length > 100
    ) {
      res.status(400).json({
        success: false,
        error: "Invalid fingerprint format",
        code: "INVALID_FINGERPRINT",
      });
      return;
    }

    if (
      typeof consent.version !== "string" ||
      consent.version.trim().length === 0 ||
      consent.version.trim().length > 50
    ) {
      res.status(400).json({
        success: false,
        error: "Invalid version format",
        code: "INVALID_VERSION",
      });
      return;
    }

    if (
      typeof consent.checksum !== "string" ||
      consent.checksum.trim().length === 0 ||
      consent.checksum.trim().length > 100
    ) {
      res.status(400).json({
        success: false,
        error: "Invalid checksum format",
        code: "INVALID_CHECKSUM",
      });
      return;
    }

    // 清理输入
    const sanitizedFingerprint = consent.fingerprint.trim();
    const sanitizedVersion = consent.version.trim();
    const sanitizedChecksum = consent.checksum.trim();

    // 验证校验和
    if (!verifyChecksum(consent, sanitizedChecksum)) {
      logger.warn("Policy consent checksum verification failed", {
        fingerprint: sanitizedFingerprint,
        ip: clientIP,
        userAgent: userAgent?.substring(0, 100),
      });

      res.status(400).json({
        success: false,
        error: "Invalid consent data",
        details: "Checksum verification failed",
        code: "INVALID_CHECKSUM",
      });
      return;
    }

    // 验证时间戳（允许80秒的时间差）
    const now = Date.now();
    const eightySecondsAgo = now - 80 * 1000;
    const eightySecondsLater = now + 80 * 1000;

    if (consent.timestamp < eightySecondsAgo || consent.timestamp > eightySecondsLater) {
      logger.warn("Policy consent invalid timestamp", {
        consentTimestamp: consent.timestamp,
        currentTimestamp: now,
        timeDifference: Math.abs(consent.timestamp - now),
        allowedRange: "±80 seconds",
        fingerprint: sanitizedFingerprint,
        ip: clientIP,
      });

      res.status(400).json({
        success: false,
        error: "Invalid timestamp - must be within 80 seconds of server time",
        details: {
          serverTime: now,
          clientTime: consent.timestamp,
          timeDifference: Math.abs(consent.timestamp - now),
          allowedRange: "±80 seconds",
        },
        code: "INVALID_TIMESTAMP",
      });
      return;
    }

    // 验证版本
    if (sanitizedVersion !== CURRENT_POLICY_VERSION) {
      res.status(400).json({
        success: false,
        error: "Unsupported policy version",
        currentVersion: CURRENT_POLICY_VERSION,
        providedVersion: sanitizedVersion,
        code: "UNSUPPORTED_VERSION",
      });
      return;
    }

    // 检查是否已存在有效的同意记录
    const existingConsent = await PolicyConsent.findValidConsent(sanitizedFingerprint, sanitizedVersion);
    if (existingConsent) {
      logger.info("Policy consent already exists", {
        consentId: existingConsent.id,
        fingerprint: sanitizedFingerprint,
        ip: clientIP,
      });

      res.json({
        success: true,
        message: "Consent already recorded",
        consentId: existingConsent.id,
        expiresAt: existingConsent.expiresAt,
      });
      return;
    }

    // 创建新的同意记录
    const consentId = uuidv4();
    const expiresAt = new Date(Date.now() + CONSENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

    const newConsent = new PolicyConsent({
      id: consentId,
      timestamp: consent.timestamp,
      version: sanitizedVersion,
      fingerprint: sanitizedFingerprint,
      checksum: sanitizedChecksum,
      userAgent: userAgent?.substring(0, 500),
      ipAddress: clientIP,
      expiresAt,
    });

    await newConsent.save();

    // 记录日志
    logger.info("Policy consent recorded successfully", {
      consentId,
      version: sanitizedVersion,
      fingerprint: sanitizedFingerprint,
      ip: clientIP,
      userAgent: userAgent?.substring(0, 100),
      expiresAt,
    });

    res.json({
      success: true,
      message: "Consent recorded successfully",
      consentId,
      expiresAt,
    });
  } catch (error) {
    logger.error("Error recording policy consent", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// 验证隐私政策同意状态
export const verifyPolicyConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fingerprint, version } = req.query;
    const clientIP = getClientIP(req);

    // 输入验证和清理
    if (!fingerprint || typeof fingerprint !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid fingerprint",
        code: "MISSING_FINGERPRINT",
      });
      return;
    }

    if (!version || typeof version !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid version",
        code: "MISSING_VERSION",
      });
      return;
    }

    // 清理和验证输入
    const sanitizedFingerprint = fingerprint.trim();
    const sanitizedVersion = version.trim();

    if (sanitizedFingerprint.length === 0 || sanitizedFingerprint.length > 100) {
      res.status(400).json({
        success: false,
        error: "Invalid fingerprint format",
        code: "INVALID_FINGERPRINT",
      });
      return;
    }

    if (sanitizedVersion.length === 0 || sanitizedVersion.length > 50) {
      res.status(400).json({
        success: false,
        error: "Invalid version format",
        code: "INVALID_VERSION",
      });
      return;
    }

    // 查找有效的同意记录
    const consent = await PolicyConsent.findValidConsent(sanitizedFingerprint, sanitizedVersion);

    if (!consent) {
      res.json({
        success: false,
        hasValidConsent: false,
        message: "No valid consent found",
        currentVersion: CURRENT_POLICY_VERSION,
      });
      return;
    }

    // 检查是否过期
    if (consent.isExpired()) {
      // 标记为无效
      consent.isValid = false;
      await consent.save();

      res.json({
        success: false,
        hasValidConsent: false,
        message: "Consent expired",
        currentVersion: CURRENT_POLICY_VERSION,
      });
      return;
    }

    logger.info("Policy consent verified", {
      consentId: consent.id,
      fingerprint,
      ip: clientIP,
      expiresAt: consent.expiresAt,
    });

    res.json({
      success: true,
      hasValidConsent: true,
      consentId: consent.id,
      version: consent.version,
      expiresAt: consent.expiresAt,
      recordedAt: consent.recordedAt,
    });
  } catch (error) {
    logger.error("Error verifying policy consent", {
      error: error instanceof Error ? error.message : "Unknown error",
      fingerprint: req.query.fingerprint,
      version: req.query.version,
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// 撤销隐私政策同意
export const revokePolicyConsent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fingerprint, version } = req.body;
    const clientIP = getClientIP(req);

    // 输入验证和清理
    if (!fingerprint || typeof fingerprint !== "string") {
      res.status(400).json({
        success: false,
        error: "Missing or invalid fingerprint",
        code: "MISSING_FINGERPRINT",
      });
      return;
    }

    // 清理和验证指纹
    const sanitizedFingerprint = fingerprint.trim();
    if (sanitizedFingerprint.length === 0 || sanitizedFingerprint.length > 100) {
      res.status(400).json({
        success: false,
        error: "Invalid fingerprint format",
        code: "INVALID_FINGERPRINT",
      });
      return;
    }

    // 验证版本号（如果提供）
    let sanitizedVersion: string | undefined;
    if (version) {
      if (typeof version !== "string") {
        res.status(400).json({
          success: false,
          error: "Invalid version format",
          code: "INVALID_VERSION",
        });
        return;
      }
      sanitizedVersion = version.trim();
      if (sanitizedVersion.length === 0 || sanitizedVersion.length > 50) {
        res.status(400).json({
          success: false,
          error: "Invalid version format",
          code: "INVALID_VERSION",
        });
        return;
      }
    }

    // 构建安全的查询对象
    const queryFilter: any = {
      fingerprint: sanitizedFingerprint,
      isValid: true,
    };

    // 只有在版本号有效时才添加到查询中
    if (sanitizedVersion) {
      queryFilter.version = sanitizedVersion;
    }

    // 查找并撤销同意记录
    const result = await PolicyConsent.updateMany(queryFilter, {
      isValid: false,
      revokedAt: new Date(),
      revokedIP: clientIP,
    });

    logger.info("Policy consent revoked", {
      fingerprint: sanitizedFingerprint,
      version: sanitizedVersion,
      ip: clientIP,
      modifiedCount: result.modifiedCount,
    });

    res.json({
      success: true,
      message: "Consent revoked successfully",
      revokedCount: result.modifiedCount,
    });
  } catch (error) {
    logger.error("Error revoking policy consent", {
      error: error instanceof Error ? error.message : "Unknown error",
      fingerprint: req.body.fingerprint,
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// 获取隐私政策统计信息（管理员接口）
export const getPolicyStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    // 获取统计信息
    const stats = await PolicyConsent.getStats(start, end);

    // 获取总体统计
    const totalConsents = await PolicyConsent.countDocuments({ isValid: true });
    const expiredConsents = await PolicyConsent.countDocuments({
      $or: [{ expiresAt: { $lt: new Date() } }, { isValid: false }],
    });

    // 获取版本分布
    const versionStats = await PolicyConsent.aggregate([
      { $match: { isValid: true } },
      { $group: { _id: "$version", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // 获取最近7天的同意趋势
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentTrend = await PolicyConsent.aggregate([
      { $match: { recordedAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$recordedAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      stats: {
        total: {
          validConsents: totalConsents,
          expiredConsents,
          currentVersion: CURRENT_POLICY_VERSION,
        },
        versions: versionStats,
        recentTrend,
        detailed: stats,
      },
    });
  } catch (error) {
    logger.error("Error getting policy stats", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// 清理过期记录（管理员接口）
export const cleanExpiredConsents = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await PolicyConsent.cleanExpiredConsents();

    logger.info("Expired policy consents cleaned", {
      deletedCount: result.deletedCount,
    });

    res.json({
      success: true,
      message: "Expired consents cleaned successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    logger.error("Error cleaning expired consents", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

// 获取当前政策版本
export const getCurrentPolicyVersion = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    version: CURRENT_POLICY_VERSION,
    validityDays: CONSENT_VALIDITY_DAYS,
  });
};
