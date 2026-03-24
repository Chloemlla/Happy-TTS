/**
 * 统一邮件发送工具
 *
 * 将「配额检查 → 发送 → 配额递增 → 日志记录」的重复逻辑集中于此，
 * 供 authController 及其他业务调用。
 */

import {
    addEmailUsage,
    EmailService,
    getEmailQuota,
} from "../services/emailService";
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
}

export interface SendEmailResult {
    success: boolean;
    error?: string;
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * 统一发送 HTML 邮件，内建配额检查与日志。
 *
 * 流程：
 * 1. （可选）检查邮件配额
 * 2. 调用 EmailService.sendHtmlEmail
 * 3. 成功后递增配额计数
 * 4. 按统一格式记录日志
 *
 * @returns `SendEmailResult`，调用方根据 `success` 决定后续响应。
 */
export async function sendEmail(
    options: SendEmailOptions,
): Promise<SendEmailResult> {
    const { to, subject, html, logTag, checkQuota = true } = options;

    // 1. 配额检查
    if (checkQuota) {
        try {
            const quota = await getEmailQuota(to);
            if (quota.used >= quota.total) {
                logger.warn(
                    `[${logTag}] 配额已用尽: ${to}, used=${quota.used}, total=${quota.total}`,
                );
                return {
                    success: false,
                    error: "验证码发送次数已达上限，请明日再试",
                };
            }
        } catch (e) {
            // 配额查询异常不阻断主流程
            logger.warn(`[${logTag}] 配额查询异常: ${to}`, e);
        }
    }

    // 2. 发送邮件
    try {
        const emailResult = await EmailService.sendHtmlEmail([to], subject, html);

        if (emailResult.success) {
            // 3. 递增配额计数
            if (checkQuota) {
                try {
                    await addEmailUsage(to, 1);
                } catch (e) {
                    logger.warn(`[${logTag}] 配额递增失败`, { email: to, error: e });
                }
            }

            logger.info(`[${logTag}] 成功发送到: ${to}`);
            return { success: true };
        }

        logger.error(
            `[${logTag}] 发送失败: ${to}, 错误: ${emailResult.error}`,
        );
        return { success: false, error: "邮件发送失败，请稍后重试" };
    } catch (sendError) {
        logger.error(`[${logTag}] 发送异常: ${to}`, sendError);
        return { success: false, error: "邮件发送失败，请稍后重试" };
    }
}
