# MongoDB → Prisma 7.4.0 迁移参考文档

> 本文档整理了后端项目中所有 MongoDB/Mongoose 数据库操作，方便进行 Prisma 依赖替换。

---

## 1. 当前 MongoDB 相关依赖 (`package.json`)

| 包名 | 版本 | 说明 |
|------|------|------|
| `mongoose` | `^9.2.1` | Mongoose ODM |
| `mongodb` | `^7.1.0` | MongoDB 原生驱动 |
| `mongodb-connection-string-url` | `^7.0.1` | URI 解析工具 |

---

## 2. 数据库连接服务

### `src/services/mongoService.ts` — 核心连接入口

- **导出**: `mongoose`, `connectMongo()`, `isConnected()`, `waitForConnection()`, `ensureConnection()`
- **默认数据库**: `tts`（URI 无 db 时自动补全）
- **连接池**: `maxPoolSize=20`, `minPoolSize=5`, `maxIdleTimeMS=30000`
- **重试**: 3 次，间隔 2s
- **代理**: 支持 SOCKS5 / HTTP

**Prisma 替换要点:**
- `mongoose.connect()` → `PrismaClient.$connect()`
- `mongoose.connection.readyState === 1` → Prisma 连接状态检查
- 全局 `mongoose` 实例被几乎所有 service/model 引用，需全量替换

---

## 3. 所有 Mongoose Models — Schema 定义汇总

### 3.1 `src/models/` 目录下的独立 Model 文件

#### AccessTokenModel (`src/models/accessTokenModel.ts`)
- **集合**: 自动（`accesstokens`）
- **字段**: `token`(unique), `fingerprint`, `ipAddress`, `createdAt`, `updatedAt`, `expiresAt`
- **索引**: TTL(`expiresAt`), 复合(`token+fingerprint+ipAddress`), 复合(`fingerprint+ipAddress+expiresAt`), 复合(`ipAddress+expiresAt`)
- **特性**: `timestamps: true`, TTL 自动删除

#### ApiKeyModel (`src/models/apiKeyModel.ts`)
- **集合**: 自动（`apikeys`）
- **字段**: `keyId`(unique), `keyHash`(unique), `name`, `userId`, `permissions[]`, `rateLimit`, `expiresAt`, `lastUsedAt`, `lastUsedIp`, `usageCount`, `enabled`, `createdAt`, `updatedAt`
- **索引**: TTL(`expiresAt`, partial filter `$ne: null`), `keyId`, `keyHash`, `userId`
- **特性**: `timestamps: true`

#### ArchiveModel (`src/models/archiveModel.ts`)
- **集合**: `archives`
- **字段**: `archiveName`, `archiveFileName`, `createdAt`, `createdBy`, `sourceDirectory`, `databaseLogsIncluded`, `fileSystemLogsIncluded`, `totalFiles`, `originalTotalSize`, `compressedTotalSize`, `overallCompressionRatio`, `compressionType`, `includePattern`, `excludePattern`, `files[]`(嵌套), `ipfsUpload`(嵌套含 `uploadResults[]`)
- **索引**: `archiveName`, `createdAt`, `createdBy`, `ipfsUpload.uploadResults.ipfsCid`
- **特性**: `timestamps: true`, 嵌套文档

#### AuditLogModel (`src/models/auditLogModel.ts`)
- **集合**: `audit_logs`
- **字段**: `userId`, `username`, `role`, `action`, `module`(enum), `targetId`, `targetName`, `result`(enum), `errorMessage`, `detail`(Mixed), `ip`, `userAgent`, `path`, `method`, `createdAt`
- **索引**: `createdAt`(TTL 90天), `module+createdAt`, `userId+createdAt`, `action+createdAt`
- **特性**: 90天 TTL 自动清理

#### CDKModel (`src/models/cdkModel.ts`)
- **集合**: 自动（`cdks`）
- **字段**: `code`(unique), `resourceId`, `isUsed`, `usedAt`, `usedIp`, `usedBy`(嵌套: userId+username), `expiresAt`, `createdAt`
- **索引**: `code`(unique), `resourceId`, `isUsed`, `expiresAt`, `createdAt`, 多个复合索引
- **特性**: `timestamps: { createdAt: true, updatedAt: false }`

