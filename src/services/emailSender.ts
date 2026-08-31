/**
 * 统一邮件发送工具
 *
 * 将「配额检查 → 发送 → 配额递增 → 日志记录」的重复逻辑集中于此，
 * 供 authController 及其他业务调用。
 */

import { consumeEmailQuota, EmailService, refundEmailQuota } from "../services/emailService";
import logger from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
  /** 收件人邮箱地址 */
  to: string;
  /** 邮件主题 */
  subject: string;
  /** HTML 邮件正文 */
  html: string;
  /** 日志标签，用于区分业务场景（如 "邮箱验证链接"、"密码重置"） */
  logTag: string;
  /**
   * 是否进行邮件配额检查。
   * 设为 `false` 可跳过配额检查（例如欢迎邮件等不计入配额的场景）。
   * @default true
   */
  checkQuota?: boolean;
  /**
   * G4-17: 配额记账的发起者 userId。已知登录用户时传入（与 emailController 同一套 key）；
   * 未传时（验证码/匿名场景）按收件人邮箱独立记账（domain 命名空间 = "verification"），
   * 避免把邮箱地址与用户 id 混在同一配额线上。
   */
  userId?: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

// G4-17: 验证码/匿名路径使用独立的配额命名空间，不与用户 id 路径互相污染
const VERIFICATION_QUOTA_DOMAIN = "verification";

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * 统一发送 HTML 邮件，内建配额检查与日志。
 *
 * 流程：
 * 1. （可选）原子扣减配额（G4-18：findOneAndUpdate 一次性判定并扣减，配额查询异常 fail-closed）
 * 2. 调用 EmailService.sendHtmlEmail
 * 3. 发送失败时补偿回退配额计数
 * 4. 按统一格式记录日志
 *
 * @returns `SendEmailResult`，调用方根据 `success` 决定后续响应。
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, html, logTag, checkQuota = true, userId } = options;

  // 1. 配额检查（原子扣减，拿不到即超限）
  if (checkQuota) {
    const isUserScoped = typeof userId === "string" && userId.length > 0;
    const quotaKey = isUserScoped ? userId : to;
    const quotaDomain = isUserScoped ? undefined : VERIFICATION_QUOTA_DOMAIN;

    const consumed = await consumeEmailQuota(quotaKey, quotaDomain, 1);
    if (!consumed.success) {
      logger.warn(`[${logTag}] 配额已用尽: ${to}`);
      return {
        success: false,
        error: "验证码发送次数已达上限，请明日再试",
      };
    }

    // 2. 发送邮件
    try {
      const emailResult = await EmailService.sendHtmlEmail([to], subject, html);

      if (emailResult.success) {
        logger.info(`[${logTag}] 成功发送到: ${to}`);
        return { success: true };
      }

      // 3. 发送失败 → 补偿回退
      await refundEmailQuota(quotaKey, quotaDomain, 1);
      logger.error(`[${logTag}] 发送失败: ${to}, 错误: ${emailResult.error}`);
      return { success: false, error: "邮件发送失败，请稍后重试" };
    } catch (sendError) {
      await refundEmailQuota(quotaKey, quotaDomain, 1);
      logger.error(`[${logTag}] 发送异常: ${to}`, sendError);
      return { success: false, error: "邮件发送失败，请稍后重试" };
    }
  }

  // 不计配额路径
  try {
    const emailResult = await EmailService.sendHtmlEmail([to], subject, html);

    if (emailResult.success) {
      logger.info(`[${logTag}] 成功发送到: ${to}`);
      return { success: true };
    }

    logger.error(`[${logTag}] 发送失败: ${to}, 错误: ${emailResult.error}`);
    return { success: false, error: "邮件发送失败，请稍后重试" };
  } catch (sendError) {
    logger.error(`[${logTag}] 发送异常: ${to}`, sendError);
    return { success: false, error: "邮件发送失败，请稍后重试" };
  }
}
