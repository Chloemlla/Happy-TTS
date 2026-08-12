# 邮件通知触发清单

本文档汇总 Synapse 平台所有邮件通知场景的触发时机、收件人与使用模板，供开发与排查参考。

## 发送前提

邮件由 Resend API 发送（`src/services/emailService.ts` 的 `EmailService`）。一次成功的发送需要：

1. `RESEND_API_KEY` 已配置；未配置时发送失败并记录日志，**不阻塞业务主流程**。
2. 收件人邮箱通过 `isValidEmail` 校验（含域名 allowlist：gmail.com、qq.com、chloemlla.com 等）。
3. 用户存在 `email` 字段（多数通知类场景仅在有邮箱时才发送）。
4. 配额：所有邮件（验证码类与全部通知类场景）均以 `checkQuota: true` 计入 `email_quotas` 每日限额。达到每日上限后 `sendEmail` 返回 `{ success: false, error: "验证码发送次数已达上限，请明日再试" }` 且不发送。

统一发送入口：`src/services/emailSender.ts` 的 `sendEmail({ to, subject, html, logTag, checkQuota })`，内建「配额检查 → 发送 → 配额递增 → 日志」。

## 场景总表

### 账户与验证

| 场景 | 触发事件 | 收件人 | 模板生成器 | 内容模板 |
|---|---|---|---|---|
| 邮箱验证码 | 注册 / 改邮箱时请求验证码 | 用户 | `generateVerificationCodeEmailHtml` | verification-code.html |
| 邮箱验证链接 | 注册 / 改邮箱时请求链接 | 用户 | `generateVerificationLinkEmailHtml` | verification-link.html |
| 欢迎邮件 | 注册成功 | 用户 | `generateWelcomeEmailHtml` | welcome.html |
| 第三方注册初始密码 | 第三方登录注册生成系统密码 | 用户 | `generateProviderGeneratedPasswordEmailHtml` | provider-generated-password.html |

### 密码与安全

| 场景 | 触发事件 | 收件人 | 模板生成器 | 内容模板 |
|---|---|---|---|---|
| 密码重置链接 | 用户忘记密码 | 用户 | `generatePasswordResetLinkEmailHtml` | password-reset.html |
| 密码修改通知 | 密码被修改（链接重置方式） | 用户 | `generatePasswordChangedEmailHtml` | password-changed.html |
| 密码重置成功 | 验证码重置方式完成 | 用户 | `generatePasswordResetSuccessEmailHtml` | password-reset-success.html |
| 异地登录提醒 | 检测到新 IP / 设备登录 | 用户 | `generateLoginIpChangedEmailHtml` | login-ip-changed.html |
| **登录多次失败预警** | 登录失败计数达到预警阈值（3 次），早于锁定 | 被攻击账号 | `generateLoginFailureAlertEmailHtml` | security-notice.html |
| 账号锁定 | 登录失败达上限（5 次），锁定 15 分钟 | 被锁定账号 | `generateAccountLockedEmailHtml` | security-notice.html |
| 恢复码使用 | 用户用备用恢复码登录 | 用户 | `generateBackupCodeUsedEmailHtml` | security-notice.html |

### 两步验证（2FA）

| 场景 | 触发事件 | 收件人 | 模板生成器 | 内容模板 |
|---|---|---|---|---|
| TOTP 开启 / 关闭 | 安全设置变更 | 用户 | `generateTOTPEnabledEmailHtml` / `generateTOTPDisabledEmailHtml` | security-notice.html |
| Passkey 添加 / 移除 | 安全设置变更 | 用户 | `generatePasskeyAddedEmailHtml` / `generatePasskeyRemovedEmailHtml` | security-notice.html |

### 管理员操作

| 场景 | 触发事件 | 收件人 | 模板生成器 | 内容模板 |
|---|---|---|---|---|
| 用户信息被修改 | 管理员更新用户（通用变更表） | 被修改用户 | `generateAdminUserUpdatedEmailHtml` | admin-user-updated.html |
| 角色变更 | 管理员修改角色 | 用户 | `generateRoleChangedEmailHtml` | security-notice.html |
| 邮箱变更 | 管理员或用户修改邮箱 | 旧邮箱 + 新邮箱 | `generateEmailChangeOldNoticeHtml` / `generateEmailChangeNewNoticeHtml` | security-notice.html |
| **账号停用** | 管理员单个更新 `active→suspended`，或批量 `action="suspend"` | 被停用用户 | `generateAccountSuspendedEmailHtml` | security-notice.html |
| **账号恢复** | 管理员单个更新 `suspended→active`，或批量 `action="activate"` | 被恢复用户 | `generateAccountRestoredEmailHtml` | security-notice.html |

