import crypto from "node:crypto";
import QRCode from "qrcode";
import speakeasy from "speakeasy";
import bcrypt from "bcrypt";
import logger from "../utils/logger";

// 确保时区设置为上海
if (process.env.TZ !== "Asia/Shanghai") {
  process.env.TZ = "Asia/Shanghai";
  logger.info("TOTP服务时区已设置为上海");
}

export class TOTPService {
  /**
   * 生成TOTP密钥
   */
  public static generateSecret(username: string, serviceName: string = "Synapse"): string {
    // 参数校验
    if (!username || typeof username !== "string" || username.trim().length === 0) {
      throw new Error("用户名不能为空");
    }
    if (!serviceName || typeof serviceName !== "string" || serviceName.trim().length === 0) {
      throw new Error("服务名不能为空");
    }
    try {
      const secret = speakeasy.generateSecret({
        name: `${serviceName} (${username})`,
        issuer: serviceName,
        length: 20, // 20字节 = 32字符的base32编码（标准TOTP密钥长度）
      });
      if (!secret.base32) {
        throw new Error("TOTP密钥生成失败");
      }
      logger.info("TOTP密钥生成成功:", { username, serviceName, secretLength: secret.base32.length });
      return secret.base32;
    } catch (error) {
      logger.error("生成TOTP密钥失败:", error);
      throw error;
    }
  }

