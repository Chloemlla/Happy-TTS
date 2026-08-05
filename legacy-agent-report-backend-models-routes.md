# 后端数据模型层与路由层扫描报告

## 严重度计数

| Severity | Count | Confirmed | Suspected |
| --- | ---: | ---: | ---: |
| High | 3 | 3 | 0 |
| Medium | 10 | 10 | 0 |
| Low | 6 | 6 | 0 |
| Info | 4 | 4 | 0 |
| **Total** | **23** | **23** | **0** |

## 发现项列表

| ID | Severity | Type | Description | Location |
| --- | --- | --- | --- | --- |
| F-001 | Medium | 敏感数据泄露 | NexAI 同步模型明文存储用户密码 | src/models/nexaiSyncModel.ts:62-71 |
| F-002 | Medium | 敏感数据泄露 | NexAI 同步模型明文存储 API Key/令牌 | src/models/nexaiSyncModel.ts:86-116 |
| F-003 | High | 数据完整性 | 用户删除后关联数据无级联清理 | 42+ 模型通过 userId 引用 |
| F-004 | Info | 代码质量 | mongoose 导入方式不一致 | 多文件 |
| F-005 | Medium | 架构设计 | Archive 模型嵌套子文档过深，易超 16MB | src/models/archiveModel.ts:58-83 |
| F-006 | Medium | 数据管理 | CDK 模型 expiresAt 缺少 TTL 索引 | src/models/cdkModel.ts:37 |
| F-007 | Low | 代码质量 | BroadcastLog 模型缺少 TypeScript 接口定义 | src/models/broadcastLogModel.ts |
| F-008 | Medium | 存储设计 | CollaborationSession id 字段与 _id 冲突 | src/models/collaborationSessionModel.ts:99 |
| F-009 | Low | 代码质量 | ecoEnchantsModel addIndex 包装器静默失败 | src/models/ecoEnchantsModel.ts:6-10 |
| F-010 | High | 敏感数据泄露 | ecoEnchants webhook 存储完整原始 payload 含 PII | src/models/ecoEnchantsModel.ts:446 |
| F-011 | Low | 代码质量 | ecoEnchantsModel MixedType 降级链可能回退到 Object | src/models/ecoEnchantsModel.ts:3 |
| F-012 | Low | 输入验证 | ShortUrl 模型 target 无 URL 校验 | src/models/shortUrlModel.ts:14 |
| F-013 | Low | 数据管理 | SecurityEvent 模型缺少 TTL 索引 | src/models/securityEventModel.ts |
| F-014 | Low | 数据管理 | DeviceTracking 模型缺少 TTL 索引 | src/models/deviceTrackingModel.ts |
| F-015 | Info | 设计模式 | VerificationToken 使用 setInterval 清理而非 TTL | src/models/verificationTokenModel.ts:328-343 |
| F-016 | Medium | 数据管理 | OAuth Token accessTokenExpiresAt 无 TTL | src/models/oauthModel.ts:146-149 |
| F-017 | High | 代码质量 | Admin 路由多处 require() 动态导入 | src/routes/admin/users.ts:55, profile.ts:221 |
| F-018 | Medium | 信息泄露 | Admin 短链路由 console.log 泄漏加密元信息 | src/routes/admin/shortlinks.ts |
| F-019 | Medium | 逻辑矛盾 | 头像上传 SVG 拒绝逻辑与允许类型列表矛盾 | src/routes/admin/profile.ts:43 vs 708 |
| F-020 | Low | 鉴权设计 | 广播路由依赖父级中间件鉴权 | src/routes/admin/broadcast.ts |
| F-021 | Low | 兼容性 | Webhook 路由 express.raw 硬编码 JSON 类型 | src/routes/webhookRoutes.ts:27 |
| F-022 | Medium | 代码质量 | TTS 路由 Turnstile/Clarity 端点遗留 console.log | src/routes/ttsRoutes.ts:142-143, 185-186 |
| F-023 | Info | 死代码 | Collaboration 类型枚举 PAUSED 未使用 | src/types/collaboration.ts:72 |
| F-024 | Info | 构建问题 | 邮件模板 __dirname 路径构建后可能失效 | src/templates/emailTemplates.ts:27 |

## 评分

| Dimension | Score |
| --- | ---: |
| Design | 6/10 |
| Security | 6/10 |
| Data Integrity | 5/10 |
| Code Quality | 7/10 |

**扣分项:**
- -1: 用户数据删除后无级联清理，40+ 模型可能产生孤儿数据
- -1: NexAI 同步模型明文存储用户密码/API Key，缺乏应有的静态加密
- -1: ecoEnchants webhook 完整存储原始 payload 含敏感信息
- -0.5: 多处使用 require() 动态导入绕过类型检查
- -0.5: 多个日志模型缺少 TTL 索引，数据无限累积

