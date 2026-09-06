import type { Request, Response } from "express";
import { getAuthSessionMetadata, issueTrackedLoginToken } from "../../services/authSessionService";
import { sendEmail } from "../../services/emailSender";
import { TurnstileService } from "../../services/turnstileService";
import {
  generateAccountLockedEmailHtml,
  generateLoginFailureAlertEmailHtml,
  generateLoginIpChangedEmailHtml,
} from "../../templates/emailTemplates";
import { setAuthSessionCookie } from "../../utils/authCookie";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";
import {
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_FAILURE_ALERT_THRESHOLD,
  LOGIN_LOCKOUT_DURATION,
  getLoginRetrySeconds,
  loginAttempts,
} from "./_state";

function summarizeAuthBody(body: any) {
  return {
    hasIdentifier: typeof body?.identifier === "string" && body.identifier.length > 0,
    hasPassword: typeof body?.password === "string" && body.password.length > 0,
    hasCfToken: typeof body?.cfToken === "string" && body.cfToken.length > 0,
    hasTurnstileToken: typeof body?.turnstileToken === "string" && body.turnstileToken.length > 0,
  };
}

// identifier 既可能是用户名也可能是邮箱。getUserByUsername 对非用户名字符串会抛
// "非法的用户名"，必须先按形态分流再查，否则邮箱登录失败走到告警/锁定时会 500。
async function resolveNotifyTarget(identifier: string) {
  return identifier.includes("@")
    ? await UserStorage.getUserByEmail(identifier)
    : await UserStorage.getUserByUsername(identifier);
}

// 辅助函数：写入token和过期时间到users.json
async function updateUserToken(userId: string, token: string, expiresInMs = 2 * 60 * 60 * 1000) {
  await UserStorage.updateUser(userId, {
    token,
    tokenExpiresAt: Date.now() + expiresInMs,
  });
}