  /**
   * 生成otpauth URL
   */
  public static generateOTPAuthURL(secret: string, username: string, serviceName: string = "Synapse"): string {
    // 参数校验
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
      throw new Error("TOTP密钥不能为空");
    }
    if (!username || typeof username !== "string" || username.trim().length === 0) {
      throw new Error("用户名不能为空");
    }
    if (!serviceName || typeof serviceName !== "string" || serviceName.trim().length === 0) {
      throw new Error("服务名不能为空");
    }
    try {
      // 确保用户名不包含特殊字符，避免URL编码问题
      const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeServiceName = serviceName.replace(/[^a-zA-Z0-9_-]/g, "-");

      // 直接使用speakeasy.otpauthURL方法，传入base32密钥并指定编码
      const otpauthUrl = speakeasy.otpauthURL({
        secret: secret,
        label: `${safeServiceName}:${safeUsername}`,
        issuer: safeServiceName,
        encoding: "base32", // 明确指定传入的是base32编码
        algorithm: "sha1",
        digits: 6,
        period: 30,
      });

      if (!otpauthUrl) {
        throw new Error("生成otpauth URL失败");
      }

      // 记录生成的URL用于调试（不包含secret）
      logger.info("otpauth URL生成成功:", {
        username: safeUsername,
        serviceName: safeServiceName,
        urlPattern: otpauthUrl.replace(/secret=[^&]+/, "secret=***"),
        algorithm: "sha1",
        digits: 6,
        period: 30,
      });

      return otpauthUrl;
    } catch (error) {
      logger.error("生成otpauth URL失败:", error);
      throw error;
    }
  }

  /**
   * 生成QR码Data URL
   */
  public static async generateQRCodeDataURL(
    secret: string,
    username: string,
    serviceName: string = "Synapse",
  ): Promise<string> {
    // 参数校验
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
      throw new Error("TOTP密钥不能为空");
    }
    if (!username || typeof username !== "string" || username.trim().length === 0) {
      throw new Error("用户名不能为空");
    }
    try {
      const otpauthUrl = TOTPService.generateOTPAuthURL(secret, username, serviceName);

      // 优化QR码设置，提高Authenticator应用的兼容性
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: "M", // 中等错误纠正级别，平衡大小和容错性
        margin: 1, // 减少边距，提高扫描成功率
        width: 256, // 增加尺寸，提高扫描清晰度
        color: {
          dark: "#000000", // 黑色前景
          light: "#FFFFFF", // 白色背景
        },
        type: "image/png",
      });

      if (!qrCodeDataUrl) {
        throw new Error("生成QR码失败");
      }

      logger.info("QR码生成成功:", {
        username,
        size: "256x256",
        errorCorrection: "M",
        margin: 1,
        format: "PNG",
      });

      return qrCodeDataUrl;
    } catch (error) {
      logger.error("生成QR码失败:", error);
      throw error;
    }
  }

  /**
   * 验证TOTP令牌
   *
   * G2-13: 兼容包装，默认窗口收到 1（RFC 6238 建议 ±1 步）。
   * 新代码请使用 verifyTokenWithCounter 做重放防护。
   */
  public static verifyToken(token: string, secret: string, window: number = 1): boolean {
    const result = TOTPService.verifyTokenWithCounter(token, secret, window);
    return result.valid;
  }

  /**
   * 验证TOTP令牌并返回命中的 counter（用于重放防护）。
   * 调用方应在用户文档上持久化 lastTotpCounter，并拒绝 counter <= lastTotpCounter 的复用。
   * @returns { valid, counter } counter 为 null 表示验证失败。
   */
  public static verifyTokenWithCounter(
    token: string,
    secret: string,
    window: number = 1,
  ): { valid: boolean; counter: number | null } {
    try {
      // 输入验证
      if (!token || typeof token !== "string" || token.trim().length === 0) {
        logger.error("TOTP验证参数无效: token为空");
        return { valid: false, counter: null };
      }
      if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
        logger.error("TOTP验证参数无效: secret为空");
        return { valid: false, counter: null };
      }
      // 验证token格式
      if (!/^\d{6}$/.test(token)) {
        logger.error("TOTP令牌格式错误:", { tokenLength: token.length });
        return { valid: false, counter: null };
      }
      // 验证window参数
      if (typeof window !== "number" || window < 0 || window > 10) {
        logger.error("TOTP验证window参数无效:", { window });
        return { valid: false, counter: null };
      }

      // 记录当前时间和时区信息
      const now = new Date();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentTime = now.toISOString();
      const localTime = now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      logger.info("TOTP验证开始:", {
        tokenLength: token.length,
        timeZone,
        currentTime,
        localTime,
        window,
        serverTime: now.getTime(),
      });

      // verifyDelta 返回 { delta, counter }，delta 为相对当前步的偏移，counter 为绝对时间步。
      const delta = speakeasy.totp.verifyDelta({
        secret,
        encoding: "base32",
        token,
        window,
        step: 30,
      });

      if (!delta || typeof delta !== "object") {
        logger.info("TOTP验证结果:", { result: false, window, timeZone, currentTime, localTime });
        return { valid: false, counter: null };
      }

      logger.info("TOTP验证结果:", {
        result: true,
        delta: delta.delta,
        counter: delta.counter,
        window,
        timeZone,
        currentTime,
        localTime,
      });
      return { valid: true, counter: Number(delta.counter) };
    } catch (error) {
      logger.error("验证TOTP令牌失败:", error);
      return { valid: false, counter: null };
    }
  }

  /**
   * 生成备用恢复码
   */
  public static generateBackupCodes(): string[] {
    try {
      const codes: string[] = [];
      const usedCodes = new Set<string>();
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      for (let i = 0; i < 10; i++) {
        let code: string;
        let attempts = 0;
        const maxAttempts = 100;
        do {
          // 使用 crypto.randomInt 均匀采样，消除取模偏差（256 % 36 = 4，直接取模会使 A-D 略多出现）
          code = Array.from({ length: 8 }, () => chars[crypto.randomInt(chars.length)]).join("");
          attempts++;
          if (attempts > maxAttempts) {
            throw new Error("无法生成唯一的备用恢复码");
          }
        } while (usedCodes.has(code));
        usedCodes.add(code);
        codes.push(code);
      }
      logger.info("备用恢复码生成成功:", { count: codes.length });
      return codes;
    } catch (error) {
      logger.error("生成备用恢复码失败:", error);
      throw error;
    }
  }

  /**
   * 验证备用恢复码
   *
   * G2-14: 恢复码以 bcrypt 哈希数组落库。本函数返回命中的剩余哈希数组，
   * 不修改入参，也不负责落库（调用方把 remainingHashes 写回用户文档）。
   * 兼容旧的明文存储：非 bcrypt 前缀的条目按明文比较并照常报废。
   */
  public static async verifyBackupCode(
    code: string,
    backupCodes: string[],
  ): Promise<{ matched: boolean; remainingHashes: string[] }> {
    try {
      // 输入验证
      if (!code || typeof code !== "string" || code.trim().length === 0) {
        logger.error("备用恢复码验证参数无效: code为空");
        return { matched: false, remainingHashes: backupCodes };
      }
      if (!backupCodes || !Array.isArray(backupCodes)) {
        logger.error("备用恢复码验证参数无效: backupCodes不是数组");
        return { matched: false, remainingHashes: backupCodes };
      }
      if (backupCodes.length === 0) {
        logger.error("备用恢复码验证参数无效: backupCodes为空数组");
        return { matched: false, remainingHashes: backupCodes };
      }
      const normalizedCode = (typeof code === "string" ? code : String(code ?? ""))
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      // 验证恢复码格式
      if (normalizedCode.length !== 8) {
        logger.error("备用恢复码格式错误:", { codeLength: normalizedCode.length });
        return { matched: false, remainingHashes: backupCodes };
      }
      // 验证恢复码只包含字母和数字
      if (!/^[A-Z0-9]{8}$/.test(normalizedCode)) {
        logger.error("备用恢复码包含非法字符");
        return { matched: false, remainingHashes: backupCodes };
      }

      for (let index = 0; index < backupCodes.length; index += 1) {
        const stored = backupCodes[index];
        if (typeof stored !== "string" || stored.length === 0) continue;

        let isMatch: boolean;
        if (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$")) {
          isMatch = await bcrypt.compare(normalizedCode, stored);
        } else {
          // 兼容旧明文条目（恒时比较，降低时序侧信道）
          const storedNormalized = stored.toUpperCase().replace(/[^A-Z0-9]/g, "");
          isMatch =
            storedNormalized.length === normalizedCode.length &&
            crypto.timingSafeEqual(Buffer.from(storedNormalized), Buffer.from(normalizedCode));
        }

        if (isMatch) {
          const remainingHashes = [...backupCodes];
          remainingHashes.splice(index, 1);
          logger.info("备用恢复码验证成功:", { remainingCodes: remainingHashes.length });
          return { matched: true, remainingHashes };
        }
      }
      logger.warn("备用恢复码验证失败");
      return { matched: false, remainingHashes: backupCodes };
    } catch (error) {
      logger.error("验证备用恢复码时发生错误:", error);
      return { matched: false, remainingHashes: backupCodes };
    }
  }

  /**
   * G2-14: 把明文恢复码转换为 bcrypt 哈希数组（落库存哈希，明文只返回给用户一次）。
   */
  public static async hashBackupCodes(codes: string[]): Promise<string[]> {
    if (!Array.isArray(codes)) return [];
    return Promise.all(
      codes.map((code) => {
        const normalized = String(code ?? "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "");
        return bcrypt.hash(normalized, 10);
      }),
    );
  }
}
