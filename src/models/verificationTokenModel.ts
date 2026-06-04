import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import logger from "../utils/logger";

/**
 * 验证令牌类型
 */
export enum VerificationTokenType {
  EMAIL_REGISTRATION = "email_registration", // 邮箱注册验证
  PASSWORD_RESET = "password_reset", // 密码重置验证
}

/**
 * 验证令牌接口
 */
export interface VerificationToken {
  token: string; // 唯一验证令牌
  type: VerificationTokenType; // 令牌类型
  email: string; // 关联的邮箱
  fingerprint: string; // 设备指纹
  ipAddress: string; // IP地址
  metadata?: any; // 额外数据（如注册信息、用户ID等）
  metadataCiphertext?: string; // 加密后的额外数据
  metadataIv?: string; // metadata 加密 IV
  metadataTag?: string; // metadata 认证标签
  createdAt: number; // 创建时间戳
  expiresAt: number; // 过期时间戳
  used: boolean; // 是否已使用
  usedAt?: number; // 使用时间戳
}

/**
 * 验证令牌存储
 * 使用加密 metadata + 本地文件持久化，避免进程重启后注册链接/重置链接全部失效。
 */
class VerificationTokenStorage {
  private tokens: Map<string, VerificationToken> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10分钟有效期
  private readonly storagePath = path.resolve(process.cwd(), "data", "verification_tokens.json");
  private readonly metadataKey = crypto
    .createHash("sha256")
    .update(
      process.env.VERIFICATION_TOKEN_SECRET ||
        process.env.JWT_SECRET ||
        process.env.AES_KEY ||
        "development-verification-token-secret",
    )
    .digest();

  constructor() {
    this.loadTokens();
    // 启动定期清理过期令牌的任务
    this.startCleanupTask();
  }

  /**
   * 生成安全的随机令牌
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  private encryptMetadata(metadata: any): Partial<VerificationToken> {
    if (metadata === undefined || metadata === null) {
      return {};
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.metadataKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(metadata), "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      metadataCiphertext: ciphertext.toString("base64"),
      metadataIv: iv.toString("base64"),
      metadataTag: tag.toString("base64"),
    };
  }

  private decryptMetadata(token: VerificationToken): any {
    if (!token.metadataCiphertext || !token.metadataIv || !token.metadataTag) {
      return token.metadata;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.metadataKey, Buffer.from(token.metadataIv, "base64"));
    decipher.setAuthTag(Buffer.from(token.metadataTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(token.metadataCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    return JSON.parse(plaintext);
  }

  private withDecryptedMetadata(token: VerificationToken): VerificationToken {
    const safeToken = { ...token };
    try {
      safeToken.metadata = this.decryptMetadata(token);
    } catch (error) {
      logger.error("[验证令牌] metadata 解密失败", {
        type: token.type,
        email: token.email,
        error: error instanceof Error ? error.message : String(error),
      });
      safeToken.metadata = undefined;
    }
    return safeToken;
  }

  private persistTokens(): void {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      const payload = Array.from(this.tokens.values()).map(({ metadata: _metadata, ...token }) => token);
      fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), "utf8");
    } catch (error) {
      logger.error("[验证令牌] 持久化失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private loadTokens(): void {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return;
      }

      const raw = fs.readFileSync(this.storagePath, "utf8");
      const parsed = JSON.parse(raw) as VerificationToken[];
      if (!Array.isArray(parsed)) {
        logger.warn("[验证令牌] 持久化文件格式无效，已忽略");
        return;
      }

      const now = Date.now();
      for (const token of parsed) {
        if (!token?.token || now > token.expiresAt) {
          continue;
        }
        this.tokens.set(token.token, token);
      }
    } catch (error) {
      logger.error("[验证令牌] 读取持久化文件失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 创建验证令牌
   */
  createToken(
    type: VerificationTokenType,
    email: string,
    fingerprint: string,
    ipAddress: string,
    metadata?: any,
  ): VerificationToken {
    const token = this.generateToken();
    const now = Date.now();

    const verificationToken: VerificationToken = {
      token,
      type,
      email,
      fingerprint,
      ipAddress,
      ...this.encryptMetadata(metadata),
      createdAt: now,
      expiresAt: now + this.TOKEN_EXPIRY_MS,
      used: false,
    };

    this.tokens.set(token, verificationToken);
    this.persistTokens();

    return this.withDecryptedMetadata(verificationToken);
  }