#### CollaborationSessionModel (`src/models/collaborationSessionModel.ts`)
- **集合**: `collaboration_sessions`
- **字段**: `id`(unique), `projectId`, `participants[]`(嵌套含 cursorPosition/selection/pendingChanges), `state`(嵌套 ProjectContent), `pendingOperations[]`, `startedAt`, `lastActivity`, `status`(enum)
- **索引**: `id`, `projectId`, `status`, `participants.userId`, `lastActivity`
- **特性**: 深度嵌套子文档

#### FBIWantedModel (`src/models/fbiWantedModel.ts`)
- **集合**: 自动（`fbiwanteds`）
- **字段**: `name`, `aliases[]`, `age`, `height`, `weight`, `eyes`, `hair`, `race`, `nationality`, `dateOfBirth`, `placeOfBirth`, `charges[]`, `description`, `reward`, `photoUrl`, `fingerprints[]`, `lastKnownLocation`, `dangerLevel`(enum), `status`(enum), `dateAdded`, `lastUpdated`, `fbiNumber`(unique), `ncicNumber`, `occupation`, `scarsAndMarks[]`, `languages[]`, `caution`, `remarks`, `isActive`
- **索引**: 多个单字段+复合索引, **全文搜索索引**(name/description/charges/aliases/fbiNumber/ncicNumber 带权重)
- **特性**: `timestamps: true`, `pre('save')` 中间件, 全文搜索

#### InvitationModel (`src/models/invitationModel.ts`)
- **集合**: `invitations`
- **字段**: `id`(unique), `workspaceId`, `inviteeEmail`, `role`(enum), `status`(enum), `createdAt`, `expiresAt`
- **索引**: `id`, `workspaceId`, `inviteeEmail`, `status`, `expiresAt`

#### IpBanModel (`src/models/ipBanModel.ts`)
- **集合**: 自动（`ipbans`）
- **字段**: `ipAddress`(unique), `reason`, `violationCount`, `bannedAt`, `expiresAt`, `fingerprint`, `userAgent`
- **索引**: TTL(`expiresAt`), 复合(`ipAddress+expiresAt`), 复合(`fingerprint+expiresAt`)
- **特性**: `timestamps: true`, TTL 自动删除

#### PolicyConsentModel (`src/models/policyConsentModel.ts`)
- **集合**: `policy_consents`
- **字段**: `id`(unique), `timestamp`, `version`, `fingerprint`, `checksum`, `userAgent`, `ipAddress`, `recordedAt`, `isValid`, `expiresAt`
- **索引**: TTL(`expiresAt`), 复合(`fingerprint+version`), 复合(`ipAddress+recordedAt`)
- **特性**: `timestamps: true`, TTL, 静态方法(`findValidConsent`, `cleanExpiredConsents`, `getStats`), 实例方法(`isExpired`), **聚合管道**(`aggregate`)

#### RecommendationHistoryModel (`src/models/recommendationHistoryModel.ts`)
- **集合**: `recommendation_history`
- **字段**: `userId`(unique), `generations[]`(嵌套 GenerationRecord 含 VoiceStyle), `totalCount`, `lastUpdated`
- **索引**: `userId`, `lastUpdated`

#### ResourceModel (`src/models/resourceModel.ts`)
- **集合**: 自动（`resources`）
- **字段**: `title`, `description`, `downloadUrl`, `price`, `category`, `imageUrl`, `isActive`, `createdAt`, `updatedAt`
- **索引**: `isActive`, `category`, `createdAt`, **全文搜索**(`title+description`)
- **特性**: `timestamps: true`

#### ShortUrlModel (`src/models/shortUrlModel.ts`)
- **集合**: `short_urls`
- **字段**: `code`(unique), `target`, `userId`, `username`, `createdAt`
- **索引**: `code`(unique), `userId`, `createdAt`

#### TempFingerprintModel (`src/models/tempFingerprintModel.ts`)
- **集合**: 自动（`tempfingerprints`）
- **字段**: `fingerprint`(unique), `ipAddress`, `verified`, `createdAt`, `updatedAt`, `expiresAt`
- **索引**: TTL(`expiresAt`), 复合(`fingerprint+verified`)
- **特性**: `timestamps: true`, TTL 自动删除

