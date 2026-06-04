# Synapse 后端 MongoDB 持久化细节

本文把后端使用 MongoDB 持久化的配置、启动链路、数据边界、集合、索引、降级策略和运维检查集中说明。用户口头提到的 `mango` 在本项目中对应代码里的 `mongo` / MongoDB。

## 1. 总体结论

- 当前用户体系是 Mongo-only。`USER_STORAGE_MODE` 只能是 `mongo`，省略时也会归一化为 `mongo`。
- MongoDB 是用户、认证、TTS 任务、TTS 配额、TTS 音频资产、运行时配置、审计和大部分业务数据的主持久层。
- Redis 仍是可选依赖，主要用于 IP 封禁加速、限流或 nonce 类短期状态；未配置 Redis 时，IP 封禁会回落到 MongoDB。
- 本地文件仍用于运行期目录、音频磁盘缓存、日志和少量旧服务降级，但不再是用户数据的权威存储。
- MySQL 依赖仍存在于部分可选业务存储实现中，但用户存储不再支持 MySQL 或 file。

关键代码入口：

- `src/services/mongoService.ts`：唯一 MongoDB 连接管理入口。
- `src/app/startup.ts`：启动期诊断、连接、用户存储初始化。
- `src/utils/userStorageMode.ts`：强制 `USER_STORAGE_MODE=mongo`。
- `src/utils/userStorage.ts`、`src/utils/userRepository.ts`、`src/utils/providers/mongoUserStorageProvider.ts`：用户存储 facade / repository / provider。
- `src/services/userService.ts`：`user_datas` 用户集合的 schema 和读写。
- `src/tts/tts.storage.ts`、`src/tts/tts.quota.ts`、`src/tts/tts.history.ts`、`src/tts/tts.asset.ts`：TTS 任务、配额、历史和音频资产持久化。

## 2. 环境变量

| 变量 | 必需 | 说明 |
| --- | --- | --- |
| `USER_STORAGE_MODE` | 否 | 只能为 `mongo`。其他值会在启动时抛错。 |
| `MONGO_URI` | 是 | 首选 MongoDB 连接串。生产必须配置 `MONGO_URI` 或 `MONGODB_URI`。 |
| `MONGODB_URI` | 是 | `MONGO_URI` 的兼容别名，只有在 `MONGO_URI` 未设置时使用。 |
| `MONGO_DB` | 否 | 当连接串没有 database path 时自动补全，默认 `tts`。 |
| `MONGO_PROXY_URL` | 否 | 可选代理地址，支持 `socks*` / `http*` 代理 agent；官方不建议 MongoDB 走代理。 |
| `USER_BY_ID_CACHE_TTL_MS` | 否 | 用户按 ID 读取的进程内缓存 TTL，默认 `10000`，上限 `60000`。设为 `0` 可关闭。 |
| `USER_BY_ID_CACHE_MAX` | 否 | 用户按 ID 缓存容量，默认 `1000`，范围 `100` 到 `10000`。 |
| `DATA_COLLECTION_TTL_DAYS` | 否 | 行为数据集合可选 TTL，未设置时不自动过期。 |
| `REDIS_URL` | 否 | 配置后 IP 封禁优先使用 Redis 并与 MongoDB 同步；未配置时使用 MongoDB。 |

连接串示例：

```env
USER_STORAGE_MODE=mongo
MONGO_URI=mongodb://user:pass@mongo.example.com:27017/tts?authSource=admin
MONGO_DB=tts
```

Atlas / SRV 示例：

```env
MONGO_URI=mongodb+srv://user:pass@cluster.example.mongodb.net/tts?retryWrites=true&w=majority
```

如果连接串没有 database，例如 `mongodb://user:pass@host:27017?authSource=admin`，`mongoService` 会补成 `/<MONGO_DB>` 后再连接。

## 3. 启动链路

启动顺序在 `src/app/startup.ts` 中完成：

1. `assertMongoUserStorageMode()` 归一化并校验 `USER_STORAGE_MODE`。
2. `runStartupDiagnostics()` 使用原生 `MongoClient` 对 `startupConfig.mongo.uri` 执行 `ping`。
3. `initializeStorage()` 调用 `connectMongo()` 建立 Mongoose 共享连接。
4. `UserStorage.initializeDatabase()` 再走 `userBootstrapService`，确保管理员账户存在。
5. `UserStorage.initializeMongoListener()` 输出 Mongo-only 模式日志，不再自动切换存储。
6. 定时任务服务启动，开始处理 IP 封禁同步等后台任务。