  /**
   * 获取验证令牌
   */
  getToken(token: string): VerificationToken | null {
    const verificationToken = this.tokens.get(token);

    if (!verificationToken) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > verificationToken.expiresAt) {
      this.tokens.delete(token);
      this.persistTokens();
      logger.warn(`[验证令牌] 已过期`);
      return null;
    }

    return this.withDecryptedMetadata(verificationToken);
  }

  /**
   * 验证并使用令牌
   * @param token 令牌
   * @param fingerprint 当前设备指纹
   * @param ipAddress 当前IP地址
   * @returns 验证结果和令牌数据
   */
  verifyAndUseToken(
    token: string,
    fingerprint: string,
    ipAddress: string,
  ): { success: boolean; error?: string; data?: VerificationToken } {
    const rawToken = this.tokens.get(token);
    const verificationToken = this.getToken(token);

    if (!verificationToken || !rawToken) {
      return { success: false, error: "验证链接无效或已过期" };
    }

    if (verificationToken.used) {
      return { success: false, error: "验证链接已被使用" };
    }

    // 校验设备指纹
    if (verificationToken.fingerprint !== fingerprint) {
      logger.warn(`[验证令牌] 设备指纹不匹配`);
      return { success: false, error: "设备指纹验证失败，请使用相同设备打开链接" };
    }

    // 校验IP地址
    if (verificationToken.ipAddress !== ipAddress) {
      logger.warn(`[验证令牌] IP地址不匹配`);
      return { success: false, error: "IP地址验证失败，请使用相同网络打开链接" };
    }

    // 标记为已使用
    rawToken.used = true;
    rawToken.usedAt = Date.now();
    this.tokens.set(token, rawToken);
    this.persistTokens();

    logger.info(`[验证令牌] 验证成功`);

    return { success: true, data: this.withDecryptedMetadata(rawToken) };
  }

  /**
   * 验证令牌（只读检查，不标记为已使用）
   * 用于前端预验证：检查令牌是否有效、设备指纹和IP是否匹配
   * @param token 令牌
   * @param fingerprint 当前设备指纹
   * @param ipAddress 当前IP地址
   * @returns 验证结果
   */
  validateToken(token: string, fingerprint: string, ipAddress: string): { valid: boolean; error?: string } {
    const verificationToken = this.getToken(token);

    if (!verificationToken) {
      return { valid: false, error: "验证链接无效或已过期" };
    }

    if (verificationToken.used) {
      return { valid: false, error: "验证链接已被使用" };
    }

    // 校验设备指纹
    if (verificationToken.fingerprint !== fingerprint) {
      logger.warn(`[验证令牌] 预验证失败：设备指纹不匹配`);
      return { valid: false, error: "设备验证失败，请使用发起请求时的相同设备打开链接" };
    }

    // 校验IP地址
    if (verificationToken.ipAddress !== ipAddress) {
      logger.warn(`[验证令牌] 预验证失败：IP地址不匹配`);
      return { valid: false, error: "网络验证失败，请使用发起请求时的相同网络打开链接" };
    }

    return { valid: true };
  }

  /**
   * 删除令牌
   */
  deleteToken(token: string): void {
    this.tokens.delete(token);
    this.persistTokens();
    logger.info(`[验证令牌] 已删除`);
  }

  /**
   * 清理过期令牌
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [token, verificationToken] of this.tokens.entries()) {
      if (now > verificationToken.expiresAt) {
        this.tokens.delete(token);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.persistTokens();
      logger.info(`[验证令牌] 清理过期令牌: ${deletedCount}个`);
    }
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask(): void {
    // 每5分钟清理一次过期令牌
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupExpiredTokens();
      },
      5 * 60 * 1000,
    );

    logger.info("[验证令牌] 清理任务已启动");
  }

  /**
   * 停止清理任务
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info("[验证令牌] 清理任务已停止");
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; expired: number; used: number; active: number } {
    const now = Date.now();
    let expired = 0;
    let used = 0;
    let active = 0;

    for (const verificationToken of this.tokens.values()) {
      if (now > verificationToken.expiresAt) {
        expired++;
      } else if (verificationToken.used) {
        used++;
      } else {
        active++;
      }
    }

    return {
      total: this.tokens.size,
      expired,
      used,
      active,
    };
  }
}

// 导出单例
export const verificationTokenStorage = new VerificationTokenStorage();