#### UserPreferencesModel (`src/models/userPreferencesModel.ts`)
- **集合**: `user_preferences`
- **字段**: `userId`(unique), `recommendationSettings`(嵌套), `notificationSettings`(嵌套), `privacySettings`(嵌套), `updatedAt`
- **索引**: `userId`, `updatedAt`

#### VerificationTokenModel (`src/models/verificationTokenModel.ts`)
- **⚠️ 非 MongoDB**: 使用内存 `Map` 存储，无需迁移到 Prisma（或可选迁移到 Redis/DB）

#### VersionModel (`src/models/versionModel.ts`)
- **集合**: `versions`
- **字段**: `id`(unique), `projectId`, `versionNumber`, `snapshot`(嵌套 ProjectContent), `authorId`, `changeSummary`, `createdAt`
- **索引**: `id`, `projectId+versionNumber`, `projectId+createdAt`, `authorId`

#### VoiceProjectModel (`src/models/voiceProjectModel.ts`)
- **集合**: `voice_projects`
- **字段**: `id`(unique), `name`, `ownerId`, `workspaceId`, `content`(嵌套), `sharing`(嵌套), `activeViewers[]`, `createdAt`, `updatedAt`
- **索引**: `id`, `ownerId`, `workspaceId`, `sharing.sharedWith`, `createdAt`

#### WorkspaceModel (`src/models/workspaceModel.ts`)
- **集合**: `workspaces`
- **字段**: `id`(unique), `name`, `description`, `creatorId`, `members[]`(嵌套), `settings`(嵌套), `memberLimit`, `createdAt`, `updatedAt`
- **索引**: `id`, `creatorId`, `members.userId`, `createdAt`

---

### 3.2 Service 文件中的内联 Schema（非 `src/models/` 目录）

> 这些 Schema 直接定义在 Service 文件中，迁移时也需要提取为 Prisma model。

| 文件 | Model 名 | 集合名 | 主要字段 |
|------|----------|--------|----------|
| `src/services/userService.ts` | `UserData` | `user_datas` | id, username, email, password, role, dailyUsage, lastUsageDate, token, tokenExpiresAt, totpSecret, totpEnabled, backupCodes[], passkeyEnabled, passkeyCredentials[](嵌套), pendingChallenge, currentChallenge, passkeyVerified, avatarUrl, requireFingerprint, fingerprints[](嵌套) |
| `src/services/libreChatService.ts` | `LibreChatImage` | `librechat_images` | userId, imageUrl, createdAt |
| `src/services/libreChatService.ts` | `LibreChatLatest` | `librechat_latest` | _id(固定'latest'), updateTime, updateTimeShanghai, imageUrl, updatedAt |
| `src/services/libreChatService.ts` | `LibreChatHistory` | `librechat_histories` | userId, messages(Array), updatedAt, deleted, deletedAt |
| `src/services/libreChatService.ts` | `ChatProvider` | `chat_providers` | baseUrl, apiKey, model, enabled, weight, group, updatedAt |
| `src/services/shortUrlService.ts` | `ShortUrlSetting` | `shorturl_settings` | key, value, updatedAt |
| `src/services/rateLimiter.ts` | `RateLimit` | `rate_limits` | ip(unique), minute[], hour[], day[] |
| `src/services/emailService.ts` | `EmailQuota` | `email_quotas` | userId, domain, used, resetAt |
| `src/services/outEmailService.ts` | `OutEmailRecord` | `outemail_records` | to, subject, content, sentAt, ip |
| `src/services/outEmailService.ts` | `OutEmailQuota` | `outemail_quotas` | date, minute, countDay, countMinute |
| `src/services/outEmailService.ts` | `OutEmailSetting` | `outemail_settings` | domain, code, updatedAt |
| `src/services/tamperService.ts` | `BlockedIP` | `blocked_ips` | ip(unique), reason, blockedAt, expiresAt |
| `src/services/turnstileService.ts` | `TurnstileSetting` | `turnstile_settings` | key, value, updatedAt |
| `src/services/turnstileService.ts` | `HCaptchaSetting` | `hcaptcha_settings` | key, value, updatedAt |
| `src/services/turnstileService.ts` | `SHCTrace` | `shc_traces` | traceId(unique), time, ip, ua, success, reason, errorCode, errorMessage, score, riskLevel, riskScore, riskReasons[], verificationMethod, fingerprint, violationCount, banned, banExpiresAt, cfErrorCodes[] |
| `src/services/clarityService.ts` | `ClaritySetting` | `clarity_settings` | key(unique), value, updatedAt |
| `src/services/clarityService.ts` | `ClarityHistory` | `clarity_history` | key, oldValue, newValue, operation(enum), changedBy, changedAt, metadata(嵌套) |
| `src/services/dataCollectionService.ts` | `DataCollection` | `data_collections` | userId, action, timestamp, details(Mixed), riskScore, riskLevel(enum), analysis(Mixed), hash, duplicate, category, tags[] |
| `src/services/ip.ts` | `IPInfo` | `ip_infos` | ip(unique), country, region, city, isp, timestamp, queryCount, lastQueried |
| `src/services/webhookEventService.ts` | `WebhookEvent` | `webhook_events` | provider, routeKey, eventId, type, created_at, to(Mixed), subject, status, data(Mixed), raw(Mixed), receivedAt, updatedAt |
| `src/services/webhookEventService.ts` | `WebhookSecret` | `webhook_settings` | provider, key, secret, updatedAt |
| `src/services/userGenerationService.ts` | `UserGeneration` | `user_generations` | userId, text, voice, model, outputFormat, speed, fileName, contentHash, timestamp |
| `src/services/queryStatsService.ts` | `AntaQueryStats` | `anta_query_stats` | productId(unique), queryCount, officialQueryCount, firstQueried, lastQueried, ipAddresses[] |
| `src/services/queryStatsService.ts` | `AntaQueryHistory` | `anta_query_history` | productId, timestamp, ipAddress, userAgent |

