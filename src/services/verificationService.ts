/**
 * 验证服务模块
 * 处理邮箱验证链接和密码重置链接的业务逻辑
 */

import type { Request } from "express";
import { VerificationTokenType, verificationTokenStorage } from "../models/verificationTokenModel";
import {
  generatePasswordResetLinkEmailHtml,
  generateVerificationLinkEmailHtml,
  generateWelcomeEmailHtml,
} from "../templates/emailTemplates";
import logger from "../utils/logger";
import { UserStorage } from "../utils/userStorage";
import { EmailService } from "./emailService";

/**
 * 获取前端基础URL
 */
function getFrontendBaseUrl(): string {
  return process.env.FRONTEND_URL || "https://tts.hapxs.com";
}

/**
 * 获取客户端IP地址（优先使用前端发送的IP）
 */
function getClientIP(req: Request, clientIP?: string): string {
  const serverIP = req.ip || req.connection.remoteAddress || "unknown";
  const ipAddress = clientIP || serverIP;

  // 记录IP比对情况（用于调试和安全分析）
  if (clientIP && clientIP !== serverIP && clientIP !== "unknown" && serverIP !== "unknown") {
    logger.info(`[IP差异检测] 前端IP=${clientIP}, 后端IP=${serverIP}`);
  }

  return ipAddress;
}

/**
 * 创建并发送邮箱验证链接
 * @param email 邮箱地址
 * @param username 用户名
 * @param password 密码
 * @param fingerprint 设备指纹
 * @param ipAddress IP地址
 * @returns 发送结果
 */
export async function createAndSendVerificationLink(
  email: string,
  username: string,
  password: string,
  fingerprint: string,
  ipAddress: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 创建验证令牌
    const verificationToken = verificationTokenStorage.createToken(
      VerificationTokenType.EMAIL_REGISTRATION,
      email,
      fingerprint,
      ipAddress,
      { username, email, password },
    );

    // 生成验证链接
    const frontendBaseUrl = getFrontendBaseUrl();
    const verificationLink = `${frontendBaseUrl}/verify-email?token=${verificationToken.token}`;

    // 发送邮件验证链接
    const emailHtml = generateVerificationLinkEmailHtml(username, verificationLink);
    const emailResult = await EmailService.sendHtmlEmail([email], "Happy-TTS 邮箱验证", emailHtml);

    if (emailResult.success) {
      logger.info(`[邮箱验证链接] 成功发送到: ${email}`);
      return { success: true };
    } else {
      logger.error(`[邮箱验证链接] 发送失败: ${email}, 错误: ${emailResult.error}`);
      verificationTokenStorage.deleteToken(verificationToken.token);
      return { success: false, error: "验证链接发送失败，请稍后重试" };
    }
  } catch (error) {
    logger.error(`[邮箱验证链接] 发送异常: ${email}`, error);
    return { success: false, error: "验证链接发送失败，请稍后重试" };
  }
}

/**
 * 验证邮箱链接并创建用户
 * @param token 验证令牌
 * @param fingerprint 设备指纹
 * @param ipAddress IP地址
 * @returns 验证结果
 */
export async function verifyEmailLink(
  token: string,
  fingerprint: string,
  ipAddress: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // 验证令牌
    const result = verificationTokenStorage.verifyAndUseToken(token, fingerprint, ipAddress);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const verificationData = result.data!;

    // 检查令牌类型
    if (verificationData.type !== VerificationTokenType.EMAIL_REGISTRATION) {
      return { success: false, error: "无效的验证类型" };
    }

    const { username, email, password } = verificationData.metadata;

    // 再次检查用户名/邮箱是否被注册（防止并发）
    const existUser = await UserStorage.getUserByUsername(username);
    const existEmail = await UserStorage.getUserByEmail(email);
    if (existUser || existEmail) {
      verificationTokenStorage.deleteToken(token);
      return { success: false, error: "用户名或邮箱已被使用" };
    }

    // 创建用户
    await UserStorage.createUser(username, email, password);
    verificationTokenStorage.deleteToken(token);

    // 发送欢迎邮件（不影响主流程）
    try {
      const welcomeHtml = generateWelcomeEmailHtml(username);
      await EmailService.sendHtmlEmail([email], "欢迎加入 Happy-TTS", welcomeHtml);
    } catch (e) {
      logger.warn(`[欢迎邮件] 发送失败: ${email}`, e);
    }

    logger.info(`[邮箱验证] 用户 ${username} (${email}) 注册成功`);
    return { success: true, message: "注册成功，请登录" };
  } catch (error) {
    logger.error("[邮箱验证] 验证失败:", error);
    return { success: false, error: "邮箱验证失败" };
  }
}

