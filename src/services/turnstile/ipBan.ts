import { IpBanModel } from "../../models/ipBanModel";
import logger from "../../utils/logger";
import { isConnected, mongoose } from "../mongoService";
import { redisService } from "../redisService";
import { clearIPBanCache } from "../../middleware/ipBanCheck";
import { BAN_DURATION, MAX_VIOLATIONS, VIOLATION_COOLDOWN } from "./constants";
import { sanitizeString, validateIpAddress } from "./validators";

export async function isIpBanned(
  ipAddress: string,
): Promise<{ banned: boolean; reason?: string; expiresAt?: Date }> {
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
      expiresAt: { $gt: new Date() },
      violationCount: { $gte: MAX_VIOLATIONS },
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

export async function recordViolation(
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

    const banDoc = await IpBanModel.findOne({ ipAddress: validatedIp }).exec();

    if (banDoc) {
      banDoc.violationCount += 1;
      banDoc.reason = reason;
      if ("updatedAt" in banDoc) {
        (banDoc as any).updatedAt = new Date();
      }

      if (banDoc.violationCount >= MAX_VIOLATIONS) {
        banDoc.expiresAt = new Date(Date.now() + BAN_DURATION);
      } else {
        // 未达阈值：刷新冷却时间，保留计数但不封禁
        banDoc.expiresAt = new Date(Date.now() + VIOLATION_COOLDOWN);
      }

      await banDoc.save();

      const banned = banDoc.violationCount >= MAX_VIOLATIONS;
      logger.warn(`IP ${validatedIp} 违规次数增加到 ${banDoc.violationCount}`, {
        reason,
        fingerprint: `${fingerprint?.substring(0, 8)}...`,
        banned,
      });

      return banned;
    } else {
      // 首次违规：仅记录并设冷却，不立即封禁
      const expiresAt = new Date(Date.now() + VIOLATION_COOLDOWN);
      await IpBanModel.create({
        ipAddress: validatedIp,
        reason,
        violationCount: 1,
        expiresAt,
        fingerprint,
        userAgent,
      });

      logger.warn(`IP ${validatedIp} 首次违规，记录并冷却 ${VIOLATION_COOLDOWN / 1000}s`, {
        reason,
        fingerprint: `${fingerprint?.substring(0, 8)}...`,
      });

      return false;
    }
  } catch (error) {
    logger.error("记录违规失败", error);
    return false;
  }
}

export async function cleanupExpiredIpBans(): Promise<number> {
  try {
    if (mongoose.connection.readyState !== 1) {
      return 0;
    }

    const result = await IpBanModel.deleteMany({ expiresAt: { $lt: new Date() } });

    if (result.deletedCount > 0) {
      logger.info(`清理了 ${result.deletedCount} 条过期IP封禁记录`);
    }

    return result.deletedCount;
  } catch (error) {
    logger.error("清理过期IP封禁记录失败", error);
    return 0;
  }
}

export async function getIpBanStats(): Promise<{ total: number; active: number; expired: number }> {
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

export async function manualBanIp(
  ipAddress: string,
  reason: string,
  durationMinutes: number = 60,
  fingerprint?: string,
  userAgent?: string,
): Promise<{ success: boolean; error?: string; expiresAt?: Date; bannedAt?: Date }> {
  try {
    const validatedIp = validateIpAddress(ipAddress);
    if (!validatedIp) {
      return { success: false, error: "IP地址格式无效" };
    }

    const sanitizedReason = sanitizeString(reason, 500);
    if (!sanitizedReason) {
      return { success: false, error: "封禁原因无效" };
    }

    let validDuration = 60;

    if (durationMinutes !== undefined && durationMinutes !== null) {
      const duration = Number(durationMinutes);

      if (Number.isNaN(duration) || !Number.isFinite(duration)) {
        return { success: false, error: "封禁时长必须是有效的数字" };
      }

      validDuration = Math.min(Math.max(duration, 1), 24 * 60);
    }

    if (mongoose.connection.readyState !== 1) {
      return { success: false, error: "数据库连接不可用" };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validDuration * 60 * 1000);

    const existingBan = await IpBanModel.findOne({ ipAddress: validatedIp });

    let bannedAt = now;

    if (existingBan) {
      bannedAt = existingBan.bannedAt;
      existingBan.expiresAt = expiresAt;
      existingBan.reason = sanitizedReason;
      // 手动封禁强制达到阈值，确保 isIpBanned 立即命中
      existingBan.violationCount = MAX_VIOLATIONS;

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
      const banRecord = new IpBanModel({
        ipAddress: validatedIp,
        reason: sanitizedReason,
        violationCount: MAX_VIOLATIONS,
        bannedAt: now,
        expiresAt,
        fingerprint: fingerprint ? sanitizeString(fingerprint, 200) : undefined,
        userAgent: userAgent ? sanitizeString(userAgent, 500) : undefined,
      });

      await banRecord.save();

      logger.info(`手动封禁IP: ${validatedIp}, 原因: ${sanitizedReason}, 时长: ${validDuration}分钟`);
    }

    try {
      if (redisService?.isAvailable()) {
        await redisService.banIP(validatedIp, sanitizedReason, validDuration, {
          fingerprint: fingerprint ? sanitizeString(fingerprint, 200) || undefined : undefined,
          userAgent: userAgent ? sanitizeString(userAgent, 500) || undefined : undefined,
        });
        logger.info(`✅ IP封禁已同步到Redis: ${validatedIp}`);
      }
    } catch (redisError) {
      logger.warn(`同步IP封禁到Redis失败，但MongoDB已更新`, { error: redisError });
    }

    try {
      if (clearIPBanCache) {
        clearIPBanCache(validatedIp);
      }
    } catch (cacheError) {
      logger.warn(`清除IP缓存失败，但封禁已生效`, { error: cacheError });
    }

    return { success: true, expiresAt, bannedAt };
  } catch (error) {
    logger.error("手动封禁IP失败", error);
    return { success: false, error: error instanceof Error ? error.message : "未知错误" };
  }
}

export async function unbanIp(ipAddress: string): Promise<boolean> {
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

    const mongoResult = await IpBanModel.deleteOne({ ipAddress: validatedIp });
    mongoDeleted = mongoResult.deletedCount > 0;

    try {
      if (redisService?.isAvailable()) {
        redisDeleted = await redisService.unbanIP(validatedIp);
      }
    } catch (redisError) {
      logger.warn(`从Redis删除IP封禁失败，继续执行`, { error: redisError });
    }

    try {
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