### 3.3 Storage 子目录中的 Mongo 实现

| 文件 | Model 名 | 集合名 | 主要字段 |
|------|----------|--------|----------|
| `src/services/commandStorage/mongo.ts` | `CommandQueue` | `command_queue` | commandId(unique), command, status, addedAt |
| `src/services/commandStorage/mongo.ts` | `ExecutionHistory` | `command_history` | historyId(unique), command, executedAt, ... |
| `src/services/lotteryStorage/mongo.ts` | `LotteryRound` | `lottery_rounds` | id(unique), data(Object) |
| `src/services/lotteryStorage/mongo.ts` | `LotteryUser` | `lottery_users` | userId(unique), data(Object) |
| `src/services/modlistStorage/mongo.ts` | `ModList` | `modlist` | name(unique), id(unique), hash, md5 |
| `src/services/userGenerationStorage/mongo.ts` | `UserGeneration` | `user_generations` | userId, text, voice, model, ... |

---

## 4. 所有数据库 CRUD 操作汇总（按 Service 文件）

### 4.1 `src/services/userService.ts` — 用户管理

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 获取所有用户 | `UserModel.find().lean()` | 全量查询 |
| 按 ID 查用户 | `UserModel.findOne({ id }).select(...).lean()` | 带字段选择 |
| 按用户名查 | `UserModel.findOne({ username }).select(...).lean()` | |
| 按邮箱查 | `UserModel.findOne({ email }).select(...).lean()` | |
| 创建用户 | `UserModel.create(user)` | |
| 更新用户 | `UserModel.findOneAndUpdate({ id }, updateOps, { new: true }).lean()` | |
| 删除用户 | `UserModel.deleteOne({ id })` | |

### 4.2 `src/services/shortUrlService.ts` — 短链服务

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 查短链 | `ShortUrlModel.findOne({ code })` | |
| 创建短链 | `ShortUrlModel.create(...)` | 带事务 session |
| 删除短链 | `ShortUrlModel.findOneAndDelete({ code })` | 带事务 session |
| 用户短链列表 | `ShortUrlModel.find({ userId }).sort().skip().limit()` | 分页 |
| 计数 | `ShortUrlModel.countDocuments({ userId })` | |
| 批量删除 | `ShortUrlModel.bulkWrite([deleteOne...])` | |
| 流式导出 | `ShortUrlModel.find().cursor()` | 游标流式读取 |
| 全量删除 | `ShortUrlModel.deleteMany({})` | |
| 读取 AES 密钥 | `ShortUrlSettingModel.findOne({ key: { $eq: 'AES_KEY' } }).lean()` | 内联 Schema |

