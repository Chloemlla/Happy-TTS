import type { Request, Response } from "express";
import { VerificationTokenType, verificationTokenStorage } from "../../models/verificationTokenModel";
import { revokeAllAuthSessions } from "../../services/authSessionService";
import { sendEmail } from "../../services/emailSender";
import * as VerificationService from "../../services/verificationService";
import {
  generatePasswordChangedEmailHtml,
  generatePasswordResetLinkEmailHtml,
  generatePasswordResetSuccessEmailHtml,
} from "../../templates/emailTemplates";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";
import {
  MAX_CODE_ATTEMPTS,
  emailPattern,
  getFrontendBaseUrl,
  resetPasswordCodeMap,
  verifyRequiredTurnstile,
} from "./_state";

// 忘记密码 - 发送重置验证链接
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email, turnstileToken, cfToken, fingerprint } = req.body;
    if (!email || !emailPattern.test(email)) {
      return res.status(400).json({ error: "邮箱格式不正确" });
    }

    if (!fingerprint) {
      return res.status(400).json({ error: "设备信息缺失" });
    }

    const remoteIp = getClientIP(req);
    const captchaToken = typeof turnstileToken === "string" ? turnstileToken : cfToken;
    const turnstileError = await verifyRequiredTurnstile(captchaToken, remoteIp, "密码重置", email);
    if (turnstileError) {
      return res.status(400).json({ error: turnstileError });
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

    // G2-16: 只信任服务端解析的 IP。客户端自报的 clientIP 不参与任何校验。
    const ipAddress = getClientIP(req);

    // 仅做诊断日志：前端上报的 clientIP 不参与安全判定
    const reportedClientIp = typeof req.body?.clientIP === "string" ? req.body.clientIP : "";
    if (reportedClientIp && reportedClientIp !== "unknown" && reportedClientIp !== ipAddress) {
      logger.info(`[密码重置] IP差异检测: 前端=${reportedClientIp}, 后端=${ipAddress}, email=${email}`);
    }

    // 创建验证令牌
    const verificationToken = await verificationTokenStorage.createToken(
      VerificationTokenType.PASSWORD_RESET,
      email,
      fingerprint,
      ipAddress,
      { userId: user.id, username: user.username, email },
    );

    // 生成重置链接
    const frontendBaseUrl = getFrontendBaseUrl();
    const resetLink = `${frontendBaseUrl}/reset-password?token=${verificationToken.token}`;

    // 统一邮件发送
    const emailHtml = generatePasswordResetLinkEmailHtml(user.username, resetLink);
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
      await verificationTokenStorage.deleteToken(verificationToken.token);
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
export async function resetPasswordLink(req: Request, res: Response) {
  try {
    const { token, fingerprint, newPassword, deviceName } = req.body;

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

    // G2-16: 只信任服务端解析的 IP。
    const ipAddress = getClientIP(req);
    const userAgent = req.headers["user-agent"] || "unknown";
    const resolvedDeviceName = deviceName || userAgent;

    // 使用验证服务重置密码
    const result = await VerificationService.verifyPasswordResetLink(token, fingerprint, ipAddress, newPassword);

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
            fingerprint,
          );
          sendEmail({
            to: result.email,
            subject: "Synapse 账号密码变更通知",
            html: emailHtml,
            logTag: "密码变更通知",
            checkQuota: true,
          })
            .then((sendResult) => {
              if (sendResult.success) {
                logger.info(`[密码变更通知] 已发送至 ${result.email}`);
              } else {
                logger.warn(`[密码变更通知] 邮件发送失败: ${result.email} - ${sendResult.error}`);
              }
            })
            .catch((e) => {
              logger.warn(`[密码变更通知] 邮件发送异常: ${result.email}`, e);
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
export async function validateResetToken(req: Request, res: Response) {
  try {
    const { token, fingerprint } = req.body;

    if (!token) {
      return res.status(400).json({ valid: false, error: "验证令牌缺失" });
    }

    if (!fingerprint) {
      return res.status(400).json({ valid: false, error: "设备信息缺失" });
    }

    // G2-16: 只信任服务端解析的 IP。
    const ipAddress = getClientIP(req);

    // 使用验证令牌存储的 validateToken 方法进行只读检查
    const result = await verificationTokenStorage.validateToken(token, fingerprint, ipAddress);

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
export async function resetPassword(req: Request, res: Response) {
  try {
    const { email, code, newPassword, deviceName, fingerprint: reqFingerprint } = req.body;

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

    // G2-16: 只信任服务端解析的 IP。
    const currentIP = getClientIP(req);
    if (
      entry.ipAddress &&
      entry.ipAddress !== "unknown" &&
      currentIP !== "unknown" &&
      entry.ipAddress !== currentIP
    ) {
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
    const passwordErrors = UserStorage.validateUserInput(user.username, newPassword, user.email, true);
    if (passwordErrors.length > 0) {
      return res.status(400).json({ error: passwordErrors[0].message });
    }

    // 更新密码
    await UserStorage.updateUser(user.id, { password: newPassword });
    // G2-02: 改密后撤销全部会话（含 OAuth token 与 client-token），旧的 JWT 立即失效。
    await revokeAllAuthSessions(user.id);

    // 清除验证码缓存
    resetPasswordCodeMap.delete(email);

    logger.info(`[密码重置] 用户 ${user.username} (${email}) 密码重置成功`);

    // 发送密码重置成功通知邮件（包含设备环境信息）
    try {
      const ipAddress = getClientIP(req);
      const userAgent = req.headers["user-agent"] || "unknown";
      const resolvedDeviceName = deviceName || userAgent;
      const resolvedFingerprint = reqFingerprint || "未提供";
      const changeTime = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      const notifyHtml = generatePasswordResetSuccessEmailHtml(
        user.username,
        changeTime,
        ipAddress,
        resolvedDeviceName,
        resolvedFingerprint,
      );
      sendEmail({
        to: email,
        subject: "Synapse 密码重置成功通知",
        html: notifyHtml,
        logTag: "密码重置成功通知",
        checkQuota: true,
      })
        .then((result) => {
          if (result.success) {
            logger.info(`[密码重置成功通知] 已发送至 ${email}`);
          } else {
            logger.warn(`[密码重置成功通知] 邮件发送失败: ${email} - ${result.error}`);
          }
        })
        .catch((e) => {
          logger.warn(`[密码重置成功通知] 邮件发送异常: ${email}`, e);
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