### 账号生命周期与资源

| 场景 | 触发事件 | 收件人 | 模板生成器 | 内容模板 |
|---|---|---|---|---|
| 注销申请收到 | 用户提交注销请求 | 用户 | `generateAccountDeletionRequestedEmailHtml` | security-notice.html |
| 账号已注销 | 注销完成 | 用户 | `generateAccountDeletedEmailHtml` | security-notice.html |
| 资源到期预警 | 资源到期前 N 天（≤3 天加急） | 用户 | `generateResourceExpiryWarningEmailHtml` | security-notice.html |
| CDK 兑换成功 | 兑换码使用成功 | 用户 | `generateCDKActivatedEmailHtml` | security-notice.html |
| 每日用量警报 | 用量达阈值百分比（含 100% 耗尽） | 用户 | `generateUsageAlertEmailHtml` | security-notice.html |
| **API Key 创建** | `POST /api/keys` 创建成功 | 创建者 | `generateApiKeyCreatedEmailHtml` | security-notice.html |
| **API Key 余额不足** | 预付费扣费后余额**跨过**阈值（默认 100 credits，仅首次跨过触发） | 密钥所属用户 | `generateApiKeyBalanceLowEmailHtml` | security-notice.html |

### 工作空间

| 场景 | 触发事件 | 收件人 | 模板生成器 | 内容模板 |
|---|---|---|---|---|
| **工作区邀请** | 邀请成员成功创建邀请 | 被邀请人邮箱 | `generateWorkspaceInviteEmailHtml` | workspace-invite.html |
| **邀请已被接受** | 被邀请人接受邀请并加入工作区 | 邀请者 | `generateWorkspaceInviteAcceptedEmailHtml` | workspace-invite-accepted.html |

### 工单 / 反馈

| 场景 | 触发事件 | 收件人 | 模板生成器 | 内容模板 |
|---|---|---|---|---|
| 工单收到新回复 | 管理员回复用户工单 | 用户 | `generateFeedbackRepliedEmailHtml` | security-notice.html |
| 新工单创建 | 用户提交新工单 | 管理员 | `generateTicketCreatedEmailHtml` | security-notice.html |
| 工单状态变更 | 工单状态更新 | 用户 | `generateTicketStatusChangedEmailHtml` | security-notice.html |
| 工单言论违规警告 | 检测到不当言论（首次） | 用户 | `generateTicketViolationWarningEmailHtml` | security-notice.html |
| 工单权限封禁 | 多次违规封禁 | 用户 | `generateTicketBannedEmailHtml` | security-notice.html |
| 工单权限恢复 | 封禁解除 | 用户 | `generateTicketUnbannedEmailHtml` | security-notice.html |

## 新增场景（本次扩展）接线位置

| 场景 | 接线文件与位置 |
|---|---|
| 登录多次失败预警 | `src/controllers/authController.ts` 登录失败分支，`count === 3` 时触发（锁定为 5 次） |
| 账号停用 / 恢复 | `src/controllers/adminController.ts` 单个 `updateUser` 状态迁移检测 + 批量 `bulkUpdateUsers`（`action: "suspend" / "activate"`） |
| 工作区邀请 | `src/controllers/workspaceController.ts` `inviteMember` 成功后异步发送 |
| 邀请已被接受 | `src/controllers/workspaceController.ts` `acceptInvitation` 成功后通知邀请者 |
| API Key 创建 | `src/routes/apiKeyRoutes.ts` 创建成功后异步发送 |
| API Key 余额不足 | `src/services/apiKeyBillingService.ts` 预付费扣费后跨过 `LOW_BALANCE_THRESHOLD`（100 credits）时触发 |

## 模板结构

- 共享外壳：`src/templates/email-layout.html`（#F8FAFD 页面底、白卡 + #DADCE0 边框、#041E49 标题、Roboto 字体栈）。
- 内容模板：`src/templates/*.html`（占位符 `{{key}}` 替换）。
- 生成器：`src/templates/emailTemplates.ts`（原有场景）+ `src/templates/emailTemplatesExtended.ts`（工作空间 / 账号状态 / API Key 场景）。
- 通用安全通知内容模板：`src/templates/security-notice.html`（用户名 chip + 标题 + 描述 + 操作时间/IP/设备表 + 提示块），多数安全类场景复用。
