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
