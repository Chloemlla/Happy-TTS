import crypto from "node:crypto";
import type { Request, Response } from "express";
import { VerificationTokenType, verificationTokenStorage } from "../../models/verificationTokenModel";
import { sendEmail } from "../../services/emailSender";
import {
  consumeRegistrationInvite,
  validateRegistrationInviteForRegistration,
} from "../../services/registrationInviteService";
import * as VerificationService from "../../services/verificationService";
import {
  generateVerificationCodeEmailHtml,
  generateVerificationLinkEmailHtml,
  generateWelcomeEmailHtml,
} from "../../templates/emailTemplates";
import { getClientIP } from "../../utils/ipUtils";
import logger from "../../utils/logger";
import { UserStorage } from "../../utils/userStorage";
import {
  MAX_CODE_ATTEMPTS,
  emailCodeMap,
  emailPattern,
  getFrontendBaseUrl,
  verifyRequiredTurnstile,
} from "./_state";

export async function register(req: Request, res: Response) {
  try {
    const { username, email, password, fingerprint, cfToken, turnstileToken, invitationCode } = req.body;
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

    // G2-16: 只信任服务端解析的 IP。客户端自报的 clientIP 不参与任何校验。
    const ipAddress = getClientIP(req);
    const captchaToken = typeof cfToken === "string" ? cfToken : turnstileToken;
    const turnstileError = await verifyRequiredTurnstile(captchaToken, ipAddress, "注册", email);
    if (turnstileError) {
      return res.status(400).json({ error: turnstileError });
    }

    // 仅做诊断日志：前端上报的 clientIP 不参与安全判定
    const reportedClientIp = typeof req.body?.clientIP === "string" ? req.body.clientIP : "";
    if (reportedClientIp && reportedClientIp !== "unknown" && reportedClientIp !== ipAddress) {
      logger.info(`[注册] IP差异检测: 前端=${reportedClientIp}, 后端=${ipAddress}, email=${email}`);
    }
    // 禁止用户名为admin等保留字段，仅注册时校验
    if (username && ["admin", "root", "system", "test", "administrator"].includes(username.toLowerCase())) {
      return res.status(400).json({ error: "用户名不能为保留字段" });
    }
    // 只允许主流邮箱
    if (!emailPattern.test(email)) {
      return res.status(400).json({
        error: "只支持主流邮箱（如gmail、outlook、qq、163、126、hotmail、yahoo、icloud、foxmail、hapxs、hapx等）",
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

    const inviteValidation = await validateRegistrationInviteForRegistration(invitationCode);
    if (!inviteValidation.ok) {
      return res.status(400).json({ error: inviteValidation.error || "邀请码无效" });
    }

    // 创建验证令牌
    const verificationToken = await verificationTokenStorage.createToken(
      VerificationTokenType.EMAIL_REGISTRATION,
      email,
      fingerprint,
      ipAddress,
      { username, email, password, invitationCode: inviteValidation.code },
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
      await verificationTokenStorage.deleteToken(verificationToken.token);
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
export async function verifyEmailLink(req: Request, res: Response) {
  try {
    const { token, fingerprint } = req.body;

    if (!token) {
      return res.status(400).json({ error: "验证令牌缺失" });
    }

    if (!fingerprint) {
      return res.status(400).json({ error: "设备信息缺失" });
    }

    // 获取客户端IP（G2-16：只信任服务端解析的 IP）
    const ipAddress = getClientIP(req);

    // 使用验证服务验证邮箱链接
    const result = await VerificationService.verifyEmailLink(token, fingerprint, ipAddress);

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

export async function verifyEmail(req: Request, res: Response) {
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
    const inviteValidation = await validateRegistrationInviteForRegistration(regInfo.invitationCode);
    if (!inviteValidation.ok) {
      emailCodeMap.delete(email);
      return res.status(400).json({ error: inviteValidation.error || "邀请码无效" });
    }
    const user = await UserStorage.createUser(regInfo.username, regInfo.email, regInfo.password);
    if (!user) {
      emailCodeMap.delete(email);
      return res.status(500).json({ error: "注册失败" });
    }
    const consumeResult = await consumeRegistrationInvite(inviteValidation.code, {
      id: user.id,
      username: user.username,
      email: user.email,
    });
    if (!consumeResult.ok) {
      await UserStorage.deleteUser(user.id);
      emailCodeMap.delete(email);
      return res.status(400).json({ error: consumeResult.error || "邀请码无效" });
    }
    emailCodeMap.delete(email);
    // 发送欢迎邮件（不影响主流程）
    const welcomeHtml = generateWelcomeEmailHtml(regInfo.username);
    sendEmail({
      to: regInfo.email,
      subject: "欢迎加入 Synapse",
      html: welcomeHtml,
      logTag: "欢迎邮件",
      checkQuota: true,
    })
      .then((result) => {
        if (result.success) {
          logger.info(`[欢迎邮件] 已发送至 ${regInfo.email}`);
        } else {
          logger.warn(`[欢迎邮件] 发送失败: ${regInfo.email} - ${result.error}`);
        }
      })
      .catch((e) => {
        logger.warn(`[欢迎邮件] 发送异常: ${regInfo.email}`, e);
      });
    res.json({ success: true });
  } catch (_error) {
    res.status(500).json({ error: "邮箱验证失败" });
  }
}

// 新增：重发验证码接口
export async function sendVerifyEmail(req: Request, res: Response) {
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
    if (!entry?.regInfo) {
      return res.status(400).json({ error: "请先进行注册操作" });
    }

    // 生成8位数字验证码
    const code = crypto.randomInt(0, 100_000_000).toString().padStart(8, "0");

    // 重新发码时重置失败计数
    emailCodeMap.set(email, { code, time: now, regInfo: entry.regInfo, attempts: 0 });

    // 统一邮件发送
    const emailHtml = generateVerificationCodeEmailHtml(entry.regInfo.username, code);
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
