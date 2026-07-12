# Google GSI Full Adapt

## Goal
完整适配 Google Identity Services (GSI) Web 登录，严格对齐官方指南：
https://developers.google.cn/identity/gsi/web/guides/get-google-api-clientid

## Requirements
1. OAuth Client 类型必须是 **Web application**，拒绝/明确提示 `installed`（桌面）客户端。
2. 主站 Google 登录仅需 Client ID（id_token 校验），不需要 client secret。
3. 管理后台可导入 Google Cloud 下载的 `web` JSON，自动提取 `client_id`。
4. 支持环境变量引导默认值：`GOOGLE_CLIENT_ID`、`NEXAI_GOOGLE_CLIENT_ID`。
5. 前端 GSI 脚本、CSP、COOP、initialize 参数完整可用。
6. 管理端 UI 与文档给出 Authorized JavaScript origins 配置指引。
7. 补充单元测试覆盖 client JSON 提取与校验。

## Out of scope
- 改为授权码 + 后端 redirect 的 OAuth 流程
- 修改 NexAI 与主站账号体系合并策略

## Acceptance
- 导入 web JSON 成功；导入 installed-only JSON 返回明确错误
- clientId 格式校验为 `*.apps.googleusercontent.com`
- `/api/auth/google/config` 在配置后返回 enabled+clientId
- 文档可按步骤完成 Google Cloud Console 配置