启动失败边界：

- `MONGO_URI` / `MONGODB_URI` 未配置会在配置解析阶段失败。
- MongoDB ping 或 Mongoose 连接失败会阻止服务完成启动。
- OpenAI readiness 失败会进入诊断报告；TTS 运行时仍依赖有效的 OpenAI 配置。

## 4. 连接管理

`src/services/mongoService.ts` 负责所有连接细节：

- 连接源顺序：`MONGO_URI` -> `MONGODB_URI` -> 本地 `mongodb://localhost:27017/<MONGO_DB>`。
- 未指定 database 时补全 `MONGO_DB`，默认 `tts`。
- 连接失败最多重试 3 次，每次间隔 2 秒。
- 连接池参数：`maxPoolSize=20`、`minPoolSize=5`、`maxIdleTimeMS=30000`、`maxConnecting=10`。
- 超时参数：`serverSelectionTimeoutMS=5000`、`connectTimeoutMS=10000`、`socketTimeoutMS=45000`。
- 读写语义：`retryWrites=true`、`retryReads=true`、`w=majority`、`readPreference=primary`。
- `connectMongo()` 成功后会初始化 `RuntimeConfigService`。
- 日志会输出脱敏后的连接串，不记录用户名密码。

所有新 Mongo 模型应复用 `src/services/mongoService.ts` 导出的 `mongoose`，不要自行 `mongoose.connect()`。

## 5. 用户持久化

用户权威集合是 `user_datas`，定义在 `src/services/userService.ts`。

主要字段：

- 身份：`id`、`username`、`email`、`role`。
- 密码：`passwordHash`、`passwordCiphertext`、`passwordIv`、`passwordTag`、`passwordKeyVersion`、`passwordWrappedDek`、`passwordDekId`。
- MFA：`totpSecret`、`totpEnabled`、`backupCodes`。
- Passkey：`passkeyEnabled`、`passkeyCredentials`、`pendingChallenge`、`currentChallenge`、`passkeyVerified`。
- 第三方登录：`authProvider`、`linuxdoId`、`linuxdoUsername`、`linuxdoAvatarUrl`。
- 风控：`requireFingerprint`、`requireFingerprintAt`、`fingerprintRequestDismissedOnce`、`fingerprints`、`lastLoginIp`、`lastLoginAt`。
- 业务权限：`dailyUsage`、`lastUsageDate`、`isTranslationEnabled`、`translationAccessUntil`、`accountStatus`。

约束和行为：

- `id`、`username`、`email` 是唯一字段。
- `linuxdoId` 是 sparse unique。
- 普通读取使用 `PUBLIC_USER_SELECT`，不会返回密码材料。
- 登录认证使用 `AUTH_USER_SELECT`，仅在认证路径读取密码材料。
- 创建和更新密码时统一走 `protectPassword()`。
- 旧的明文或旧 hash 密码在登录时通过 `verifyAndMigrateUserPassword()` 自动迁移。
- `avatarBase64` 会在 provider 层和 service 层主动剔除，不再作为用户数据返回。
- `getUserById()` 有短 TTL 进程内缓存；更新和删除会主动失效缓存。

管理员 bootstrap：

- 启动期会读取所有用户。
- 如果已有管理员或 `ADMIN_USERNAME` 对应用户，会修正角色并清理同名冲突普通用户。
- 如果不存在管理员，会按 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 创建默认管理员。

## 6. 注册、验证和登录相关集合

| 数据 | 集合 / 模型 | 说明 |
| --- | --- | --- |
| 邮箱注册和密码重置令牌 | `verification_tokens` | metadata 使用 AES-GCM 密文保存；过期令牌由 5 分钟清理任务删除。 |
| 临时访问令牌 | `AccessToken` 默认集合 | `expiresAt` TTL 自动清理；按 token / fingerprint / ip 建索引。 |
| 临时指纹 | `TempFingerprint` 默认集合 | `expiresAt` TTL 自动清理；按 fingerprint / verified 建索引。 |
| IP 验证令牌 | `ip_verification_tokens` | `expiresAt` TTL 自动清理。 |
| API Key | `ApiKey` 默认集合 | 只存 `keyHash`，不存明文 key；可选 `expiresAt` TTL。 |
| 用户偏好 | `user_preferences` | `userId` unique。 |
| 注册审计 | `user_registration_audits` | 只记录用户名、邮箱、时间、IP、UA；不保存密码。 |

