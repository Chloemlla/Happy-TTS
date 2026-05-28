import crypto from "node:crypto";
import { AccessTokenModel } from "../../models/accessTokenModel";
import logger from "../../utils/logger";
import { mongoose } from "../mongoService";
import { isIpBanned } from "./ipBan";
import { validateFingerprint, validateIpAddress, validateToken } from "./validators";

const FIXED_DEV_TOKEN = "dev-permanent-token-2025";

function isDevEnv(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev";
}

function isLocalIp(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export async function generateAccessToken(fingerprint: string, ipAddress: string): Promise<string> {
  try {
    const validatedFingerprint = validateFingerprint(fingerprint);
    const validatedIp = validateIpAddress(ipAddress);

    if (!validatedFingerprint || !validatedIp) {
      logger.warn("生成访问密钥失败：输入参数无效", {
        fingerprintLength: fingerprint?.length,
        ipAddress,
      });
      throw new Error("无效的指纹或IP参数");
    }

    const isDev = isDevEnv();
    const isLocalhost = isLocalIp(validatedIp);
    const devPermanentTokenEnabled = process.env.TURNSTILE_DEV_PERMANENT_TOKEN !== "false";

    logger.debug("开发环境永久令牌配置", {
      isDev,
      isLocalhost,
      devPermanentTokenEnabled,
      envValue: process.env.TURNSTILE_DEV_PERMANENT_TOKEN,
    });

    if (isDev && isLocalhost && devPermanentTokenEnabled) {
      const devToken = crypto
        .createHash("sha256")
        .update(`dev-token-${validatedFingerprint}-${validatedIp}`)
        .digest("hex");

      logger.info("开发环境：为本地IP生成永久访问密钥", {
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
        token: `${devToken.substring(0, 8)}...`,
        switchEnabled: devPermanentTokenEnabled,
      });

      return devToken;
    }

    if (isDev && isLocalhost && !devPermanentTokenEnabled) {
      logger.info("开发环境：永久令牌开关已禁用，使用标准令牌生成流程", {
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
        switchDisabled: true,
      });
    }

    if (mongoose.connection.readyState !== 1) {
      logger.error("数据库连接不可用，无法生成访问密钥");
      throw new Error("数据库连接不可用");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await AccessTokenModel.create({
      token,
      fingerprint: validatedFingerprint,
      ipAddress: validatedIp,
      expiresAt,
    });

    logger.info("访问密钥生成成功", {
      fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
      ipAddress: validatedIp,
      expiresAt,
    });

    return token;
  } catch (error) {
    logger.error("生成访问密钥失败", error);
    throw error;
  }
}

export function generateDevToken(
  fingerprint?: string,
  ipAddress?: string,
): { fixedToken: string; fingerprintToken?: string; usage: string } {
  let fingerprintToken: string | undefined;
  if (fingerprint && ipAddress) {
    fingerprintToken = crypto.createHash("sha256").update(`dev-token-${fingerprint}-${ipAddress}`).digest("hex");
  }

  return {
    fixedToken: FIXED_DEV_TOKEN,
    fingerprintToken,
    usage: `开发环境永久令牌:
1. 固定令牌: "${FIXED_DEV_TOKEN}"
2. 指纹令牌: ${fingerprintToken || "需要提供fingerprint和ipAddress参数"}

使用方法:
- 在开发环境(NODE_ENV=development)且本地IP(127.0.0.1)下有效
- 可以直接使用固定令牌，无需动态生成
- 也支持基于指纹的动态令牌`,
  };
}

export async function verifyAccessToken(token: string, fingerprint: string, ipAddress: string): Promise<boolean> {
  try {
    const validatedToken = validateToken(token);
    const validatedFingerprint = validateFingerprint(fingerprint);
    const validatedIp = validateIpAddress(ipAddress);

    if (!validatedToken || !validatedFingerprint || !validatedIp) {
      logger.warn("验证访问密钥失败：输入参数无效", {
        tokenLength: token?.length,
        fingerprintLength: fingerprint?.length,
        ipAddress,
      });
      return false;
    }

    const isDev = isDevEnv();
    const isLocalhost = isLocalIp(validatedIp);

    if (isDev && isLocalhost) {
      const expectedDevToken = crypto
        .createHash("sha256")
        .update(`dev-token-${validatedFingerprint}-${validatedIp}`)
        .digest("hex");

      if (validatedToken === FIXED_DEV_TOKEN || validatedToken === expectedDevToken) {
        const tokenType = validatedToken === FIXED_DEV_TOKEN ? "固定令牌" : "指纹令牌";
        logger.info(`开发环境：永久访问密钥验证成功 (${tokenType})`, {
          fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
          ipAddress: validatedIp,
          token: `${validatedToken.substring(0, 8)}...`,
          tokenType,
        });
        return true;
      }
    }

    if (!(isDev && isLocalhost)) {
      const banStatus = await isIpBanned(validatedIp);
      if (banStatus.banned) {
        logger.warn(`IP ${validatedIp} 已被封禁，拒绝验证访问密钥`, {
          reason: banStatus.reason,
          expiresAt: banStatus.expiresAt,
        });
        return false;
      }
    }

    if (mongoose.connection.readyState !== 1) {
      logger.error("数据库连接不可用，无法验证访问密钥");
      return false;
    }

    const doc = await AccessTokenModel.findOne({
      token: validatedToken,
      fingerprint: validatedFingerprint,
      ipAddress: validatedIp,
      expiresAt: { $gt: new Date() },
    }).exec();

    if (!doc) {
      logger.warn("访问密钥无效或已过期", {
        token: `${validatedToken.substring(0, 8)}...`,
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
      });
      return false;
    }

    doc.updatedAt = new Date();
    await doc.save();

    logger.info("访问密钥验证成功", {
      token: `${validatedToken.substring(0, 8)}...`,
      fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
      ipAddress: validatedIp,
    });

    return true;
  } catch (error) {
    logger.error("验证访问密钥失败", error);
    return false;
  }
}

export async function hasValidAccessToken(fingerprint: string, ipAddress: string): Promise<boolean> {
  try {
    const validatedFingerprint = validateFingerprint(fingerprint);
    const validatedIp = validateIpAddress(ipAddress);

    if (!validatedFingerprint || !validatedIp) {
      logger.warn("检查访问密钥失败：输入参数无效", {
        fingerprintLength: fingerprint?.length,
        ipAddress,
      });
      return false;
    }

    const isDev = isDevEnv();
    const isLocalhost = isLocalIp(validatedIp);
    const enableDevAutoAccess = process.env.TURNSTILE_DEV_AUTO_ACCESS !== "false";

    if (isDev && isLocalhost && enableDevAutoAccess) {
      logger.info("开发环境：本地IP自动拥有有效访问密钥", {
        fingerprint: `${validatedFingerprint.substring(0, 8)}...`,
        ipAddress: validatedIp,
        autoAccessEnabled: enableDevAutoAccess,
      });
      return true;
    }

    const banStatus = await isIpBanned(validatedIp);
    if (banStatus.banned) {
      logger.warn(`IP ${validatedIp} 已被封禁，拒绝检查访问密钥`, {
        reason: banStatus.reason,
        expiresAt: banStatus.expiresAt,
      });
      return false;
    }

    if (mongoose.connection.readyState !== 1) {
      return false;
    }

    const doc = await AccessTokenModel.findOne({
      fingerprint: validatedFingerprint,
      ipAddress: validatedIp,
      expiresAt: { $gt: new Date() },
    }).exec();

    return !!doc;
  } catch (error) {
    logger.error("检查访问密钥失败", error);
    return false;
  }
}

export async function cleanupExpiredAccessTokens(): Promise<number> {
  try {
    if (mongoose.connection.readyState !== 1) {
      return 0;
    }

    const result = await AccessTokenModel.deleteMany({ expiresAt: { $lt: new Date() } });

    if (result.deletedCount > 0) {
      logger.info(`清理了 ${result.deletedCount} 个过期访问密钥`);
    }

    return result.deletedCount;
  } catch (error) {
    logger.error("清理过期访问密钥失败", error);
    return 0;
  }
}

export async function getAccessTokenStats(): Promise<{ total: number; valid: number; expired: number }> {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { total: 0, valid: 0, expired: 0 };
    }

    const now = new Date();
    const [total, valid, expired] = await Promise.all([
      AccessTokenModel.countDocuments(),
      AccessTokenModel.countDocuments({ expiresAt: { $gt: now } }),
      AccessTokenModel.countDocuments({ expiresAt: { $lte: now } }),
    ]);

    return { total, valid, expired };
  } catch (error) {
    logger.error("获取访问密钥统计失败", error);
    return { total: 0, valid: 0, expired: 0 };
  }
}
