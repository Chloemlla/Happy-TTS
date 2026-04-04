import type { Request, Response } from "express";
import {
  VerificationTokenType,
  verificationTokenStorage,
} from "../models/verificationTokenModel";
import { sendEmail } from "../services/emailSender";
import { TurnstileService } from "../services/turnstileService";
import * as VerificationService from "../services/verificationService";
import {
  generatePasswordChangedEmailHtml,
  generatePasswordResetLinkEmailHtml,
  generatePasswordResetSuccessEmailHtml,
  generateVerificationCodeEmailHtml,
  generateVerificationLinkEmailHtml,
  generateWelcomeEmailHtml,
  generateLoginIpChangedEmailHtml,
  generateAccountLockedEmailHtml,
} from "../templates/emailTemplates";
import {
  authenticateGoogleUser,
  getGoogleAuthConfigSummary,
  isGoogleAuthEnabled,
} from "../services/googleAuthService";
import logger from "../utils/logger";
import { type User, UserStorage } from "../utils/userStorage";
import { getClientIP } from "../utils/ipUtils";

// 登录失败尝试次数限制
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_LOCKOUT_DURATION = 15 * 60 * 1000; // 15分钟
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

// 支持的主流邮箱后缀
const allowedDomains = [
  "gmail.com",
  "outlook.com",
  "qq.com",
  "163.com",
  "126.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "foxmail.com",
  "951100.xyz",
];
const emailPattern = new RegExp(
  `^[\\w.-]+@(${allowedDomains.map((d) => d.replace(".", "\\.")).join("|")})$`
);

// 临时存储验证码和注册信息
const emailCodeMap = new Map<string, { code: string; time: number; regInfo: any; attempts: number }>(); // email -> { code, time, regInfo, attempts }
// 临时存储密码重置验证码（含设备指纹和IP用于验证一致性）
const resetPasswordCodeMap = new Map<string, { code: string; time: number; userId: string; attempts: number; fingerprint?: string; ipAddress?: string }>(); // email -> { code, time, userId, attempts, fingerprint, ipAddress }

// 最大验证码失败次数（防暴力枚举）
const MAX_CODE_ATTEMPTS = 5;

// 顶部 import 后添加类型声明
type UserWithVerified = User & { verified?: boolean };

// 获取前端基础URL
function getFrontendBaseUrl(): string {
  return process.env.FRONTEND_URL || "https://tts.951100.xyz";
}

export class AuthController {
  public static getGoogleAuthConfig(_req: Request, res: Response) {
    res.json(getGoogleAuthConfigSummary());
  }

  public static async googleAuth(req: Request, res: Response) {
    try {
      if (!isGoogleAuthEnabled()) {
        return res.status(503).json({ error: "Google Auth is not configured" });
      }

      const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
      if (!idToken) {
        return res.status(400).json({ error: "缺少 Google idToken" });
      }

      const payload = await authenticateGoogleUser({
        idToken,
        clientIp: getClientIP(req),
      });

      return res.json(payload);
    } catch (error) {
      logger.error("[Google Auth] Login failed", error);
      return res.status(400).json({
        error: error instanceof Error ? error.message : "Google 登录失败",
      });
    }
  }