### 4.3 `src/services/webhookEventService.ts` — Webhook 事件

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 创建事件 | `WebhookEventModel.create(doc)` | |
| 列表查询 | `WebhookEventModel.find(query).sort().skip().limit().lean()` | 分页 |
| 计数 | `WebhookEventModel.countDocuments(query)` | |
| 聚合统计 | `WebhookEventModel.aggregate([...])` | 按 provider/routeKey 分组 |
| 按 ID 查 | `WebhookEventModel.findById(id).lean()` | |
| 更新 | `WebhookEventModel.findByIdAndUpdate(id, ...)` | |
| 删除 | `WebhookEventModel.findByIdAndDelete(id)` | |
| 读取密钥 | `WebhookSecretModel.findOne({ provider, key }).lean()` | |

### 4.4 `src/services/libreChatService.ts` — LibreChat 聊天

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 加载最新记录 | `LatestRecordModel.findById('latest').lean()` | 单例文档 |
| 保存/更新最新记录 | `LatestRecordModel.findByIdAndUpdate('latest', ..., { upsert: true })` | upsert |
| 加载图片记录 | `ImageRecordModel.findOne().sort({ createdAt: -1 }).lean()` | |
| 加载聊天历史 | `ChatHistoryModel.findOne().sort({ updatedAt: -1 }).lean()` | |
| 更新聊天历史 | `ChatHistoryModel.findOneAndUpdate({ userId }, { $set: ... }, { upsert: true })` | upsert |
| 查询聊天历史 | `ChatHistoryModel.findOne({ userId, deleted: { $ne: true } }).lean()` | |
| 加载提供者 | `ChatProviderModel.find({ enabled: { $ne: false } }).lean()` | |

### 4.5 `src/services/dataCollectionService.ts` — 数据收集

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 批量写入 | `DataCollectionModel.bulkWrite([insertOne...], { ordered: false })` | 批量插入，非顺序 |

### 4.6 `src/services/clarityService.ts` — Clarity 分析

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 读取配置 | `ClaritySettingModel.findOne({ key }).lean().exec()` | |
| 更新配置 | `ClaritySettingModel.findOneAndUpdate({ key }, ..., { upsert: true })` | upsert |
| 删除配置 | `ClaritySettingModel.findOneAndDelete({ key })` | |
| 记录历史 | `ClarityHistoryModel.create(...)` | |
| 查询历史 | `ClarityHistoryModel.find({ key }).sort().limit().lean()` | |

### 4.7 `src/services/turnstileService.ts` — Turnstile/hCaptcha 验证

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 读取密钥 | `TurnstileSettingModel.findOne({ key }).lean().exec()` | |
| 更新密钥 | `TurnstileSettingModel.findOneAndUpdate({ key }, ..., { upsert: true })` | |
| 删除密钥 | `TurnstileSettingModel.findOneAndDelete({ key })` | |
| 读取 hCaptcha 密钥 | `HCaptchaSettingModel.findOne({ key }).lean().exec()` | |
| 创建溯源记录 | `SHCTraceModel.create(...)` | |
| 查询溯源 | `SHCTraceModel.findOne({ traceId })` | |
| 更新溯源 | `SHCTraceModel.updateOne({ traceId }, ...)` | |
| 上报临时指纹 | `TempFingerprintModel` 操作 | 引用自 models |
| 创建访问令牌 | `AccessTokenModel` 操作 | 引用自 models |
| 检查 IP 封禁 | `IpBanModel.findOne({ ipAddress, expiresAt: { $gt: new Date() } }).lean()` | |
| 记录违规 | `IpBanModel.findOne() → .save()` 或 `IpBanModel.create()` | |

### 4.8 `src/services/rateLimiter.ts` — 速率限制

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 加载数据 | `RateLimitModel.find().lean()` | |
| 保存数据 | `RateLimitModel.findOneAndUpdate({ ip }, data, { upsert: true })` | 逐条 upsert |

### 4.9 `src/services/emailService.ts` — 邮件配额

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 获取配额 | `EmailQuotaModel.findOne({ userId, domain })` | |
| 更新配额 | `EmailQuotaModel.findOneAndUpdate({ userId, domain }, ..., { upsert: true })` | upsert |
| 重置配额 | `EmailQuotaModel.findOneAndUpdate({ userId, domain }, ..., { upsert: true })` | |
| 增加用量 | `quota.save()` | 实例保存 |