**加分项:**
- 路由治理系统完善，有 RouteGovernance 验证框架
- 多数模型索引设计合理，覆盖了常见查询模式
- 部分敏感字段（Bilibili 凭证、OAuth 令牌）使用了 select: false 和加密存储
- 模型集合名称使用 collection 显式指定，命名规范
- 路由限流、鉴权、审计日志策略声明完整
- 邮件模板使用 Google 风格的安全通知设计，XSS 防护到位（escapeHtml）

## 详细分析 (Medium+)

### F-003 | High | 用户删除后关联数据无级联清理

**位置**: 42+ 模型通过 `userId: string` 引用用户

**问题**: 所有模型都使用纯字符串 `userId` 字段引用用户，没有使用 Mongoose `ref` 或任何外键约束。当管理员删除用户时，没有任何级联删除逻辑，导致以下集合产生孤儿数据：

- 认证相关: accessTokens, authSessions, verificationTokens
- API 相关: apiKeys, apiKeyBillingEvents
- 同步相关: bilibili_account_bindings, bilibili_sync, nexai_sync, nexai_sync_v2_records
- 协作相关: collaboration_sessions, invitations, workspaces (members), voice_projects
- 财务相关: linuxdo_credit_orders, cdks (usedBy)
- 其他: device_trackings, tickets, translation_logs, user_preferences, recommendation_history, audit_logs, security_events, oauth_clients/grants/tokens/authorization_codes

**建议**: 在用户删除服务中添加级联清理逻辑，遍历所有相关集合删除或标记为已删除。使用 `pre('deleteOne')` 中间件钩子实现。

### F-010 | High | ecoEnchants webhook 存储完整原始 payload

**位置**: src/models/ecoEnchantsModel.ts:446

**问题**: `WebhookEventSchema` 的 `rawPayload` 字段定义为 `{ type: String, required: true }`，存储来自 Stripe、PayPal、Polymart 的完整原始 webhook 请求体。这些 payload 可能包含：
- 客户姓名、邮箱地址、账单地址等 PII
- 支付金额、货币、卡号末四位等敏感支付信息
- 订阅详情、订单历史
- 完整的 HTTP 请求头（headers 字段存储为 MixedType）

该集合 `ecoenchants_webhook_events` 没有 TTL 索引，数据永久保留。

**建议**:
1. 添加 TTL 索引（如 90 天过期）
2. 只存储已验证的必要字段，避免存储完整原始 payload
3. 如必须存储原始 payload 用于审计，使用 AES 加密

### F-017 | High | Admin 路由多处 require() 动态导入

**位置**: src/routes/admin/users.ts:55, src/routes/admin/profile.ts:221

**问题**: `admin/users.ts` 和 `admin/profile.ts` 中频繁使用 `require()` 动态导入，而不是顶层 `import`：

```typescript
const { getUserById, updateUser } = require("../../services/userService");
const { wsService } = require("../../services/wsService");
const { getUserAuthById } = require("../../services/userService");
const { IPFSService } = require("../../services/ipfsService");
const { PasskeyService } = require("../../services/passkeyService");
const { TOTPService } = require("../../services/totpService");
```

这些问题：
1. 绕过 TypeScript 类型检查，路径错误只能在运行时发现
2. require() 被包裹在 try/catch 中可能导致静默失败
3. 模块内部结构变化时无编译时警告
4. 与项目其余部分的 ES module 风格不一致

**建议**: 将所有 `require()` 替换为顶层 `import` 语句。

### F-001/F-002 | Medium | NexAI 同步模型明文存储敏感凭据

**位置**: src/models/nexaiSyncModel.ts:62-71 (密码), :86-116 (API Key)

**问题**: `nexai_sync` 集合中存储了用户的多类敏感数据且均为明文：

1. `savedPasswordSchema` (:62-71): `password` 字段为明文字符串，存储用户保存的密码
2. `settingsSchema` (:86-116): 以下字段均为明文：
   - apiKey - OpenAI API Key
   - webdavPassword - WebDAV 密码
   - upstashToken - Upstash Redis 令牌
   - vertexApiKey - Google Vertex AI API Key

这与 `bilibiliAccountBindingModel` 的做法不一致（后者使用 `credentialCiphertext` + `credentialIv` + `credentialTag` 的 AES-GCM 加密模式）。

**建议**: 对所有敏感凭据字段使用 AES-GCM 加密存储，复用项目中已有的加密模式。

### F-005 | Medium | Archive 模型嵌套子文档过深

**位置**: src/models/archiveModel.ts:58-83

**问题**: `ArchiveSchema` 在单个文档中嵌套了多层子文档数组：
- `files: [{ fileName, originalSize, modifiedAt, source }]` — 文件列表
- `ipfsUpload.uploadResults: [{ archiveFileName, ipfsCid, ipfsUrl, web2Url, fileSize, uploadSuccess, error }]` — IPFS 上传结果