  public static async register(req: Request, res: Response) {
    try {
      const { username, email, password, fingerprint, clientIP } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ error: "请提供所有必需的注册信息" });
      }
      if (!fingerprint) {
        return res.status(400).json({ error: "设备信息缺失" });
      }
      // 用户名格式校验：3-20 位字母数字下划线
      if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({ error: "用户名须为 3-20 位字母、数字或下划线" });
      }
      // 密码强度校验：8-128 位
      if (typeof password !== "string" || password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: "密码长度须在 8-128 字符之间" });
      }

      // 获取客户端IP（优先使用前端发送的IP，否则使用后端获取的）
      const serverIP = req.ip || req.connection.remoteAddress || "unknown";
      const ipAddress = clientIP || serverIP;

      // 记录IP比对情况（用于调试和安全分析）
      if (
        clientIP &&
        clientIP !== serverIP &&
        clientIP !== "unknown" &&
        serverIP !== "unknown"
      ) {
        logger.info(
          `[注册] IP差异检测: 前端=${clientIP}, 后端=${serverIP}, email=${email}`
        );
      }
      // 禁止用户名为admin等保留字段，仅注册时校验
      if (
        username &&
        ["admin", "root", "system", "test", "administrator"].includes(
          username.toLowerCase()
        )
      ) {
        return res.status(400).json({ error: "用户名不能为保留字段" });
      }
      // 只允许主流邮箱
      if (!emailPattern.test(email)) {
        return res.status(400).json({
          error:
            "只支持主流邮箱（如gmail、outlook、qq、163、126、hotmail、yahoo、icloud、foxmail、hapxs、hapx等）",
        });
      }
      // 验证邮箱格式
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "邮箱格式不正确" });
      }
      // 检查用户名或邮箱是否已注册
      const existUser = await UserStorage.getUserByUsername(username);
      const existEmail = await UserStorage.getUserByEmail(email);
      if (existUser || existEmail) {
        return res.status(400).json({ error: "用户名或邮箱已被使用" });
      }

      // 创建验证令牌
      const verificationToken = verificationTokenStorage.createToken(
        VerificationTokenType.EMAIL_REGISTRATION,
        email,
        fingerprint,
        ipAddress,
        { username, email, password }
      );

      // 生成验证链接
      const frontendBaseUrl = getFrontendBaseUrl();
      const verificationLink = `${frontendBaseUrl}/verify-email?token=${verificationToken.token}`;

      // 统一邮件发送
      const emailHtml = generateVerificationLinkEmailHtml(username, verificationLink);
      const result = await sendEmail({
        to: email,
        subject: "Synapse 电子邮件确认",
        html: emailHtml,
        logTag: "邮箱验证链接",
      });

      if (result.success) {
        res.json({
          needVerify: true,
          message: "验证链接已发送到邮箱，请查收",
        });
      } else {
        verificationTokenStorage.deleteToken(verificationToken.token);
        if (result.error?.includes("上限")) {
          res.status(429).json({ error: result.error });
        } else {
          res.status(500).json({ error: "验证链接发送失败，请稍后重试" });
        }
      }
    } catch (_error) {
      res.status(500).json({ error: "注册失败" });
    }
  }

  // 新增：验证邮箱链接
  public static async verifyEmailLink(req: Request, res: Response) {
    try {
      const { token, fingerprint } = req.body;

      if (!token) {
        return res.status(400).json({ error: "验证令牌缺失" });
      }

      if (!fingerprint) {
        return res.status(400).json({ error: "设备信息缺失" });
      }

      // 获取客户端IP
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      // 使用验证服务验证邮箱链接
      const result = await VerificationService.verifyEmailLink(
        token,
        fingerprint,
        ipAddress
      );

      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      logger.error("[邮箱验证] 验证失败:", error);
      res.status(500).json({ error: "邮箱验证失败" });
    }
  }

  public static async verifyEmail(req: Request, res: Response) {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: "参数缺失" });
      }
      if (typeof code !== "string" || !/^[0-9]{8}$/.test(code)) {
        return res.status(400).json({ error: "验证码仅为八位数字" });
      }
      const entry = emailCodeMap.get(email);
      if (!entry) {
        return res.status(400).json({ error: "请先注册获取验证码" });
      }
      // 检查验证码是否过期（10分钟）
      if (Date.now() - entry.time > 10 * 60 * 1000) {
        emailCodeMap.delete(email);
        return res.status(400).json({ error: "验证码已过期，请重新申请" });
      }
      // 失败次数限制（防暴力枚举 10^8 = 1亿）
      if ((entry.attempts || 0) >= MAX_CODE_ATTEMPTS) {
        emailCodeMap.delete(email);
        return res.status(429).json({ error: "验证码尝试次数过多，请重新获取" });
      }
      if (entry.code !== code) {
        entry.attempts = (entry.attempts || 0) + 1;
        emailCodeMap.set(email, entry);
        return res.status(400).json({ error: "验证码错误" });
      }
      // 校验通过，正式创建用户
      const { regInfo } = entry;
      if (!regInfo) {
        return res.status(400).json({ error: "注册信息已过期或无效" });
      }
      // 再次检查用户名/邮箱是否被注册（防止并发）
      const existUser = await UserStorage.getUserByUsername(regInfo.username);
      const existEmail = await UserStorage.getUserByEmail(regInfo.email);
      if (existUser || existEmail) {
        emailCodeMap.delete(email);
        return res.status(400).json({ error: "用户名或邮箱已被使用" });
      }
      await UserStorage.createUser(
        regInfo.username,
        regInfo.email,
        regInfo.password
      );
      emailCodeMap.delete(email);
      // 发送欢迎邮件（不影响主流程）
      const welcomeHtml = generateWelcomeEmailHtml(regInfo.username);
      sendEmail({
        to: regInfo.email,
        subject: "欢迎加入 Synapse",
        html: welcomeHtml,
        logTag: "欢迎邮件",
        checkQuota: false,
      }).catch((e) => {
        logger.warn(`[欢迎邮件] 发送失败: ${regInfo.email}`, e);
      });
      res.json({ success: true });
    } catch (_error) {
      res.status(500).json({ error: "邮箱验证失败" });
    }
  }

  // 新增：重发验证码接口
  public static async sendVerifyEmail(req: Request, res: Response) {
    try {
      const { email } = req.body;
      if (!email || !emailPattern.test(email)) {
        return res.status(400).json({ error: "邮箱格式不正确" });
      }
      const entry = emailCodeMap.get(email);
      const now = Date.now();
      if (entry && now - entry.time < 60000) {
        return res.status(429).json({ error: "请60秒后再试" });
      }

      // 检查是否有注册信息
      if (!entry || !entry.regInfo) {
        return res.status(400).json({ error: "请先进行注册操作" });
      }

      // 生成8位数字验证码
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += Math.floor(Math.random() * 10);
      }

      // 重新发码时重置失败计数
      emailCodeMap.set(email, { code, time: now, regInfo: entry.regInfo, attempts: 0 });

      // 统一邮件发送
      const emailHtml = generateVerificationCodeEmailHtml(
        entry.regInfo.username,
        code
      );
      const result = await sendEmail({
        to: email,
        subject: "Synapse 电子邮件确认码",
        html: emailHtml,
        logTag: "重发邮箱验证码",
      });

      if (result.success) {
        res.json({ success: true });
      } else {
        if (result.error?.includes("上限")) {
          res.status(429).json({ error: result.error });
        } else {
          res.status(500).json({ error: "验证码发送失败，请稍后重试" });
        }
      }
    } catch (_error) {
      res.status(500).json({ error: "验证码发送失败" });
    }
  }

  public static async login(req: Request, res: Response) {
    const t0 = Date.now();
    try {
      const { identifier, password } = req.body;
      const ip = getClientIP(req);
      const userAgent = req.headers["user-agent"] || "unknown";

      // 记录收到的请求体（不记录密码等敏感字段）
      logger.info("收到登录请求", {
        identifier: req.body?.identifier,
        ip,
        userAgent: req.headers?.["user-agent"],
        timestamp: new Date().toISOString(),
      });

      // 验证必填字段
      if (!identifier) {
        logger.warn("登录失败：identifier 字段缺失", { body: req.body });
        return res.status(400).json({ error: "请提供用户名或邮箱" });
      }
      if (!password) {
        logger.warn("登录失败：password 字段缺失", { body: req.body });
        return res.status(400).json({ error: "请提供密码" });
      }

      const logDetails = {
        identifier,
        ip,
        userAgent,
        timestamp: new Date().toISOString(),
      };

      logger.info("开始用户认证", logDetails);

      // 检查登录尝试限制
      const attempts = loginAttempts.get(identifier) || { count: 0, lastAttempt: 0 };
      if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
        const remainingMinutes = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
        return res.status(429).json({ error: `尝试次数过多，请在 ${remainingMinutes} 分钟后重试` });
      }

      // 使用 UserStorage 进行认证
      const user = await UserStorage.authenticateUser(identifier, password);

      if (!user) {
        // 记录失败尝试
        attempts.count += 1;
        attempts.lastAttempt = Date.now();
        if (attempts.count >= LOGIN_ATTEMPT_LIMIT) {
          attempts.lockedUntil = Date.now() + LOGIN_LOCKOUT_DURATION;
          loginAttempts.set(identifier, attempts);
          
          // 发送锁定通知邮件
          const targetUser = await UserStorage.getUserByUsername(identifier) || await UserStorage.getUserByEmail(identifier);
          if (targetUser && targetUser.email) {
            try {
              const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
              const lockEmailHtml = generateAccountLockedEmailHtml(
                targetUser.username,
                time,
                ip,
                userAgent,
                "15 分钟"
              );
              sendEmail({
                to: targetUser.email,
                subject: "Synapse 账号登录安全警报",
                html: lockEmailHtml,
                logTag: "账号锁定提醒",
                checkQuota: false,
              }).catch(e => logger.warn(`[账号锁定提醒] 邮件发送失败: ${targetUser.email}`, e));
            } catch (notifyErr) {
              logger.warn("[账号锁定提醒] 发送通知邮件失败:", notifyErr);
            }
          }
          
          return res.status(429).json({ error: "尝试次数过多，账号已锁定 15 分钟" });
        }
        loginAttempts.set(identifier, attempts);

        // 不区分「用户不存在」和「密码错误」，统一返回模糊提示（防用户名枚举）
        logger.warn("登录失败：用户名或密码错误", logDetails);
        return res.status(401).json({ error: "用户名/邮箱或密码错误" });
      }
      if ((user as any).accountStatus === "suspended") {
        return res.status(403).json({ error: "账户已被封停" });
      }

      // 登录成功，重置尝试次数
      loginAttempts.delete(identifier);

      // 检查用户是否启用了TOTP或Passkey
      const hasTOTP = !!user.totpEnabled;
      const hasPasskey =
        Array.isArray(user.passkeyCredentials) &&
        user.passkeyCredentials.length > 0;
      if (hasTOTP || hasPasskey) {
        // 使用短期 JWT 作为 2FA 临时令牌，而非明文 userId（防止 2FA 绕过）
        const jwt = require("jsonwebtoken");
        const config = require("../config/config").config;
        const tempToken = jwt.sign(
          { userId: user.id, purpose: "2fa_pending" },
          config.jwtSecret,
          { expiresIn: "5m" }
        );
        const tToken = Date.now();
        await updateUserToken(user.id, tempToken, 5 * 60 * 1000); // 5分钟过期
        const tTokenEnd = Date.now();
        logger.info("[login] updateUserToken耗时", {
          耗时: `${tTokenEnd - tToken}ms`,
        });
        // 不返回avatarBase64
        const { id, username, email, role } = user;
        const t1 = Date.now();
        res.json({
          user: { id, username, email, role },
          token: tempToken,
          requires2FA: true,
          twoFactorType: [
            hasTOTP ? "TOTP" : null,
            hasPasskey ? "Passkey" : null,
          ].filter(Boolean),
        });
        logger.info("[login] 已返回二次验证响应", {
          总耗时: `${t1 - t0}ms`,
          t0,
          t1,
        });
        return;
      }

      // 登录成功
      logger.info("登录成功", {
        userId: user.id,
        username: user.username,
        ...logDetails,
      });
      // 生成JWT token
      const jwt = require("jsonwebtoken");
      const config = require("../config/config").config;
      const token = jwt.sign(
        { userId: user.id, username: user.username, role: user.role || "user" },
        config.jwtSecret,
        { expiresIn: "2h" }
      );

      // 异地登录检测：比较当前IP与上次登录IP
      const lastIp = user.lastLoginIp;
      if (lastIp && lastIp !== "unknown" && ip !== "unknown" && lastIp !== ip && user.email) {
        try {
          const loginTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
          const emailHtml = generateLoginIpChangedEmailHtml(
            user.username,
            ip,
            lastIp,
            loginTime,
            userAgent,
          );
          sendEmail({
            to: user.email,
            subject: "Synapse 异地登录安全提醒",
            html: emailHtml,
            logTag: "异地登录提醒",
            checkQuota: false,
          }).catch((e) => {
            logger.warn(`[异地登录] 提醒邮件发送失败: ${user.email}`, e);
          });
          logger.info(`[异地登录] 已发送提醒邮件至 ${user.email}，上次IP=${lastIp}，本次IP=${ip}`);
        } catch (notifyErr) {
          logger.warn("[异地登录] 发送提醒邮件失败:", notifyErr);
        }
      }

      // 更新上次登录IP和时间
      UserStorage.updateUser(user.id, {
        lastLoginIp: ip,
        lastLoginAt: new Date().toISOString(),
      } as any).catch((e) => {
        logger.warn("[登录] 更新lastLoginIp失败:", e);
      });

      // 不再写入user.token，仅返回JWT
      const { id, username, email, role, isTranslationEnabled, translationAccessUntil, accountStatus } = user as any;
      const t1 = Date.now();
      res.json({ user: { id, username, email, role, isTranslationEnabled, translationAccessUntil, accountStatus }, token });
      logger.info("[login] 已返回登录响应", { 总耗时: `${t1 - t0}ms`, t0, t1 });
      return;
    } catch (error) {
      logger.error("登录流程发生未知错误", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        identifier: req.body?.identifier,
        ip: req.ip,
        body: req.body,
      });
      res.status(500).json({ error: "登录失败" });
    }
  }

  public static async getCurrentUser(req: Request, res: Response) {
    try {
      const _ip = req.ip || "unknown";
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "未登录",
        });
      }
      // 使用 substring 而非 split，避免 "Bearer a b" 格式时取错值
      const token = authHeader.substring(7);
      if (!token) {
        return res.status(401).json({
          error: "无效的认证令牌",
        });
      }
      // 只支持JWT token
      let userId: string;
      try {
        const decoded: any = require("jsonwebtoken").verify(
          token,
          require("../config/config").config.jwtSecret
        );
        userId = decoded.userId;
      } catch (_e) {
        return res.status(401).json({ error: "认证令牌无效" });
      }
      // 验证token是否有效（检查用户是否存在）
      const user = await UserStorage.getUserById(userId);
      if (!user) {
        logger.warn("getUserById: 未找到用户", {
          id: userId,
          tokenType: "JWT",
          storageMode: process.env.USER_STORAGE_MODE || "file",
        });
        return res.status(404).json({ error: "用户不存在" });
      }
      if ((user as any).accountStatus === "suspended") {
        return res.status(403).json({ error: "账户已被封停" });
      }
      const remainingUsage = await UserStorage.getRemainingUsage(userId);
      // 不返回avatarBase64
      const { password: _, ...userWithoutPassword } = user;
      res.json({
        ...userWithoutPassword,
        remainingUsage,
      });
    } catch (error) {
      logger.error("获取用户信息失败:", error);
      res.status(500).json({ error: "获取用户信息失败" });
    }
  }

  /**
   * Passkey 二次校验接口
   * @param req.body { username: string, passkeyCredentialId: any }
   */
  public static async passkeyVerify(req: Request, res: Response) {
    try {
      const { username, passkeyCredentialId } = req.body;
      if (!username || !passkeyCredentialId) {
        return res.status(400).json({ error: "缺少必要参数" });
      }

      // 查找用户并验证
      const user = await UserStorage.getUserByUsername(username);
      if (!user) {
        logger.warn("[AuthController] Passkey校验失败：用户不存在", {
          username,
        });
        return res.status(404).json({ error: "用户不存在" });
      }
      if ((user as any).accountStatus === "suspended") {
        return res.status(403).json({ error: "账户已被封停" });
      }

      // 验证用户是否启用了Passkey
      if (
        !user.passkeyEnabled ||
        !Array.isArray(user.passkeyCredentials) ||
        user.passkeyCredentials.length === 0
      ) {
        logger.warn("[AuthController] Passkey校验失败：用户未启用Passkey", {
          username,
          userId: user.id,
          passkeyEnabled: user.passkeyEnabled,
          credentialsCount: user.passkeyCredentials?.length || 0,
        });
        return res.status(400).json({ error: "用户未启用Passkey" });
      }

      // 验证用户名与用户数据的一致性
      if (user.username !== username) {
        logger.error(
          "[AuthController] Passkey校验失败：用户名与用户数据不匹配",
          {
            providedUsername: username,
            actualUsername: user.username,
            userId: user.id,
          }
        );
        return res.status(400).json({ error: "用户名验证失败" });
      }

      // Passkey 验证：调用 PasskeyService 进行真实的密码学验证
      try {
        const { PasskeyService } = require("../services/passkeyService");
        let passkeyResponse = passkeyCredentialId;
        if (typeof passkeyCredentialId === "string") {
          try {
            passkeyResponse = JSON.parse(passkeyCredentialId);
          } catch (e) {
            // 保持原样，PasskeyService 会处理
          }
        }

        const clientIP = getClientIP(req);
        const verification = await PasskeyService.verifyAuthentication(
          user,
          passkeyResponse,
          clientIP,
          clientIP
        );

        if (!verification.verified) {
          return res.status(401).json({ error: "Passkey 校验失败" });
        }

        // 更新用户状态（如添加 passkeyVerified 字段）
        await UserStorage.updateUser(user.id, { passkeyVerified: true });
        logger.info("[AuthController] Passkey 校验通过，已更新用户状态", {
          userId: user.id,
          username,
        });

        // 生成JWT token
        const jwt = require("jsonwebtoken");
        const config = require("../config/config").config;
        const token = jwt.sign(
          { userId: user.id, username: user.username, role: user.role || "user" },
          config.jwtSecret,
          { expiresIn: "2h" }
        );

        logger.info("[AuthController] Passkey验证成功，生成JWT token", {
          userId: user.id,
          username,
          tokenType: "JWT",
        });

        // 异地登录检测（Passkey验证通过后）
        const ip = getClientIP(req);
        const userAgent = req.headers["user-agent"] || "unknown";
        const lastIp = user.lastLoginIp;
        if (lastIp && lastIp !== "unknown" && ip !== "unknown" && lastIp !== ip && user.email) {
          try {
            const loginTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
            const emailHtml = generateLoginIpChangedEmailHtml(
              user.username,
              ip,
              lastIp,
              loginTime,
              userAgent,
            );
            sendEmail({
              to: user.email,
              subject: "Synapse 异地登录安全提醒",
              html: emailHtml,
              logTag: "异地登录提醒(Passkey)",
              checkQuota: false,
            }).catch((e) => {
              logger.warn(`[异地登录] Passkey路径提醒邮件发送失败: ${user.email}`, e);
            });
            logger.info(`[异地登录] Passkey路径已发送提醒邮件至 ${user.email}，上次IP=${lastIp}，本次IP=${ip}`);
          } catch (notifyErr) {
            logger.warn("[异地登录] Passkey路径发送提醒邮件失败:", notifyErr);
          }
        }

        // 更新上次登录IP和时间
        UserStorage.updateUser(user.id, {
          lastLoginIp: ip,
          lastLoginAt: new Date().toISOString(),
        } as any).catch((e) => {
          logger.warn("[登录] Passkey路径更新lastLoginIp失败:", e);
        });

        const { password: _, ...userWithoutPassword } = user;
        return res.json({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isTranslationEnabled: (user as any).isTranslationEnabled,
            translationAccessUntil: (user as any).translationAccessUntil,
            accountStatus: (user as any).accountStatus,
          },
        });
      } catch (passkeyErr) {
        logger.error(`[passkeyVerify] Passkey 验证异常: userId=${user.id}`, passkeyErr);
        return res.status(401).json({ error: "Passkey 校验异常" });
      }
    } catch (error) {
      logger.error("[AuthController] Passkey 校验接口异常", {
        error: error instanceof Error ? error.message : String(error),
        username: req.body?.username,
      });
      return res.status(500).json({ error: "服务器异常" });
    }
  }

  // 忘记密码 - 发送重置验证链接
  public static async forgotPassword(req: Request, res: Response) {
    try {
      const { email, turnstileToken, fingerprint, clientIP } = req.body;
      if (!email || !emailPattern.test(email)) {
        return res.status(400).json({ error: "邮箱格式不正确" });
      }

      if (!fingerprint) {
        return res.status(400).json({ error: "设备信息缺失" });
      }

      // Turnstile验证（如果提供了token）
      if (turnstileToken) {
        const remoteIp = req.ip || req.connection.remoteAddress || "unknown";
        const isValid = await TurnstileService.verifyToken(
          turnstileToken,
          remoteIp
        );
        if (!isValid) {
          logger.warn(
            `[密码重置] Turnstile验证失败: ${email}, IP: ${remoteIp}`
          );
          return res.status(400).json({ error: "人机验证失败，请重试" });
        }
      }

      // 检查用户是否存在
      const user = await UserStorage.getUserByEmail(email);
      if (!user) {
        // 为了安全，不透露用户是否存在
        return res.json({
          success: true,
          message: "如果该邮箱已注册，您将收到密码重置链接",
        });
      }

      // 获取客户端IP（优先使用前端发送的IP，否则使用后端获取的）
      const serverIP = req.ip || req.connection.remoteAddress || "unknown";
      const ipAddress = clientIP || serverIP;

      // 记录IP比对情况（用于调试和安全分析）
      if (
        clientIP &&
        clientIP !== serverIP &&
        clientIP !== "unknown" &&
        serverIP !== "unknown"
      ) {
        logger.info(
          `[密码重置] IP差异检测: 前端=${clientIP}, 后端=${serverIP}, email=${email}`
        );
      }

      // 创建验证令牌
      const verificationToken = verificationTokenStorage.createToken(
        VerificationTokenType.PASSWORD_RESET,
        email,
        fingerprint,
        ipAddress,
        { userId: user.id, username: user.username, email }
      );

      // 生成重置链接
      const frontendBaseUrl = getFrontendBaseUrl();
      const resetLink = `${frontendBaseUrl}/reset-password?token=${verificationToken.token}`;

      // 统一邮件发送
      const emailHtml = generatePasswordResetLinkEmailHtml(
        user.username,
        resetLink
      );
      const result = await sendEmail({
        to: email,
        subject: "Synapse 账号密码重置",
        html: emailHtml,
        logTag: "密码重置",
      });

      if (result.success) {
        res.json({ success: true, message: "重置链接已发送到您的邮箱" });
      } else {
        resetPasswordCodeMap.delete(email);
        if (result.error?.includes("上限")) {
          res.status(429).json({ error: "重置链接发送次数已达上限，请明日再试" });
        } else {
          res.status(500).json({ error: "验证码发送失败，请稍后重试" });
        }
      }
    } catch (error) {
      logger.error("[密码重置] 流程异常:", error);
      res.status(500).json({ error: "密码重置请求失败" });
    }
  }

  // 新增：密码重置链接验证
  public static async resetPasswordLink(req: Request, res: Response) {
    try {
      const { token, fingerprint, newPassword, clientIP, deviceName } = req.body;

      if (!token) {
        return res.status(400).json({ error: "验证令牌缺失" });
      }

      if (!fingerprint) {
        return res.status(400).json({ error: "设备信息缺失" });
      }

      if (!newPassword) {
        return res.status(400).json({ error: "请设置新密码" });
      }

      // 新密码强度校验（前置于服务调用，避免无效请求进入服务层）
      if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ error: "新密码长度须在 8-128 字符之间" });
      }

      // 获取客户端IP（优先使用前端发送的IP）
      const serverIP = req.ip || req.connection.remoteAddress || "unknown";
      const ipAddress = clientIP || serverIP;
      const userAgent = req.headers["user-agent"] || "unknown";
      const resolvedDeviceName = deviceName || userAgent;

      // 使用验证服务重置密码
      const result = await VerificationService.verifyPasswordResetLink(
        token,
        fingerprint,
        ipAddress,
        newPassword
      );

      if (result.success) {
        // 发送密码变更通知邮件（包含设备环境信息）
        try {
          const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

          if (result.email && result.username) {
            const emailHtml = generatePasswordChangedEmailHtml(
              result.username,
              changeTime,
              ipAddress,
              resolvedDeviceName,
              fingerprint
            );
            sendEmail({
              to: result.email,
              subject: "Synapse 账号密码变更通知",
              html: emailHtml,
              logTag: "密码变更通知",
              checkQuota: false,
            }).catch((e) => {
              logger.warn(`[密码变更通知] 邮件发送失败: ${result.email}`, e);
            });
          }
        } catch (notifyError) {
          logger.warn("[密码变更通知] 发送通知邮件失败:", notifyError);
        }

        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error) {
      logger.error("[密码重置] 重置密码异常:", error);
      res.status(500).json({ error: "密码重置失败" });
    }
  }

  // 新增：预验证重置令牌（只读检查设备指纹和IP，不消费令牌）
  public static async validateResetToken(req: Request, res: Response) {
    try {
      const { token, fingerprint, clientIP } = req.body;

      if (!token) {
        return res.status(400).json({ valid: false, error: "验证令牌缺失" });
      }

      if (!fingerprint) {
        return res.status(400).json({ valid: false, error: "设备信息缺失" });
      }

      // 获取客户端IP（优先使用前端发送的IP）
      const serverIP = req.ip || req.connection.remoteAddress || "unknown";
      const ipAddress = clientIP || serverIP;

      // 使用验证令牌存储的 validateToken 方法进行只读检查
      const result = verificationTokenStorage.validateToken(
        token,
        fingerprint,
        ipAddress
      );

      if (result.valid) {
        res.json({ valid: true });
      } else {
        logger.warn(`[重置令牌预验证] 验证失败: ${result.error}`);
        res.status(400).json({ valid: false, error: result.error });
      }
    } catch (error) {
      logger.error("[重置令牌预验证] 异常:", error);
      res.status(500).json({ valid: false, error: "令牌验证失败" });
    }
  }

  // 重置密码 - 验证码验证并更新密码（旧版）
  public static async resetPassword(req: Request, res: Response) {
    try {
      const { email, code, newPassword, clientIP, deviceName, fingerprint: reqFingerprint } = req.body;

      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "参数缺失" });
      }

      if (typeof code !== "string" || !/^[0-9]{8}$/.test(code)) {
        return res.status(400).json({ error: "验证码仅为八位数字" });
      }

      // 前置密码强度校验
      if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
        return res.status(400).json({ error: "新密码长度须在 8-128 字符之间" });
      }

      // 验证验证码
      const entry = resetPasswordCodeMap.get(email);
      if (!entry) {
        return res.status(400).json({ error: "验证码不存在或已过期" });
      }

      // 检查验证码是否过期（10分钟）
      const now = Date.now();
      if (now - entry.time > 10 * 60 * 1000) {
        resetPasswordCodeMap.delete(email);
        return res.status(400).json({ error: "验证码已过期，请重新申请" });
      }

      // 失败次数限制（防暴力枚举）
      if ((entry.attempts || 0) >= MAX_CODE_ATTEMPTS) {
        resetPasswordCodeMap.delete(email);
        return res.status(429).json({ error: "验证码尝试次数过多，请重新申请" });
      }

      // 校验设备指纹（如果存储时有记录）
      if (entry.fingerprint && reqFingerprint && entry.fingerprint !== reqFingerprint) {
        logger.warn(`[密码重置] 设备指纹不匹配: email=${email}`);
        return res.status(403).json({ error: "设备验证失败，请使用发起请求时的相同设备" });
      }

      // 校验IP地址（如果存储时有记录）
      const serverIP2 = req.ip || req.connection.remoteAddress || "unknown";
      const currentIP = clientIP || serverIP2;
      if (entry.ipAddress && entry.ipAddress !== "unknown" && currentIP !== "unknown" && entry.ipAddress !== currentIP) {
        logger.warn(`[密码重置] IP地址不匹配: email=${email}, 存储=${entry.ipAddress}, 当前=${currentIP}`);
        return res.status(403).json({ error: "网络验证失败，请使用发起请求时的相同网络" });
      }

      if (entry.code !== code) {
        entry.attempts = (entry.attempts || 0) + 1;
        resetPasswordCodeMap.set(email, entry);
        return res.status(400).json({ error: "验证码错误" });
      }

      // 获取用户信息
      const user = await UserStorage.getUserById(entry.userId);
      if (!user) {
        resetPasswordCodeMap.delete(email);
        return res.status(404).json({ error: "用户不存在" });
      }

      // 验证新密码强度（调用 UserStorage 层的规则）
      const passwordErrors = UserStorage.validateUserInput(
        user.username,
        newPassword,
        user.email,
        true
      );
      if (passwordErrors.length > 0) {
        return res.status(400).json({ error: passwordErrors[0].message });
      }

      // 更新密码
      await UserStorage.updateUser(user.id, { password: newPassword });

      // 清除验证码缓存
      resetPasswordCodeMap.delete(email);

      logger.info(`[密码重置] 用户 ${user.username} (${email}) 密码重置成功`);

      // 发送密码重置成功通知邮件（包含设备环境信息）
      try {
        const serverIP = req.ip || req.connection.remoteAddress || "unknown";
        const ipAddress = clientIP || serverIP;
        const userAgent = req.headers["user-agent"] || "unknown";
        const resolvedDeviceName = deviceName || userAgent;
        const resolvedFingerprint = reqFingerprint || "未提供";
        const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

        const notifyHtml = generatePasswordResetSuccessEmailHtml(
          user.username,
          changeTime,
          ipAddress,
          resolvedDeviceName,
          resolvedFingerprint
        );
        sendEmail({
          to: email,
          subject: "Synapse 密码重置成功通知",
          html: notifyHtml,
          logTag: "密码重置成功通知",
          checkQuota: false,
        }).catch((e) => {
          logger.warn(`[密码重置成功通知] 邮件发送失败: ${email}`, e);
        });
      } catch (notifyError) {
        logger.warn("[密码重置成功通知] 发送通知邮件失败:", notifyError);
      }

      res.json({ success: true, message: "密码重置成功，请使用新密码登录" });
    } catch (error) {
      logger.error("[密码重置] 重置密码异常:", error);
      res.status(500).json({ error: "密码重置失败" });
    }
  }

  // 新增 POST /api/user/verify 支持邮箱验证码、TOTP等验证方式
  public static async verifyUser(req: Request, res: Response) {
    try {
      const { userId, verificationCode } = req.body;
      if (!userId || !verificationCode) {
        return res.status(400).json({ error: "用户ID或验证码缺失" });
      }

      const user = await UserStorage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "用户不存在" });
      }

      // 检查是否启用了TOTP或Passkey
      const hasTOTP = !!user.totpEnabled;
      const hasPasskey =
        Array.isArray(user.passkeyCredentials) &&
        user.passkeyCredentials.length > 0;

      if (!hasTOTP && !hasPasskey) {
        return res.status(400).json({ error: "用户未启用任何二次验证" });
      }

      let verificationResult = false;
      if (hasTOTP) {
        // TOTP验证（不将 verificationCode 写入日志，防止 OTP 泄露）
        if (user.totpSecret) {
          const totp = require("otplib");
          totp.options = {
            digits: 6,
            step: 30,
            window: 1,
          };
          const isValid = totp.verify({
            secret: user.totpSecret,
            token: verificationCode,
            encoding: "hex",
          });
          if (isValid) {
            verificationResult = true;
            logger.info(`TOTP验证成功: userId=${userId}`);
          } else {
            logger.warn(`TOTP验证失败: userId=${userId}`);
          }
        } else {
          logger.warn(`TOTP验证失败: userId=${userId}, 用户未启用TOTP`);
        }
      }

      if (!verificationResult && hasPasskey) {
        // Passkey 验证：调用 PasskeyService 进行真实的密码学验证
        try {
          const { PasskeyService } = require("../services/passkeyService");
          // 注意：此处 verificationCode 应为完整的 WebAuthn 响应对象（JSON 格式）
          let passkeyResponse = verificationCode;
          if (typeof verificationCode === "string") {
            try {
              passkeyResponse = JSON.parse(verificationCode);
            } catch (e) {
              logger.warn("[verifyUser] verificationCode 不是有效的 JSON 字符串，尝试作为原始 ID 查找");
            }
          }

          if (passkeyResponse && typeof passkeyResponse === "object") {
            const clientIP = req.body.clientIP || req.ip || "unknown";
            const verification = await PasskeyService.verifyAuthentication(
              user,
              passkeyResponse,
              clientIP,
              clientIP
            );

            if (verification.verified) {
              verificationResult = true;
              logger.info(`Passkey 密码学验证成功: userId=${userId}`);
            }
          } else {
            // 回退逻辑：如果不是对象，尝试进行基础 ID 匹配（仅用于向后兼容或特殊简单的验证场景）
            const found = user.passkeyCredentials?.some(
              (cred: any) => cred.credentialID === verificationCode || cred.id === verificationCode
            );
            if (found) {
              verificationResult = true;
              logger.info(`Passkey 基础 ID 匹配成功: userId=${userId}`);
            }
          }
        } catch (passkeyErr) {
          logger.error(`[verifyUser] Passkey 验证异常: userId=${userId}`, passkeyErr);
        }
      }

      if (!verificationResult) {
        return res
          .status(401)
          .json({ error: "验证码错误或用户未启用二次验证" });
      }

      // 验证通过，更新用户状态
      await UserStorage.updateUser(userId, {
        verified: true,
      } as Partial<UserWithVerified>);
      logger.info(`用户 ${userId} 验证成功`);
      // 不返回avatarBase64
      res.json({ success: true });
    } catch (error) {
      logger.error("用户验证失败:", error);
      res.status(500).json({ error: "用户验证失败" });
    }
  }
}

// 辅助函数：写入token和过期时间到users.json
async function updateUserToken(
  userId: string,
  token: string,
  expiresInMs = 2 * 60 * 60 * 1000
) {
  await UserStorage.updateUser(userId, {
    token,
    tokenExpiresAt: Date.now() + expiresInMs,
  });
}

// 校验管理员token
export async function isAdminToken(
  token: string | undefined
): Promise<boolean> {
  if (!token) return false;
  const users = await UserStorage.getAllUsers();
  const user = users.find((u) => u.role === "admin" && u.token === token);
  if (!user) return false;
  if (!user.tokenExpiresAt || Date.now() > user.tokenExpiresAt) return false;
  return true;
}

// 登出接口
export function registerLogoutRoute(app: any) {
  app.post("/api/auth/logout", async (req: any, res: any) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) return res.json({ success: true });
      const users = await UserStorage.getAllUsers();
      const idx = users.findIndex((u: any) => u.token === token);
      if (idx !== -1) {
        await UserStorage.updateUser(users[idx].id, {
          token: undefined,
          tokenExpiresAt: undefined,
        });
      }
      res.json({ success: true });
    } catch (_error) {
      res.status(500).json({ error: "登出失败" });
    }
  });
}