### 4.10 `src/services/outEmailService.ts` — 对外邮件

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 获取配额 | `OutEmailQuota.findOne({ date })` | |
| 创建配额 | `OutEmailQuota.create(...)` | |
| 保存配额 | `quota.save()` | 实例保存 |
| 记录发送 | `OutEmailRecord.create(...)` | |
| 批量记录 | `OutEmailRecord.insertMany(records)` | |
| 读取校验码 | `OutEmailSetting.findOne({ domain }).lean()` | |

### 4.11 `src/services/tamperService.ts` — 篡改防护

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 加载封禁 IP | `BlockedIPModel.find({}).lean()` | |
| 保存封禁 IP | `BlockedIPModel.deleteMany({})` + `BlockedIPModel.insertMany(...)` | 全量替换 |

### 4.12 `src/services/ip.ts` — IP 信息查询

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 初始化加载 | `IPInfoModel.find({}, projection).lean().limit(10000).sort()` | 批量加载到内存 |
| 批量写入 | `IPInfoModel.bulkWrite([updateOne...], { ordered: false })` | 批量 upsert |
| 单条查询 | `IPInfoModel.findOne({ ip }, projection).lean()` | |
| 更新统计 | `IPInfoModel.updateOne({ ip }, { $inc, $set })` | 异步更新 |
| 清理过期 | `IPInfoModel.deleteMany({ timestamp: { $lt: ... } })` | |
| 全量清理 | `IPInfoModel.deleteMany({})` | |
| 计数 | `IPInfoModel.countDocuments()` | |

### 4.13 `src/services/transactionService.ts` — 事务管理

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 开启事务 | `mongoose.startSession()` + `session.startTransaction()` | |
| 提交/回滚 | `session.commitTransaction()` / `session.abortTransaction()` | |
| 检查事务支持 | `mongoose.connection.db.admin().command({ ismaster: 1 })` | 检查副本集 |
| 批量生成 CDK | `CDKModel.insertMany(cdks, { session })` | 带事务 |
| 删除资源+CDK | `ResourceModel.findByIdAndDelete().session()` + `CDKModel.deleteMany().session()` | 带事务 |

### 4.14 `src/services/ipBanSyncService.ts` — IP 封禁同步

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 查询未过期封禁 | `IpBanModel.find({ expiresAt: { $gt: new Date() } }).lean()` | MongoDB → Redis 同步 |

### 4.15 `src/services/queryStatsService.ts` — 安踏查询统计

| 操作 | Mongoose 方法 | 说明 |
|------|--------------|------|
| 记录查询 | `QueryStatsModel.findOneAndUpdate({ productId }, ..., { upsert: true })` | upsert |
| 记录历史 | `QueryHistoryModel.create(...)` | |
| 获取统计 | `QueryStatsModel.findOne({ productId }).lean()` | |
| 获取历史 | `QueryHistoryModel.find({ productId }).sort().limit().lean()` | |

### 4.16 Storage 子目录操作

#### `src/services/commandStorage/mongo.ts`
- `CommandQueueModel.find({ status: 'pending' }).sort().lean()`
- `CommandQueueModel.create(...)`
- `CommandQueueModel.deleteOne({ commandId })`
- `ExecutionHistoryModel.find().sort().limit().lean()`
- `ExecutionHistoryModel.create(...)`

#### `src/services/lotteryStorage/mongo.ts`
- `RoundModel.find().lean()` / `RoundModel.findOne({ id })` / `RoundModel.create(...)`
- `UserModel.findOne({ userId })` / `UserModel.create(...)` / `doc.save()`

#### `src/services/modlistStorage/mongo.ts`
- `ModModel.find().lean()` / `ModModel.findOne({ name|id })` / `ModModel.create(...)`
- `ModModel.deleteOne({ id })` / `mod.save()`

#### `src/services/userGenerationStorage/mongo.ts`
- `GenerationModel.findOne(query).lean()` / `GenerationModel.create(...)`

---

## 5. 需要特别注意的 MongoDB 特性（Prisma 迁移难点）

### 5.1 TTL 索引（自动过期删除）
以下集合使用了 MongoDB TTL 索引，Prisma 不原生支持，需用定时任务替代：