## 7. TTS 持久化

TTS 当前不是内存队列，核心状态保存在 MongoDB。

| 数据 | 集合 | 说明 |
| --- | --- | --- |
| 任务队列 | `tts_jobs` | 记录 taskId、status、请求参数、用户、IP、指纹、结果、错误、lease。 |
| 配额占用 | `tts_quota_reservations` | 记录 userId、usageDay、reservedAt、consumedAt、releasedAt。 |
| 生成历史 | `tts_generation_history` | 用于历史查询、重复内容判断和 duplicate scope。 |
| 音频资产 | `tts_audio_assets` | 以 Buffer 保存音频，可在磁盘文件缺失时恢复到 `finish/`。 |
| 用户生成统计 | `user_generations` | 用户生成行为统计。 |

任务队列语义：

- 新任务写入 `tts_jobs`，状态为 `queued`。
- worker 通过 `claimNextQueuedJob()` 以 `createdAt` 升序 claim，并写入 `processingOwner` 和 `leaseExpiresAt`。
- 完成任务写 `status=completed`、`result`、`usage`、`nextAction`。
- 失败任务写 `status=failed`、`error`、`usage`、`nextAction`。
- `recoverStaleJobs()` 会把 lease 过期的 `processing` 任务改回 `queued`。
- 当前没有 TTL 或 dead-letter 集合，长期运行需要定期清理旧任务和大音频资产。

配额语义：

- 普通用户默认每日 5 次，管理员不限制。
- `reserve()` 先统计当天未释放记录，再写入 reservation。
- `confirm()` 把 reservation 标记为 consumed。
- `release()` 把未消费 reservation 标记为 released。
- `reserve()` 使用 MongoDB session transaction。生产建议使用副本集或分片集群；单机 standalone MongoDB 可能不支持事务。

音频语义：

- 生成后的音频仍会写入运行目录，供 `/static/audio/` 直接访问。
- 同时尝试写入 `tts_audio_assets`。
- 磁盘文件丢失但 MongoDB 中存在资产时，可从 MongoDB 恢复到磁盘。
- 大量音频会显著增加 MongoDB 存储体积，生产需要容量监控和清理策略。

## 8. 主要业务集合

这些集合按业务模块使用同一个 Mongoose 连接：

| 模块 | 典型集合 |
| --- | --- |
| 资源商店 / CDK | `resources` 默认集合、`cdks` 默认集合、`modlist`、`modlist_settings` |
| 短链接 / IPFS / 图床 | `short_urls`、`shorturl_settings`、`image_data` |
| Artifacts | `artifacts` 默认集合、`artifactversions` 默认集合、`artifactviews` 默认集合 |
| Workspace / Voice / Version | `workspaces`、`voice_projects`、`versions`、`invitations`、`collaboration_sessions` |
| 工单 | `tickets` |
| NexAI | `nexai_users`、`nexai_sync`、`nexai_sync_v2_records`、`nexai_sync_v2_counters`、`DeviceTracking` 默认集合、`SecurityEvent` 默认集合 |
| 邮件 | `email_quotas`、`outemail_records`、`outemail_quotas`、`outemail_settings` |
| Webhook | `webhook_events`、`webhook_settings` |
| 管理后台 | `announcements`、`runtime_config_settings`、`debug_console_configs`、`debug_console_access_logs`、`github_billing_*` |
| 安全 / 风控 | `ipbans` 默认集合、`blocked_ips`、`audit_logs`、`policy_consents`、`turnstile_settings`、`hcaptcha_settings`、`shc_traces`、`moderation_logs` |
| 数据与查询 | `data_collections`、`translation_logs`、`anta_query_stats`、`anta_query_history`、`ip_infos`、`ipqs_monthly_quotas`、`ipqs_lookup_logs`、`life_api_logs` |
| 通用工具 | `command_queue`、`command_history`、`logshare_files`、`lottery_rounds`、`lottery_users`、`librechat_*`、`chat_providers` |

未显式设置 `collection` 的模型会使用 Mongoose 默认复数集合名。新增模型时建议显式声明 `collection`，避免重命名模型导致集合名变化。

## 9. 索引和过期策略

已经有 TTL 的数据：