export async function login(req: Request, res: Response) {
  const t0 = Date.now();
  try {
    const { password, cfToken, turnstileToken } = req.body;
    const identifier = typeof req.body?.identifier === "string" ? req.body.identifier.trim() : "";
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
      logger.warn("登录失败：identifier 字段缺失", summarizeAuthBody(req.body));
      return res.status(400).json({ error: "请提供用户名或邮箱" });
    }
    if (!password) {
      logger.warn("登录失败：password 字段缺失", summarizeAuthBody(req.body));
      return res.status(400).json({ error: "请提供密码" });
    }

    const turnstileConfig = await TurnstileService.getConfig();
    if (turnstileConfig.enabled) {
      const captchaToken = typeof cfToken === "string" ? cfToken : typeof turnstileToken === "string" ? turnstileToken : "";
      if (!captchaToken) {
        logger.warn("登录失败：缺少 Turnstile 令牌", { identifier, ip });
        return res.status(400).json({ error: "请先完成人机验证" });
      }

      const isValidCaptcha = await TurnstileService.verifyToken(captchaToken, ip);
      if (!isValidCaptcha) {
        logger.warn("登录失败：Turnstile 验证失败", { identifier, ip });
        return res.status(400).json({ error: "人机验证失败，请重试" });
      }
    }

    const logDetails = {
      identifier,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    };

    logger.info("开始用户认证", logDetails);

    // 检查登录尝试限制（按 IP+用户名 键控，防止攻击者锁定任意已知用户）
    const attemptKey = `${ip}:${identifier.toLowerCase()}`;
    const attempts = loginAttempts.get(attemptKey) || { count: 0, lastAttempt: 0 };
    if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
      attempts.count = 0;
      attempts.lockedUntil = undefined;
    }
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
      const remainingMinutes = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `尝试次数过多，请在 ${remainingMinutes} 分钟后重试`,
        code: "LOGIN_LOCKED",
        remainingAttempts: 0,
        attemptLimit: LOGIN_ATTEMPT_LIMIT,
        lockedUntil: attempts.lockedUntil,
        retryAfterSeconds: getLoginRetrySeconds(attempts.lockedUntil),
      });
    }

    // 使用 UserStorage 进行认证
    const user = await UserStorage.authenticateUser(identifier, password);

    if (!user) {
      // 记录失败尝试
      attempts.count += 1;
      attempts.lastAttempt = Date.now();

      // 多次登录失败预警：达到预警阈值时发送提醒邮件（每个锁定窗口仅在 count 恰为阈值时触发一次，且不与锁定邮件同时发送）
      if (attempts.count === LOGIN_FAILURE_ALERT_THRESHOLD) {
        const targetUser = await resolveNotifyTarget(identifier);
        if (targetUser?.email) {
          try {
            const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
            const alertEmailHtml = generateLoginFailureAlertEmailHtml(
              targetUser.username,
              attempts.count,
              LOGIN_ATTEMPT_LIMIT,
              time,
              ip,
              req.headers["user-agent"] || "未知设备"
            );
            sendEmail({
              to: targetUser.email,
              subject: "Synapse 登录安全提醒：检测到多次登录失败",
              html: alertEmailHtml,
              logTag: "登录失败提醒",
              checkQuota: true,
            })
              .then((result) => {
                if (result.success) {
                  logger.info(`[登录失败提醒] 已发送至 ${targetUser.email}`);
                } else {
                  logger.warn(`[登录失败提醒] 邮件发送失败: ${targetUser.email} - ${result.error}`);
                }
              })
              .catch((e) => {
                logger.warn(`[登录失败提醒] 邮件发送异常: ${targetUser.email}`, e);
              });
          } catch (notifyErr) {
            logger.warn("[登录失败提醒] 发送通知邮件失败:", notifyErr);
          }
        }
      }

      if (attempts.count >= LOGIN_ATTEMPT_LIMIT) {
        attempts.lockedUntil = Date.now() + LOGIN_LOCKOUT_DURATION;
        loginAttempts.set(attemptKey, attempts);

        // 发送锁定通知邮件
        const targetUser = await resolveNotifyTarget(identifier);
        if (targetUser?.email) {
          try {
            const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
            const lockEmailHtml = generateAccountLockedEmailHtml(targetUser.username, time, ip, userAgent, "15 分钟");
            sendEmail({
              to: targetUser.email,
              subject: "Synapse 账号登录安全警报",
              html: lockEmailHtml,
              logTag: "账号锁定提醒",
              checkQuota: true,
            })
              .then((result) => {
                if (result.success) {
                  logger.info(`[账号锁定提醒] 已发送至 ${targetUser.email}`);
                } else {
                  logger.warn(`[账号锁定提醒] 邮件发送失败: ${targetUser.email} - ${result.error}`);
                }
              })
              .catch((e) => {
                logger.warn(`[账号锁定提醒] 邮件发送异常: ${targetUser.email}`, e);
              });
          } catch (notifyErr) {
            logger.warn("[账号锁定提醒] 发送通知邮件失败:", notifyErr);
          }
        }

        return res.status(429).json({
          error: "尝试次数过多，账号已锁定 15 分钟",
          code: "LOGIN_LOCKED",
          remainingAttempts: 0,
          attemptLimit: LOGIN_ATTEMPT_LIMIT,
          lockedUntil: attempts.lockedUntil,
          retryAfterSeconds: getLoginRetrySeconds(attempts.lockedUntil),
        });
      }
      loginAttempts.set(attemptKey, attempts);

      // 不区分「用户不存在」和「密码错误」，统一返回模糊提示（防用户名枚举）
      logger.warn("登录失败：用户名或密码错误", logDetails);
      return res.status(401).json({
        error: "用户名/邮箱或密码错误",
        code: "INVALID_CREDENTIALS",
        remainingAttempts: Math.max(0, LOGIN_ATTEMPT_LIMIT - attempts.count),
        attemptLimit: LOGIN_ATTEMPT_LIMIT,
      });
    }
    if ((user as any).accountStatus === "suspended") {
      return res.status(403).json({ error: "账户已被封停", code: "ACCOUNT_SUSPENDED", supportEmail: "support@chloemlla.com" });
    }

    // 登录成功，重置尝试次数
    loginAttempts.delete(attemptKey);

    // 检查用户是否启用了TOTP或Passkey
    const hasTOTP = !!user.totpEnabled;
    const hasPasskey = Array.isArray(user.passkeyCredentials) && user.passkeyCredentials.length > 0;
    if (hasTOTP || hasPasskey) {
      // 使用短期 JWT 作为 2FA 临时令牌，而非明文 userId（防止 2FA 绕过）
      const jwt = require("jsonwebtoken");
      const config = require("../../config/config").config;
      const tempToken = jwt.sign({ userId: user.id, purpose: "2fa_pending" }, config.jwtSecret, { expiresIn: "5m" });
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
        twoFactorType: [hasTOTP ? "TOTP" : null, hasPasskey ? "Passkey" : null].filter(Boolean),
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
    const token = await issueTrackedLoginToken(user, getAuthSessionMetadata(req, { ipAddress: ip }));

    // 异地登录检测：比较当前IP与上次登录IP
    const lastIp = user.lastLoginIp;
    if (lastIp && lastIp !== "unknown" && ip !== "unknown" && lastIp !== ip && user.email) {
      try {
        const loginTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
        const emailHtml = generateLoginIpChangedEmailHtml(user.username, ip, lastIp, loginTime, userAgent);
        sendEmail({
          to: user.email,
          subject: "Synapse 异地登录安全提醒",
          html: emailHtml,
          logTag: "异地登录提醒",
          checkQuota: true,
        })
          .then((result) => {
            if (result.success) {
              logger.info(`[异地登录] 已发送提醒邮件至 ${user.email}，上次IP=${lastIp}，本次IP=${ip}`);
            } else {
              logger.warn(`[异地登录] 提醒邮件发送失败: ${user.email} - ${result.error}`);
            }
          })
          .catch((e) => {
            logger.warn(`[异地登录] 提醒邮件发送异常: ${user.email}`, e);
          });
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
    setAuthSessionCookie(req, res, token);
    res.json({
      user: { id, username, email, role, isTranslationEnabled, translationAccessUntil, accountStatus },
      token,
      authMode: "cookie+bearer",
    });
    logger.info("[login] 已返回登录响应", { 总耗时: `${t1 - t0}ms`, t0, t1 });
    return;
  } catch (error) {
    logger.error("登录流程发生未知错误", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      identifier: req.body?.identifier,
      ip: req.ip,
      body: summarizeAuthBody(req.body),
    });
    res.status(500).json({ error: "登录失败" });
  }
}
