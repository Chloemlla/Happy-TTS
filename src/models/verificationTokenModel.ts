import crypto from "node:crypto";
import { mongoose } from "../services/mongoService";
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
 * 使用 MongoDB 持久化令牌，metadata 仅以 AES-GCM 密文保存。
 */
type PersistedVerificationToken = Omit<VerificationToken, "metadata">;

const VerificationTokenSchema = new mongoose.Schema<PersistedVerificationToken>(
  {
    token: { type: String, required: true, unique: true, index: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(VerificationTokenType),
      index: true,
    },
    email: { type: String, required: true, index: true },
    fingerprint: { type: String, required: true },
    ipAddress: { type: String, required: true },
    metadataCiphertext: { type: String },
    metadataIv: { type: String },
    metadataTag: { type: String },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true, index: true },
    used: { type: Boolean, required: true, default: false, index: true },
    usedAt: { type: Number },
  },
  { collection: "verification_tokens" },
);

VerificationTokenSchema.index({ expiresAt: 1, used: 1 });

const VerificationTokenModel =
  (mongoose.models.VerificationToken as mongoose.Model<PersistedVerificationToken>) ||
  mongoose.model<PersistedVerificationToken>("VerificationToken", VerificationTokenSchema);

const VERIFICATION_TOKEN_PATTERN = /^[a-fA-F0-9]{64}$/;

class VerificationTokenStorage {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10分钟有效期
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

  private normalizePersistedToken(token: PersistedVerificationToken): VerificationToken {
    const plain = { ...(token as any) };
    delete plain._id;
    delete plain.__v;
    return plain as VerificationToken;
  }

  /**
   * 创建验证令牌
   */
  async createToken(
    type: VerificationTokenType,
    email: string,
    fingerprint: string,
    ipAddress: string,
    metadata?: any,
  ): Promise<VerificationToken> {
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

    await VerificationTokenModel.create(verificationToken);

    return this.withDecryptedMetadata(verificationToken);
  }

  /**
   * 获取验证令牌
   */
  async getToken(token: unknown): Promise<VerificationToken | null> {
    if (typeof token !== "string" || !VERIFICATION_TOKEN_PATTERN.test(token)) {
      return null;
    }

    const raw = await VerificationTokenModel.findOne({ token: { $eq: token } }).lean().exec();

    if (!raw) {
      return null;
    }

    const verificationToken = this.normalizePersistedToken(raw);

    // 检查是否过期
    if (Date.now() > verificationToken.expiresAt) {
      await VerificationTokenModel.deleteOne({ token: { $eq: token } }).exec();
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
  async verifyAndUseToken(
    token: unknown,
    fingerprint: string,
    ipAddress: string,
  ): Promise<{ success: boolean; error?: string; data?: VerificationToken }> {
    if (typeof token !== "string" || !VERIFICATION_TOKEN_PATTERN.test(token)) {
      return { success: false, error: "验证链接无效或已过期" };
    }

    const verificationToken = await this.getToken(token);

    if (!verificationToken) {
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
    const usedAt = Date.now();
    const updateResult = await VerificationTokenModel.updateOne(
      { token: { $eq: token }, used: false },
      { $set: { used: true, usedAt } },
    ).exec();

    if (updateResult.matchedCount === 0) {
      return { success: false, error: "验证链接已被使用" };
    }

    logger.info(`[验证令牌] 验证成功`);

    return {
      success: true,
      data: this.withDecryptedMetadata({
        ...verificationToken,
        used: true,
        usedAt,
      }),
    };
  }

  /**
   * 验证令牌（只读检查，不标记为已使用）
   * 用于前端预验证：检查令牌是否有效、设备指纹和IP是否匹配
   * @param token 令牌
   * @param fingerprint 当前设备指纹
   * @param ipAddress 当前IP地址
   * @returns 验证结果
   */
  async validateToken(token: unknown, fingerprint: string, ipAddress: string): Promise<{ valid: boolean; error?: string }> {
    const verificationToken = await this.getToken(token);

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
  async deleteToken(token: unknown): Promise<void> {
    if (typeof token !== "string" || !VERIFICATION_TOKEN_PATTERN.test(token)) {
      return;
    }

    await VerificationTokenModel.deleteOne({ token: { $eq: token } }).exec();
    logger.info(`[验证令牌] 已删除`);
  }

  /**
   * 清理过期令牌
   */
  private async cleanupExpiredTokens(): Promise<void> {
    const now = Date.now();
    const result = await VerificationTokenModel.deleteMany({ expiresAt: { $lt: now } }).exec();
    const deletedCount = result.deletedCount || 0;

    if (deletedCount > 0) {
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
        this.cleanupExpiredTokens().catch((error) => {
          logger.error("[验证令牌] 清理过期令牌失败", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
      5 * 60 * 1000,
    );
    this.cleanupInterval.unref?.();

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
  async getStats(): Promise<{ total: number; expired: number; used: number; active: number }> {
    const now = Date.now();
    const [total, expired, used, active] = await Promise.all([
      VerificationTokenModel.countDocuments({}).exec(),
      VerificationTokenModel.countDocuments({ expiresAt: { $lt: now } }).exec(),
      VerificationTokenModel.countDocuments({ expiresAt: { $gte: now }, used: true }).exec(),
      VerificationTokenModel.countDocuments({ expiresAt: { $gte: now }, used: false }).exec(),
    ]);

    return {
      total,
      expired,
      used,
      active,
    };
  }
}

// 导出单例
export const verificationTokenStorage = new VerificationTokenStorage();