| Model | 字段 | TTL |
|-------|------|-----|
| AccessToken | `expiresAt` | 即时过期 (`expireAfterSeconds: 0`) |
| IpBan | `expiresAt` | 即时过期 |
| TempFingerprint | `expiresAt` | 即时过期 |
| AuditLog | `createdAt` | 90 天 |
| PolicyConsent | `expiresAt` | 即时过期 |
| ApiKey | `expiresAt` | 即时过期（partial filter） |
| IPInfo | `timestamp` | 1 小时 |

### 5.2 全文搜索索引
- `FBIWantedModel`: 带权重的全文搜索（name/description/charges/aliases/fbiNumber/ncicNumber）
- `ResourceModel`: 全文搜索（title/description）
- **Prisma 替代**: 使用 `@fulltext` 或外部搜索引擎（如 Meilisearch/Elasticsearch）

### 5.3 聚合管道 (`aggregate`)
- `PolicyConsentModel.getStats()`: `$match` → `$group` → `$project` → `$sort`
- `WebhookEventService.list()`: 按 provider/routeKey 分组统计
- **Prisma 替代**: 使用 `groupBy()` 或 `$runCommandRaw()`

### 5.4 事务 (`session`)
- `TransactionService.executeTransaction()`: 使用 `mongoose.startSession()` + `startTransaction()`
- 用于 CDK 批量生成、资源删除等原子操作
- **Prisma 替代**: `prisma.$transaction([...])`

### 5.5 批量操作 (`bulkWrite`)
- `DataCollectionService`: `bulkWrite([insertOne...], { ordered: false })`
- `ip.ts`: `bulkWrite([updateOne...], { ordered: false })`
- `ShortUrlService`: `bulkWrite([deleteOne...])`
- **Prisma 替代**: `createMany()`, `updateMany()`, `deleteMany()` 或 `$transaction`

### 5.6 游标流式读取 (`cursor`)
- `ShortUrlService`: `ShortUrlModel.find().cursor()` 用于大数据导出
- **Prisma 替代**: 分页查询 `findMany({ skip, take })` 或使用 `$queryRaw`

### 5.7 嵌套文档 / Mixed 类型
以下 Model 使用了深度嵌套子文档或 `Schema.Types.Mixed`：
- `CollaborationSession`: participants → cursorPosition/selection/pendingChanges
- `VoiceProject/Version`: content → voiceConfig
- `Workspace`: members[], settings
- `AuditLog`: detail (Mixed)
- `WebhookEvent`: data/raw/to (Mixed)
- `DataCollection`: details/analysis (Mixed)
- **Prisma 替代**: 使用 `Json` 类型或拆分为关联表

### 5.8 `mongoose.connection.readyState` 检查
几乎所有 Service 都通过 `mongoose.connection.readyState === 1` 判断 MongoDB 是否可用，以决定是否降级到文件存储。需要统一替换为 Prisma 连接状态检查机制。

涉及文件：
- `libreChatService.ts`, `rateLimiter.ts`, `emailService.ts`, `outEmailService.ts`
- `tamperService.ts`, `ip.ts`, `turnstileService.ts`, `clarityService.ts`
- `dataCollectionService.ts`, `shortUrlService.ts`, `webhookEventService.ts`

### 5.9 `.lean()` 调用
Mongoose `.lean()` 返回纯 JS 对象（跳过 Mongoose Document 包装），Prisma 默认返回纯对象，无需额外处理。

### 5.10 `pre('save')` 中间件
- `FBIWantedModel`: 保存前更新 `lastUpdated`
- `WebhookEventSchema`: 保存前更新 `updatedAt`
- **Prisma 替代**: 使用 Prisma middleware 或在业务代码中处理

---

## 6. 所有 MongoDB 集合名汇总