- `access_tokens.expiresAt`
- `api_keys.expiresAt`，仅对非空过期时间生效
- `ipbans.expiresAt`
- `tempfingerprints.expiresAt`
- `ip_verification_tokens.expiresAt`
- `policy_consents.expiresAt`
- `audit_logs.createdAt`，90 天
- `ip_infos.timestamp`，1 小时
- `data_collections.timestamp`，仅当 `DATA_COLLECTION_TTL_DAYS` 配置后启用

手动清理的数据：

- `verification_tokens` 使用数字时间戳，服务内定时任务每 5 分钟删除过期记录。
- `tts_jobs`、`tts_generation_history`、`tts_audio_assets` 当前没有自动过期策略。
- `github_billing_cache` 等业务缓存由业务服务按自身 TTL 语义维护。

重要查询索引：

- 用户：`id`、`username`、`email` unique；`linuxdoId` sparse unique。
- TTS job：`taskId` unique、`status + createdAt`、`status + leaseExpiresAt`。
- TTS history：`scope + userId + contentHash + createdAt`、`scope + duplicateScopeKey + contentHash + createdAt`。
- TTS quota：`taskId` unique、`userId + usageDay + consumedAt + releasedAt`。
- 审计：`requestId`、`createdAt`、`module + createdAt`、`userId + createdAt`、`action + createdAt`。

## 10. 降级和边界

不能降级的核心能力：

- 用户注册、登录、资料、管理员 bootstrap。
- TTS 任务队列、配额 reservation、TTS 历史。
- 运行时配置初始化。

可降级或部分降级的能力：

- Redis 未配置时，IP 封禁走 MongoDB；配置 Redis 时会做 MongoDB <-> Redis 同步。
- 音频文件以磁盘访问为主，MongoDB 存资产副本；任一侧失败会记录警告。
- 部分旧服务仍保留本地文件 fallback，例如 IP 信息、数据收集、LibreChat、rate limiter、tamper blocked IP。这些不是用户主存储。

新增后端功能时的要求：

- 复用 `mongoService` 导出的 `mongoose`。
- 显式声明集合名和必要索引。
- 对短生命周期数据加 TTL 或清理任务。
- 不在日志、审计、普通集合中保存明文密码、token、API key。
- 新路由仍需配套限流和鉴权，不得绕过 JWT 或 admin 检查。

## 11. 部署检查

最小 `.env`：

```env
NODE_ENV=production
PORT=3000
USER_STORAGE_MODE=mongo
MONGO_URI=mongodb://user:pass@host:27017/tts?authSource=admin
JWT_SECRET=replace-with-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-strong-password
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
```

Docker Compose 会把以下变量传入容器：

```yaml
USER_STORAGE_MODE=mongo
MONGO_URI=${MONGO_URI}
MONGODB_URI=${MONGODB_URI}
MONGO_DB=${MONGO_DB:-tts}
MONGO_PROXY_URL=${MONGO_PROXY_URL}
```

启动后检查：

```bash
curl -s http://localhost:3000/health
```

返回中应看到：

```json
{
  "mongo": "connected",
  "status": "ok"
}
```

MongoDB 侧检查：

```bash
mongosh "$MONGO_URI" --eval "db.runCommand({ ping: 1 })"
mongosh "$MONGO_URI" --eval "db.user_datas.countDocuments()"
mongosh "$MONGO_URI" --eval "db.tts_jobs.getIndexes()"
```

## 12. 迁移和维护

已有脚本：

- `npm run migrate:tts-user-datas -- --dry-run`：检查旧 `user_datas` 形态迁移计划。
- `npm run migrate:tts-user-datas -- --report-file=reports/user-migration.json`：执行并输出报告。
- `npm run migrate:user-passwords`：把旧明文或旧 hash 密码迁移到当前密码保护字段。

维护建议：

- 生产 MongoDB 使用副本集，即使是单节点副本集，也能支撑 session transaction。
- 定期备份 `user_datas`、`verification_tokens`、`api_keys`、`tts_*`、`runtime_config_settings`、`audit_logs`。
- 监控 `tts_audio_assets` 和 `tts_jobs` 体积，避免音频和任务历史无限增长。
- 不要手动删除 `runtime_config_settings`，除非确认可以回退到环境变量默认值。
- 不要直接修改 `user_datas.password*` 字段；需要通过服务逻辑更新密码。
