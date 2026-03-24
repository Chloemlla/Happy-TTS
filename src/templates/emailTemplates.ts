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
    return Object.entries(variables).reduce(
        (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
        template,
    );
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