| 集合名 | 对应 Model | 来源文件 |
|--------|-----------|----------|
| `user_datas` | UserData | `userService.ts` |
| `accesstokens` | AccessToken | `accessTokenModel.ts` |
| `apikeys` | ApiKey | `apiKeyModel.ts` |
| `archives` | Archive | `archiveModel.ts` |
| `audit_logs` | AuditLog | `auditLogModel.ts` |
| `cdks` | CDK | `cdkModel.ts` |
| `collaboration_sessions` | CollaborationSession | `collaborationSessionModel.ts` |
| `fbiwanteds` | FBIWanted | `fbiWantedModel.ts` |
| `invitations` | Invitation | `invitationModel.ts` |
| `ipbans` | IpBan | `ipBanModel.ts` |
| `policy_consents` | PolicyConsent | `policyConsentModel.ts` |
| `recommendation_history` | RecommendationHistory | `recommendationHistoryModel.ts` |
| `resources` | Resource | `resourceModel.ts` |
| `short_urls` | ShortUrl | `shortUrlModel.ts` |
| `tempfingerprints` | TempFingerprint | `tempFingerprintModel.ts` |
| `user_preferences` | UserPreferences | `userPreferencesModel.ts` |
| `versions` | Version | `versionModel.ts` |
| `voice_projects` | VoiceProject | `voiceProjectModel.ts` |
| `workspaces` | Workspace | `workspaceModel.ts` |
| `librechat_images` | LibreChatImage | `libreChatService.ts` |
| `librechat_latest` | LibreChatLatest | `libreChatService.ts` |
| `librechat_histories` | LibreChatHistory | `libreChatService.ts` |
| `chat_providers` | ChatProvider | `libreChatService.ts` |
| `shorturl_settings` | ShortUrlSetting | `shortUrlService.ts` |
| `rate_limits` | RateLimit | `rateLimiter.ts` |
| `email_quotas` | EmailQuota | `emailService.ts` |
| `outemail_records` | OutEmailRecord | `outEmailService.ts` |
| `outemail_quotas` | OutEmailQuota | `outEmailService.ts` |
| `outemail_settings` | OutEmailSetting | `outEmailService.ts` |
| `blocked_ips` | BlockedIP | `tamperService.ts` |
| `turnstile_settings` | TurnstileSetting | `turnstileService.ts` |
| `hcaptcha_settings` | HCaptchaSetting | `turnstileService.ts` |
| `shc_traces` | SHCTrace | `turnstileService.ts` |
| `clarity_settings` | ClaritySetting | `clarityService.ts` |
| `clarity_history` | ClarityHistory | `clarityService.ts` |
| `data_collections` | DataCollection | `dataCollectionService.ts` |
| `ip_infos` | IPInfo | `ip.ts` |
| `webhook_events` | WebhookEvent | `webhookEventService.ts` |
| `webhook_settings` | WebhookSecret | `webhookEventService.ts` |
| `user_generations` | UserGeneration | `userGenerationService.ts` / `userGenerationStorage/mongo.ts` |
| `anta_query_stats` | AntaQueryStats | `queryStatsService.ts` |
| `anta_query_history` | AntaQueryHistory | `queryStatsService.ts` |
| `command_queue` | CommandQueue | `commandStorage/mongo.ts` |
| `command_history` | ExecutionHistory | `commandStorage/mongo.ts` |
| `lottery_rounds` | LotteryRound | `lotteryStorage/mongo.ts` |
| `lottery_users` | LotteryUser | `lotteryStorage/mongo.ts` |
| `modlist` | ModList | `modlistStorage/mongo.ts` |

---

## 7. 迁移建议优先级

### 高优先级（核心业务）
1. `userService.ts` + `user_datas` — 用户系统核心
2. `shortUrlService.ts` + `short_urls` — 短链核心
3. `mongoService.ts` — 连接层替换
4. `transactionService.ts` — 事务机制替换

### 中优先级（功能模块）
5. `turnstileService.ts` — 验证系统
6. `libreChatService.ts` — 聊天系统
7. `cdkModel.ts` + `resourceModel.ts` — CDK/资源系统
8. `emailService.ts` + `outEmailService.ts` — 邮件系统
9. `ipBanModel.ts` + `ipBanSyncService.ts` — IP 封禁
10. `auditLogModel.ts` — 审计日志

### 低优先级（辅助功能）
11. `dataCollectionService.ts` — 数据收集
12. `clarityService.ts` — 分析配置
13. `ip.ts` — IP 信息缓存
14. `webhookEventService.ts` — Webhook
15. `queryStatsService.ts` — 安踏统计
16. Storage 子目录（command/lottery/modlist/userGeneration）
17. `workspaceModel.ts` / `collaborationSessionModel.ts` / `versionModel.ts` — 协作系统