/**
 * 创建并发送密码重置链接
 * @param email 邮箱地址
 * @param username 用户名
 * @param userId 用户ID
 * @param fingerprint 设备指纹
 * @param ipAddress IP地址
 * @returns 发送结果
 */
export async function createAndSendPasswordResetLink(
  email: string,
  username: string,
  userId: string,
  fingerprint: string,
  ipAddress: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 创建验证令牌
    const verificationToken = verificationTokenStorage.createToken(
      VerificationTokenType.PASSWORD_RESET,
      email,
      fingerprint,
      ipAddress,
      { userId, username, email },
    );

    // 生成重置链接
    const frontendBaseUrl = getFrontendBaseUrl();
    const resetLink = `${frontendBaseUrl}/reset-password?token=${verificationToken.token}`;

    // 发送邮件重置链接
    const emailHtml = generatePasswordResetLinkEmailHtml(username, resetLink);
    const emailResult = await EmailService.sendHtmlEmail([email], "Happy-TTS 密码重置", emailHtml);

    if (emailResult.success) {
      logger.info(`[密码重置] 成功发送到: ${email}`);
      return { success: true };
    } else {
      logger.error(`[密码重置] 发送失败: ${email}, 错误: ${emailResult.error}`);
      verificationTokenStorage.deleteToken(verificationToken.token);
      return { success: false, error: "重置链接发送失败，请稍后重试" };
    }
  } catch (error) {
    logger.error(`[密码重置] 发送异常: ${email}`, error);
    return { success: false, error: "重置链接发送失败，请稍后重试" };
  }
}

/**
 * 验证密码重置链接并更新密码
 * @param token 验证令牌
 * @param fingerprint 设备指纹
 * @param ipAddress IP地址
 * @param newPassword 新密码
 * @returns 验证结果
 */
export async function verifyPasswordResetLink(
  token: string,
  fingerprint: string,
  ipAddress: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // 验证令牌
    const result = verificationTokenStorage.verifyAndUseToken(token, fingerprint, ipAddress);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const verificationData = result.data!;

    // 检查令牌类型
    if (verificationData.type !== VerificationTokenType.PASSWORD_RESET) {
      return { success: false, error: "无效的验证类型" };
    }

    const { userId, username, email } = verificationData.metadata;

    // 获取用户信息
    const user = await UserStorage.getUserById(userId);
    if (!user) {
      verificationTokenStorage.deleteToken(token);
      return { success: false, error: "用户不存在" };
    }

    // 验证新密码强度
    const passwordErrors = UserStorage.validateUserInput(user.username, newPassword, user.email, true);
    if (passwordErrors.length > 0) {
      return { success: false, error: passwordErrors[0].message };
    }

    // 更新密码
    await UserStorage.updateUser(user.id, { password: newPassword });
    verificationTokenStorage.deleteToken(token);

    logger.info(`[密码重置] 用户 ${username} (${email}) 密码重置成功`);
    return { success: true, message: "密码重置成功，请使用新密码登录" };
  } catch (error) {
    logger.error("[密码重置] 重置密码异常:", error);
    return { success: false, error: "密码重置失败" };
  }
}

/**
 * 导出工具函数
 */
export { getClientIP, getFrontendBaseUrl };
