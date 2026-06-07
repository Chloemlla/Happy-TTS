import { config } from "../../config/config";
import { TempFingerprintModel } from "../../models/tempFingerprintModel";
import logger from "../../utils/logger";
import { isConnected, mongoose } from "../mongoService";
import { isIpBanned } from "./ipBan";
import { validateFingerprint, validateIpAddress } from "./validators";

export async function reportTempFingerprint(
  fingerprint: string,
  ipAddress: string,
): Promise<{ isFirstVisit: boolean; verified: boolean }> {
  try {
    if (!config.enableFirstVisitVerification) {
      return { isFirstVisit: false, verified: true };
    }

    const validatedFingerprint = validateFingerprint(fingerprint);
    const validatedIp = validateIpAddress(ipAddress);

    if (!validatedFingerprint || !validatedIp) {
      logger.warn("临时指纹上报失败：输入参数无效", {
        fingerprintLength: fingerprint?.length,
        ipAddress,
      });
      return { isFirstVisit: false, verified: false };
    }

    const banStatus = await isIpBanned(validatedIp);
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

    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
    const isLocalhost = validatedIp === "127.0.0.1" || validatedIp === "::1" || validatedIp === "::ffff:127.0.0.1";
    const enableDevAutoVerify = process.env.TURNSTILE_DEV_AUTO_VERIFY !== "false";

    const existingDoc = await TempFingerprintModel.findOne({ fingerprint: validatedFingerprint }).lean().exec();

    if (existingDoc) {
      if (isDev && isLocalhost && enableDevAutoVerify && !existingDoc.verified) {
        await TempFingerprintModel.updateOne(
          { fingerprint: validatedFingerprint },
          { verified: true, updatedAt: new Date() },
        );
        logger.info("开发环境：本地IP指纹自动标记为已验证", {
          fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
          ipAddress: validatedIp,
          autoVerifyEnabled: enableDevAutoVerify,
        });
        return { isFirstVisit: false, verified: true };
      }

      return { isFirstVisit: false, verified: existingDoc.verified };
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const isVerified = isDev && isLocalhost && enableDevAutoVerify;

    await TempFingerprintModel.create({
      fingerprint: validatedFingerprint,
      ipAddress: validatedIp,
      verified: isVerified,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info("创建新的临时指纹记录", {
      fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
      ipAddress: validatedIp,
      verified: isVerified,
      expiresAt,
    });

    return { isFirstVisit: true, verified: isVerified };
  } catch (error) {
    logger.error("临时指纹上报失败", error);
    return { isFirstVisit: false, verified: false };
  }
}

export async function checkTempFingerprintVerificationStatus(
  fingerprint: string,
  ip: string,
): Promise<{ isFirstVisit: boolean; verified: boolean }> {
  try {
    if (!config.enableFirstVisitVerification) {
      return { isFirstVisit: false, verified: true };
    }

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
      return { isFirstVisit: false, verified: doc.verified };
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const isVerified = false;

    await TempFingerprintModel.create({
      fingerprint: validatedFingerprint,
      ipAddress: validatedIp,
      verified: isVerified,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info("创建新的临时指纹记录", {
      fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
      ipAddress: validatedIp,
      verified: isVerified,
      expiresAt,
    });

    return { isFirstVisit: true, verified: isVerified };
  } catch (error) {
    logger.error("临时指纹验证失败", error);
    return { isFirstVisit: false, verified: false };
  }
}

export async function checkTempFingerprintStatus(
  fingerprint: string,
): Promise<{ exists: boolean; verified: boolean }> {
  try {
    if (!config.enableFirstVisitVerification) {
      return { exists: true, verified: true };
    }

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

    return { exists: true, verified: doc.verified };
  } catch (error) {
    logger.error("检查临时指纹状态失败", error);
    return { exists: false, verified: false };
  }
}

export async function cleanupExpiredFingerprints(): Promise<number> {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.error("数据库连接不可用，无法清理过期指纹");
      return 0;
    }

    const now = new Date();
    const result = await TempFingerprintModel.deleteMany({ expiresAt: { $lt: now } });

    if (result.deletedCount > 0) {
      logger.info(`清理过期临时指纹完成，删除 ${result.deletedCount} 条记录`);
    }

    return result.deletedCount || 0;
  } catch (error) {
    logger.error("清理过期临时指纹失败", error);
    return 0;
  }
}

export async function getTempFingerprintStats(): Promise<{
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

    return { total, verified, unverified, expired };
  } catch (error) {
    logger.error("获取临时指纹统计失败", error);
    return { total: 0, verified: 0, unverified: 0, expired: 0 };
  }
}