归档操作可能包含数百个文件，这些内嵌数组会快速膨胀，超出 MongoDB 16MB 文档大小限制，且在查询时即使只取元数据也会加载整个文档。

**建议**: 将 `files` 和 `uploadResults` 分离到独立集合，Archive 文档只保留聚合统计字段（totalFiles, compressedTotalSize 等）。

### F-006 | Medium | CDK 模型 expiresAt 缺少 TTL 索引

**位置**: src/models/cdkModel.ts:37

**问题**: `CDKSchema.index({ expiresAt: 1 })` 是普通索引，不是 TTL 索引。已过期的 CDK 兑换码不会自动清理，无限累积。MongoDB TTL 索引需要 `expireAfterSeconds: 0` 参数：`CDKSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })`。

与此对比，项目中有 7 个其他模型正确使用了 TTL 索引（accessTokenModel, ipBanModel, ipVerificationTokenModel, oauthAuthorizationCodeModel, tempFingerprintModel, policyConsentModel, auditLogModel）。

**建议**: 改为 `CDKSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })`。

### F-008 | Medium | CollaborationSession id 与 _id 冲突

**位置**: src/models/collaborationSessionModel.ts:99

**问题**: Schema 定义 `id: { type: String, required: true, unique: true }`，但 Mongoose 默认会创建 `_id: ObjectId`。每个文档同时存储两个标识符，浪费存储空间并增加索引维护成本。此外，`id` 字段与 Mongoose 虚拟属性 `id`（返回 `_id` 的字符串表示）可能产生命名冲突。

**建议**: 添加 `{ _id: false }` 选项，或直接使用 Mongoose 默认 `_id` 作为唯一标识符。

### F-016 | Medium | OAuth Token accessTokenExpiresAt 无 TTL

**位置**: src/models/oauthModel.ts:146-149

**问题**: `OAuthTokenSchema` 仅对 `refreshTokenExpiresAt` 设置了 TTL 索引，但 `accessTokenExpiresAt` 没有。accessToken 通常在数分钟到数小时内过期，但过期的 accessToken 会永久保留在 `oauth_tokens` 集合中，随着时间累积大量无用数据。

**建议**: 为 `accessTokenExpiresAt` 添加 TTL 索引：`OAuthTokenSchema.index({ accessTokenExpiresAt: 1 }, { expireAfterSeconds: 0 })`。

### F-018 | Medium | Admin 短链路由 console.log 泄漏加密元信息

**位置**: src/routes/admin/shortlinks.ts

**问题**: 短链管理 API 的每个请求处理步骤都输出详细的 `console.log`，包括：
- Token 长度（"Token获取成功，长度:", token.length）
- IV hex 值（"IV (hex):", iv.toString("hex")）
- 加密前后数据大小（"原始数据长度:", jsonData.length, "加密后数据长度:", encrypted.length）
- 加密算法和密钥长度（"加密算法:", algorithm, "密钥长度:", key.length）

虽然这些不是密钥本身，但 IV 和密钥长度信息有助于攻击者分析加密方案，在日志可被访问时构成信息泄露风险。

**建议**: 移除或降级这些调试日志为 `debug` 级别，且不在生产环境输出。

### F-019 | Medium | 头像上传 SVG 拒绝逻辑与允许类型列表矛盾

**位置**: src/routes/admin/profile.ts:43 vs 708

**问题**: 同一文件中有两处互相矛盾的逻辑：
1. 第 43 行的 multer fileFilter 明确拒绝 SVG 文件上传并返回错误
2. 第 708 行的 /user/avatar POST 端点的 allowedTypes 列表中包含 "image/svg+xml"

前端用户看到 "允许 SVG" 但实际上传时会收到 fileFilter 返回的错误 "出于安全考虑，已禁止上传 SVG 文件"，体验矛盾。

**建议**: 从 allowedTypes 列表中移除 image/svg+xml，或更新 fileFilter 使其与允许列表一致。

### F-022 | Medium | TTS 路由 Turnstile/Clarity 端点遗留 console.log

**位置**: src/routes/ttsRoutes.ts:142-143, 185-186

**问题**: `GET /turnstile/config` 和 `GET /clarity/config` 端点中遗留了 `console.log` 调试输出：

```typescript
console.log("Turnstile config response:", {
  enabled: turnstileConfig.enabled,
  siteKey: turnstileConfig.siteKey,
  siteKeyType: typeof turnstileConfig.siteKey,
});
console.log("Clarity config response:", {
  enabled: clarityConfig.enabled,
  projectId: clarityConfig.projectId,
  projectIdType: typeof clarityConfig.projectId,
});
```

这些日志在生产环境中不必要，且可能泄漏配置信息（如 siteKey）。

**建议**: 移除这些 `console.log` 语句，必要时替换为 `logger.debug`。