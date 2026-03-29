/**
 * 邮件模板模块
 *
 * 所有 HTML 邮件模板以独立 .html 文件形式存放在 src/templates/ 目录，
 * 使用 {{placeholder}} 风格的占位符。此模块负责加载模板文件并替换占位符。
 */

import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Template loader & placeholder engine
// ---------------------------------------------------------------------------

/** Cached raw HTML keyed by template file name (loaded once per process). */
const templateCache = new Map<string, string>();

/**
 * 读取模板 HTML 文件并缓存。
 * @param templateFileName 模板文件名（相对于 src/templates/）
 */
function loadTemplate(templateFileName: string): string {
    const cached = templateCache.get(templateFileName);
    if (cached) return cached;

    const filePath = join(__dirname, templateFileName);
    const content = readFileSync(filePath, "utf-8");
    templateCache.set(templateFileName, content);
    return content;
}

/**
 * 将模板中的 `{{key}}` 占位符替换为 `variables` 中对应的值。
 *
 * @param template 原始 HTML 模板字符串
 * @param variables 占位符键值对，键名不含花括号
 * @returns 替换后的 HTML 字符串
 */
function renderTemplate(
    template: string,
    variables: Record<string, string>,
): string {
    let html = template;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{{${key}}}`;
        html = html.split(placeholder).join(value);
    }
    return html;
}

// ---------------------------------------------------------------------------
// Public API – 每种邮件场景对应一个生成函数
// ---------------------------------------------------------------------------

/**
 * 生成邮箱验证码 HTML 邮件内容。
 *
 * 占位符：
 * - `{{username}}` – 用户名
 * - `{{code}}`     – 8 位数字验证码
 */
export function generateVerificationCodeEmailHtml(
    username: string,
    code: string,
): string {
    const tpl = loadTemplate("verification-code.html");
    return renderTemplate(tpl, { username, code });
}

/**
 * 生成邮箱验证链接 HTML 邮件内容。
 *
 * 占位符：
 * - `{{username}}`         – 用户名
 * - `{{verificationLink}}` – 完整验证链接 URL
 */
export function generateVerificationLinkEmailHtml(
    username: string,
    verificationLink: string,
): string {
    const tpl = loadTemplate("verification-link.html");
    return renderTemplate(tpl, { username, verificationLink });
}

/**
 * 生成密码重置链接 HTML 邮件内容。
 *
 * 占位符：
 * - `{{username}}`  – 用户名
 * - `{{resetLink}}` – 完整重置链接 URL
 */
export function generatePasswordResetLinkEmailHtml(
    username: string,
    resetLink: string,
): string {
    const tpl = loadTemplate("password-reset.html");
    return renderTemplate(tpl, { username, resetLink });
}

/**
 * 生成欢迎邮件 HTML 内容。
 *
 * 占位符：
 * - `{{username}}` – 用户名
 */
export function generateWelcomeEmailHtml(username: string): string {
    const tpl = loadTemplate("welcome.html");
    return renderTemplate(tpl, { username });
}

/**
 * 生成密码变更通知 HTML 邮件内容（链接重置方式）。
 *
 * 占位符：
 * - `{{username}}`    – 用户名
 * - `{{changeTime}}`  – 变更时间
 * - `{{ipAddress}}`   – 操作 IP 地址
 * - `{{deviceName}}`  – 设备名称
 * - `{{fingerprint}}` – 设备指纹（前 16 位）
 */
export function generatePasswordChangedEmailHtml(
    username: string,
    changeTime: string,
    ipAddress: string,
    deviceName: string,
    fingerprint: string,
): string {
    const tpl = loadTemplate("password-changed.html");
    return renderTemplate(tpl, {
        username,
        changeTime,
        ipAddress,
        deviceName,
        fingerprint: fingerprint.length > 16 ? fingerprint.substring(0, 16) + "..." : fingerprint,
        adminNotice: "",
    });
}

/**
 * 生成密码重置成功通知 HTML 邮件内容（验证码重置方式）。
 *
 * 占位符：
 * - `{{username}}`    – 用户名
 * - `{{changeTime}}`  – 重置时间
 * - `{{ipAddress}}`   – 操作 IP 地址
 * - `{{deviceName}}`  – 设备名称
 * - `{{fingerprint}}` – 设备指纹（前 16 位）
 */
export function generatePasswordResetSuccessEmailHtml(
    username: string,
    changeTime: string,
    ipAddress: string,
    deviceName: string,
    fingerprint: string,
): string {
    const tpl = loadTemplate("password-reset-success.html");
    return renderTemplate(tpl, {
        username,
        changeTime,
        ipAddress,
        deviceName,
        fingerprint: fingerprint.length > 16 ? fingerprint.substring(0, 16) + "..." : fingerprint,
        adminNotice: "",
    });
}

/**
 * 生成管理员修改密码通知 HTML 邮件内容。
 * 使用 password-changed.html 模板，并填充管理员操作提示和新凭据。
 *
 * @param username     用户名
 * @param changeTime   变更时间
 * @param ipAddress    操作 IP
 * @param deviceName   设备名称
 * @param fingerprint  设备指纹
 * @param adminUsername 执行操作的管理员用户名
 * @param newPassword  新密码（明文，仅在邮件中展示一次）
 */
export function generateAdminPasswordChangedEmailHtml(
    username: string,
    changeTime: string,
    ipAddress: string,
    deviceName: string,
    fingerprint: string,
    adminUsername: string,
    newPassword: string,
): string {
    const tpl = loadTemplate("password-changed.html");

    // 管理员操作提示 + 新凭据块
    const adminNoticeHtml = `
        <div style="margin-top: 16px; margin-bottom: 16px; padding: 16px; background-color: #fef7e0; border: 1px solid #f9ab00; border-radius: 8px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 18px; margin-right: 8px;">&#9888;&#65039;</span>
                <strong style="font-size: 14px; color: #b06000;">管理员操作通知</strong>
            </div>
            <p style="font-size: 13px; color: #5f6368; margin: 0 0 12px 0;">
                您的密码已由管理员 <strong>${adminUsername}</strong> 修改。请使用以下新凭据登录：
            </p>
            <table width="100%" cellspacing="0" cellpadding="0"
                style="border: 1px solid #e8eaed; border-radius: 6px; overflow: hidden;">
                <tr style="background-color: #f8f9fa;">
                    <td style="padding: 10px 16px; font-size: 13px; color: #5f6368; border-bottom: 1px solid #e8eaed; width: 80px;">
                        用户名
                    </td>
                    <td style="padding: 10px 16px; font-size: 13px; color: rgba(0,0,0,0.87); border-bottom: 1px solid #e8eaed; font-weight: 600;">
                        ${username}
                    </td>
                </tr>
                <tr>
                    <td style="padding: 10px 16px; font-size: 13px; color: #5f6368;">
                        新密码
                    </td>
                    <td style="padding: 10px 16px; font-size: 14px; color: rgba(0,0,0,0.87); font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: 1px;">
                        ${newPassword}
                    </td>
                </tr>
            </table>
            <p style="font-size: 12px; color: #d93025; margin: 12px 0 0 0;">
                ❗ 请在登录后立即修改密码，不要将此密码分享给任何人。
            </p>
        </div>`;

    return renderTemplate(tpl, {
        username,
        changeTime,
        ipAddress,
        deviceName,
        fingerprint: fingerprint.length > 16 ? fingerprint.substring(0, 16) + "..." : fingerprint,
        adminNotice: adminNoticeHtml,
    });
}

/**
 * 字段名称映射（英文 → 中文），用于邮件通知中的可读显示。
 */
const FIELD_LABELS: Record<string, string> = {
    username: "用户名",
    email: "邮箱地址",
    role: "角色",
    password: "密码",
    dailyUsage: "每日用量",
    lastUsageDate: "最后使用日期",
    totpEnabled: "两步验证",
    passkeyEnabled: "Passkey",
    avatarUrl: "头像",
};

/**
 * 生成管理员修改用户信息通知 HTML 邮件内容（通用版）。
 * 使用 admin-user-updated.html 模板，列出所有被修改的字段。
 *
 * @param username      用户名
 * @param changeTime    变更时间
 * @param adminUsername 执行操作的管理员用户名
 * @param changes       变更列表 [{ field, oldValue, newValue }]
 * @param newPassword   可选，如果密码被修改则传入明文新密码
 */
export function generateAdminUserUpdatedEmailHtml(
    username: string,
    changeTime: string,
    adminUsername: string,
    changes: Array<{ field: string; oldValue: string; newValue: string }>,
    newPassword?: string,
): string {
    const tpl = loadTemplate("admin-user-updated.html");

    // 构建变更明细表格
    const changeRows = changes
        .filter(c => c.field !== "password") // 密码单独展示
        .map((c, i) => {
            const label = FIELD_LABELS[c.field] || c.field;
            const bg = i % 2 === 0 ? ' style="background-color: #f8f9fa;"' : "";
            return `<tr${bg}>
                <td style="padding: 10px 16px; font-size: 13px; color: #5f6368; border-bottom: 1px solid #e8eaed; width: 100px;">${label}</td>
                <td style="padding: 10px 16px; font-size: 13px; color: rgba(0,0,0,0.54); border-bottom: 1px solid #e8eaed; text-decoration: line-through;">${c.oldValue || "（空）"}</td>
                <td style="padding: 10px 16px; font-size: 13px; color: rgba(0,0,0,0.87); border-bottom: 1px solid #e8eaed; font-weight: 600;">${c.newValue}</td>
            </tr>`;
        })
        .join("\n");

    let changesTableHtml = "";
    if (changeRows) {
        changesTableHtml = `
            <p style="font-size: 14px; color: rgba(0,0,0,0.87); margin-bottom: 8px;">以下信息已被修改：</p>
            <table width="100%" cellspacing="0" cellpadding="0"
                style="margin-bottom: 16px; border: 1px solid #e8eaed; border-radius: 8px; overflow: hidden;">
                <tr style="background-color: #e8eaed;">
                    <td style="padding: 8px 16px; font-size: 12px; color: #5f6368; border-bottom: 1px solid #e8eaed; font-weight: 600;">字段</td>
                    <td style="padding: 8px 16px; font-size: 12px; color: #5f6368; border-bottom: 1px solid #e8eaed; font-weight: 600;">原值</td>
                    <td style="padding: 8px 16px; font-size: 12px; color: #5f6368; border-bottom: 1px solid #e8eaed; font-weight: 600;">新值</td>
                </tr>
                ${changeRows}
            </table>`;
    }

    // 密码变更凭据块
    let credentialsBlockHtml = "";
    if (newPassword) {
        credentialsBlockHtml = `
            <div style="margin-top: 12px; margin-bottom: 16px; padding: 16px; background-color: #fce8e6; border: 1px solid #d93025; border-radius: 8px;">
                <p style="font-size: 14px; color: #d93025; margin: 0 0 12px 0; font-weight: 600;">🔑 您的密码已被重置，请使用以下新凭据登录：</p>
                <table width="100%" cellspacing="0" cellpadding="0"
                    style="border: 1px solid #e8eaed; border-radius: 6px; overflow: hidden;">
                    <tr style="background-color: #f8f9fa;">
                        <td style="padding: 10px 16px; font-size: 13px; color: #5f6368; border-bottom: 1px solid #e8eaed; width: 80px;">用户名</td>
                        <td style="padding: 10px 16px; font-size: 13px; color: rgba(0,0,0,0.87); border-bottom: 1px solid #e8eaed; font-weight: 600;">${username}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px 16px; font-size: 13px; color: #5f6368;">新密码</td>
                        <td style="padding: 10px 16px; font-size: 14px; color: rgba(0,0,0,0.87); font-family: 'Courier New', monospace; font-weight: 700; letter-spacing: 1px;">${newPassword}</td>
                    </tr>
                </table>
                <p style="font-size: 12px; color: #d93025; margin: 12px 0 0 0;">❗ 请在登录后立即修改密码，不要将此密码分享给任何人。</p>
            </div>`;
    }

    return renderTemplate(tpl, {
        username,
        changeTime,
        adminUsername,
        changesTable: changesTableHtml,
        credentialsBlock: credentialsBlockHtml,
    });
}

/**
 * 生成异地登录提醒 HTML 邮件内容。
 *
 * 占位符：
 * - `{{username}}`  – 用户名
 * - `{{currentIp}}` – 本次登录 IP
 * - `{{lastIp}}`    – 上次登录 IP
 * - `{{loginTime}}` – 登录时间
 * - `{{userAgent}}` – 设备 User-Agent
 */
export function generateLoginIpChangedEmailHtml(
    username: string,
    currentIp: string,
    lastIp: string,
    loginTime: string,
    userAgent: string,
): string {
    const tpl = loadTemplate("login-ip-changed.html");
    // 截断过长的 User-Agent
    const shortUA = userAgent.length > 120 ? userAgent.substring(0, 120) + "..." : userAgent;
    return renderTemplate(tpl, {
        username,
        currentIp,
        lastIp,
        loginTime,
        userAgent: shortUA,
    });
}

/**
 * 通用安全通知生成函数（使用 security-notice.html 模板）
 */
function generateSecurityNoticeHtml(
    username: string,
    title: string,
    description: string,
    time: string,
    ip: string,
    device: string,
    warning: string = "如果您并未进行此操作，请立即修改密码并检查账号安全。",
): string {
    const tpl = loadTemplate("security-notice.html");
    const shortUA = device.length > 120 ? device.substring(0, 120) + "..." : device;
    return renderTemplate(tpl, {
        username,
        title,
        description,
        time,
        ip,
        device: shortUA,
        warning,
    });
}

/** 2FA 变更：启用 TOTP */
export function generateTOTPEnabledEmailHtml(username: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "两步验证 (TOTP) 已开启", "您的账号已成功启用两步验证 (TOTP)，账户安全性已得到进一步提升。", time, ip, device, "如果您并未进行此操作，请立即通过其他设备修改密码并尝试找回控制权。");
}

/** 2FA 变更：禁用 TOTP */
export function generateTOTPDisabledEmailHtml(username: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "两步验证 (TOTP) 已关闭", "您的账号已关闭两步验证 (TOTP)。由于安全性降低，建议您尽快重新开启或启用 Passkey。", time, ip, device, "警告：禁用两步验证会显著降低账号安全性。如果您并未进行此操作，您的账号可能已被他人控制，请立即修改密码。");
}

/** 2FA 变更：添加 Passkey */
export function generatePasskeyAddedEmailHtml(username: string, name: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "新 Passkey 已添加", `您的账号已成功添加新的 Passkey 凭证：<strong>${name}</strong>。`, time, ip, device);
}

/** 2FA 变更：删除 Passkey */
export function generatePasskeyRemovedEmailHtml(username: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "Passkey 已移除", "您的账号已移除一个 Passkey 凭证。如果您移除了所有凭证，建议您重新添加或确保 TOTP 已开启。", time, ip, device);
}

/** 安全事件：账号被锁定 */
export function generateAccountLockedEmailHtml(username: string, time: string, ip: string, device: string, duration: string): string {
    return generateSecurityNoticeHtml(username, "账号因异常尝试被锁定", `您的账号在短时间内出现了多次失败的验证尝试，出于安全考虑，系统已暂时锁定您的账号验证功能 <strong>${duration}</strong>。`, time, ip, device, "如果是您本人操作，请在锁定时间结束后重试；如果不是，请考虑修改登录密码。");
}

/** 安全事件：恢复码使用通知 */
export function generateBackupCodeUsedEmailHtml(username: string, remaining: number, time: string, ip: string, device: string): string {
    const warning = remaining <= 2 ? `❗ 警告：您仅剩 ${remaining} 个可用的恢复码，请尽快重新生成。` : "请确保这些操作是您本人进行的。";
    return generateSecurityNoticeHtml(username, "备用恢复码已使用", `您成功使用了一个备用恢复码登录系统。目前您还剩余 <strong>${remaining}</strong> 个可用的恢复码。`, time, ip, device, warning);
}

/** 资源：CDK 兑换成功 */
export function generateCDKActivatedEmailHtml(username: string, cdk: string, info: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "礼品卡/兑换码使用成功", `您已成功兑换了以下资源：<strong>${info}</strong>。<br/>兑换码：<code>${cdk}</code>`, time, ip, device, "祝您使用愉快！");
}

/** 资源：用量警报 */
export function generateUsageAlertEmailHtml(username: string, percent: string, current: number, total: number, time: string): string {
    return generateSecurityNoticeHtml(username, "账号额度消耗警报", `您的每日使用额度已消耗达 <strong>${percent}</strong>。<br/>当前已使用：${current} / 总额度：${total}`, time, "系统自动检测", "N/A", percent === "100%" ? "您的今日额度已耗尽，服务将暂时无法使用，直至额度重置。" : "请注意合理安排您的使用进度。");
}

/** 账户：邮箱变更通知（发送至旧邮箱） */
export function generateEmailChangeOldNoticeHtml(username: string, newEmail: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "账户邮箱已更改", `您的 Synapse 账户邮箱已从当前地址更改为 <strong>${newEmail}</strong>。此后，所有系统通知将发送至新邮箱。`, time, ip, device, "如果您并未进行此操作，请立即通过新邮箱重置密码或联系管理员找回账号。");
}

/** 账户：邮箱变更成功（发送至新邮箱） */
export function generateEmailChangeNewNoticeHtml(username: string, oldEmail: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "账户邮箱绑定成功", `您的 Synapse 账户已成功绑定至此邮箱地址（原邮箱：${oldEmail}）。您现在可以使用此邮箱进行登录和接收通知。`, time, ip, device, "欢迎使用 Synapse 邮件通知服务。");
}

/** 账户：角色/权限变更 */
export function generateRoleChangedEmailHtml(username: string, newRole: string, time: string, ip: string, device: string): string {
    const roleName = newRole === "admin" ? "管理员" : "普通用户";
    return generateSecurityNoticeHtml(username, "账户权限已变更", `您的账户权限级别已更新为：<strong>${roleName}</strong>。这可能会影响您访问特定功能或管理面板的权限。`, time, ip, device, "如果是管理员进行的操作，您无需采取任何行动；如有疑问请联系系统支持。");
}

/** 账户：注销申请确认 */
export function generateAccountDeletionRequestedEmailHtml(username: string, time: string, ip: string, device: string): string {
    return generateSecurityNoticeHtml(username, "账号注销申请已收到", "我们已收到您注销账户的请求。请注意，账号一旦注销，您的所有数据（包括配置、历史记录和余额）将无法恢复。", time, ip, device, "如果您后悔了，请在 24 小时内尝试登录并取消注销申请，或立即联系管理员。");
}

/** 账户：账号已彻底注销 */
export function generateAccountDeletedEmailHtml(username: string, time: string): string {
    return generateSecurityNoticeHtml(username, "账号注销成功", "您的 Synapse 账户及其关联数据已按照您的请求被永久删除。感谢您曾经选择 Synapse。", time, "N/A", "N/A", "再见，祝您前程似锦。");
}

/** 资源：有效期预警 */
export function generateResourceExpiryWarningEmailHtml(username: string, resourceName: string, expiryDate: string, daysLeft: number): string {
    const title = daysLeft <= 3 ? "❗ 资源即将过期提醒" : "资源续期提醒";
    return generateSecurityNoticeHtml(username, title, `您的资源 <strong>${resourceName}</strong> 即将到期。<br/>到期时间：${expiryDate}<br/>剩余时间：<strong>${daysLeft} 天</strong>`, new Date().toLocaleString(), "系统自动检测", "N/A", "为避免影响您的正常使用，请及时通过 CDK 或相关渠道进行续期。");
}

/** 互动：反馈/工单回复通知 */
export function generateFeedbackRepliedEmailHtml(username: string, feedbackTitle: string, replyContent: string, time: string): string {
    const description = `您提交的反馈 <strong>「${feedbackTitle}」</strong> 已得到管理员的回复：<br/><br/><div style="padding: 12px; background: #fff; border-left: 4px solid #4F46E5; font-style: italic;">${replyContent}</div>`;
    return generateSecurityNoticeHtml(username, "您收到了一条新的反馈回复", description, time, "系统支持面板", "Web 终端", "您可以登录系统查看完整对话记录或进行补充。");
}
