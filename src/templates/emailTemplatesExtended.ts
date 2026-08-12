/**
 * 扩展邮件模板（工作空间 / 账号状态 / API Key 场景）
 * 沿用 email-layout.html 外壳与 security-notice.html 内容模板。
 */

import { escapeHtml, generateSecurityNoticeHtml, renderEmail } from "./emailTemplates";

/**
 * 生成工作空间成员邀请 HTML 邮件内容。
 *
 * 占位符：
 * - `{{inviteeEmail}}`  – 被邀请人邮箱
 * - `{{inviterName}}`   – 邀请人名称
 * - `{{workspaceName}}` – 工作空间名称
 * - `{{role}}`          – 角色（编辑者/查看者）
 * - `{{expiresAt}}`     – 邀请有效期
 */
export function generateWorkspaceInviteEmailHtml(
  inviteeEmail: string,
  inviterName: string,
  workspaceName: string,
  role: string,
  expiresAt: string,
): string {
  const workspaceRoleMap: Record<string, string> = {
    editor: "编辑者",
    viewer: "查看者",
  };
  const roleText = workspaceRoleMap[role] || role;
  return renderEmail("工作空间邀请通知", "workspace-invite.html", {
    inviteeEmail: escapeHtml(inviteeEmail),
    inviterName: escapeHtml(inviterName),
    workspaceName: escapeHtml(workspaceName),
    role: escapeHtml(roleText),
    expiresAt: escapeHtml(expiresAt),
  });
}

/**
 * 生成工作空间邀请已被接受 HTML 邮件内容。
 *
 * 占位符：
 * - `{{inviterName}}`   – 邀请人名称
 * - `{{inviteeName}}`   – 被邀请人名称
 * - `{{workspaceName}}` – 工作空间名称
 */
export function generateWorkspaceInviteAcceptedEmailHtml(
  inviterName: string,
  inviteeName: string,
  workspaceName: string,
): string {
  return renderEmail("邀请已被接受", "workspace-invite-accepted.html", {
    inviterName: escapeHtml(inviterName),
    inviteeName: escapeHtml(inviteeName),
    workspaceName: escapeHtml(workspaceName),
  });
}

/** 账户：账号已被停用 */
export function generateAccountSuspendedEmailHtml(
  username: string,
  reason: string,
  time: string,
  ip: string,
  device: string,
): string {
  return generateSecurityNoticeHtml(
    username,
    "账号已被停用",
    `您的账号已因以下原因被停用：<strong>${escapeHtml(reason)}</strong>。<br/>停用期间登录将被阻止。`,
    time,
    ip,
    device,
    "如果您认为这是误判，请联系管理员申诉以恢复账号。",
  );
}

/** 账户：账号已恢复使用 */
export function generateAccountRestoredEmailHtml(username: string, time: string): string {
  return generateSecurityNoticeHtml(
    username,
    "账号已恢复使用",
    "您的账号已恢复使用，现在可以正常登录系统并访问各项功能。",
    time,
    "系统管理后台",
    "系统自动执行",
    "欢迎回来，请遵守平台规则。",
  );
}

/** 安全事件：多次登录失败提醒 */
export function generateLoginFailureAlertEmailHtml(
  username: string,
  attempts: number,
  limit: number,
  time: string,
  ip: string,
  device: string,
): string {
  return generateSecurityNoticeHtml(
    username,
    "检测到多次登录失败",
    `您的账号在短时间内出现了 <strong>${escapeHtml(String(attempts))}</strong> 次失败的登录尝试（尝试上限 <strong>${escapeHtml(String(limit))}</strong> 次）。`,
    time,
    ip,
    device,
    "如非本人操作请立即修改密码并检查账号安全；如为本人操作请留意登录状态。",
  );
}

/** 资源：API Key 余额不足提醒 */
export function generateApiKeyBalanceLowEmailHtml(
  username: string,
  keyName: string,
  balance: string,
  costPerRequest: string,
): string {
  return generateSecurityNoticeHtml(
    username,
    "API Key 余额不足提醒",
    `您的预付费 API Key <strong>${escapeHtml(keyName)}</strong> 余额已低于预警阈值，当前余额 <strong>${escapeHtml(balance)}</strong>，每请求约消耗 ${escapeHtml(costPerRequest)}。请及时充值以免影响服务。`,
    new Date().toLocaleString(),
    "系统自动检测",
    "N/A",
    "如未及时充值，请求可能失败。",
  );
}

/** 资源：新的 API Key 已创建 */
export function generateApiKeyCreatedEmailHtml(
  username: string,
  keyName: string,
  time: string,
  ip: string,
  device: string,
): string {
  return generateSecurityNoticeHtml(
    username,
    "新的 API Key 已创建",
    `您的账号下已创建新的 API Key：<strong>${escapeHtml(keyName)}</strong>。`,
    time,
    ip,
    device,
    "如非您本人创建，请立即撤销该密钥并修改密码。",
  );
}

