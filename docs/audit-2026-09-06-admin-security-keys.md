# 缺陷汇总：admin/env 安全密钥恒显“未设置” + 三密钥保存后不立即生效（2026-09-06）

取证来源：生产 tts-node 容器（raksmart）`/app/data/env.admin.json` + 容器内 node 进程 `process.env` 实测（2026-09-06）。

## H2 admin/env 面板 8 个安全密钥恒显“未设置”

- 位置：`src/controllers/adminController.ts`（`ENV_READ_WHITELIST` + `getEnvs`）
- 类型：读回显白名单缺 key → 面板无法反映已配置状态
- 详细错误信息：
  - 症状：安全密钥隔离与数据采集加密面板（SecuritySecretSection）全部字段显示“未设置”，即使对应环境变量已配置
  - 根因取证：
    - 生产 `data/env.admin.json`（数组格式）已含 `DATA_COLLECTION_RAW_SECRET`、`BILIBILI_COOKIE_ENCRYPTION_KEY`（各 len=32，管理员此前保存过）
    - `config/env.ts` `applyAdminEnvOverlay` 重放正常：容器内 `node -e 'require("./dist/config/env.js"); ...'` 验证两 key 在应用进程 `process.env` 恢复 SAT(len=32)，消费方（dataCollectionService/bilibiliSyncService）正常工作
    - 但 `getEnvs`（adminController.ts:1056）只迭代 `ENV_READ_WHITELIST`（:36-62），该列表不含 8 个密钥 → `process.env` 有值也永不返回 → 前端 `SecuritySecretSection.fetchValues` 按 SECRET_FIELDS key 在 `data.envs` 匹配不到 → `current[key]` 恒空 → `maskSecret("")` = “未设置”
  - 其余 6 个 key（PASSWORD_ENCRYPTION_KEY 等）生产确实未配置，面板显示“未设置”属真实状态；白名单修复后能如实区分“已设置/未设置”
- 修复：`ENV_READ_WHITELIST` 追加 8 个密钥（`DATA_COLLECTION_RAW_SECRET`、`BILIBILI_COOKIE_ENCRYPTION_KEY`、`PASSWORD_ENCRYPTION_KEY`、`POLICY_SECRET_SALT`、`VERIFICATION_TOKEN_SECRET`、`TTS_ASSET_ACCESS_SECRET`、`LEGACY_API_CHOICE_SECRET`、`LUMEN_ADMIN_AUTOMATION_TOKEN`）
  - `getEnvs` 对返回值仍走 `maskSecretForDisplay` 脱敏（`ab***wxyz`），前端 `maskSecret` 重复掩码结果不变，不泄露明文；不加入 `PROTECTED_ENV_KEYS`，保留面板设置/删除能力（用户诉求即通过面板配置这些密钥）
  - 写路径（setEnv）本就正常：写 `data/env.admin.json`（数组）+ `process.env[key]=value`，重启由 `applyAdminEnvOverlay` 重放，与白名单改动独立
- 复现条件：admin 面板打开“安全密钥隔离与数据采集加密”，任一已配置的上述 key
- 影响面：`getEnvs` 白名单回显范围（只增不减，值脱敏）；老面板 `EnvManager.tsx` 遍历 `data.envs` 渲染，会随白名单多显示 8 行掩码值，属统一可见的期望行为
- 测试影响：`src/tests` 无 `getEnvs`/`ENV_READ_WHITELIST` 钉住用例，未破坏

## H3 三个密钥消费方“构造捕获”导致保存后不立即生效

- 位置：
  - `src/services/dataCollectionService.ts:111`（`rawSecret` 类字段，单例 `getInstance()` 启动时构造）
  - `src/services/policyConsentService.ts:23`（`const SECRET_SALT = resolveSecretSalt()` 模块加载时定格）
  - `src/tts/tts.assetAccess.ts:91`（`secret` 类字段，模块级单例 `new TtsAssetAccessService()`）
- 类型：密钥读取时机缺陷——面板保存写 `process.env`，但这 3 处只在启动/构造时捕获一次，运行期改值不生效（违背“保存后写入运行时配置并立即生效”）
- 修复：改为运行时读取——
  - `rawSecret` → getter（每次访问读 `process.env.DATA_COLLECTION_RAW_SECRET`）
  - `SECRET_SALT` → 删除模块顶层常量，`generatePolicyChecksum` 内直接 `resolveSecretSalt()`（JWT_SECRET 派生回退不变，生产 JWT_SECRET 必配故不会新增 throw 路径）
  - `secret` → getter（每次访问读 `process.env.TTS_ASSET_ACCESS_SECRET || config.jwtSecret`）
- 说明（有意不改）：`VERIFICATION_TOKEN_SECRET`（`verificationTokenModel.ts:85-98`）是 **lazy-cache**（`metadataKey` 首次访问时派生并缓存，注释明确为 honor env.admin.json 启动重放）——缓存保证进程生命周期内签名一致，轮换不破坏已签发令牌；运行期 setEnv 后，未派生场景取新值，已派生场景需重启轮换，此为有意的安全语义。其余 key（`BILIBILI_COOKIE_ENCRYPTION_KEY`、`PASSWORD_ENCRYPTION_KEY`、`LEGACY_API_CHOICE_SECRET`、`LUMEN_ADMIN_AUTOMATION_TOKEN`）消费方本就函数内读 `process.env`，已立即生效。
- 复现条件：启动后经 admin/env 面板保存对应密钥，随即调用该密钥保护的功能
- 测试影响：`dataCollection.test.ts` 不涉及 `rawSecret`；`configurationNoticeIssues.test.ts` 引用 `POLICY_SECRET_SALT` 仅为告警 key 名，不触碰 `policyConsentService` 内部；无 `tts.assetAccess` 单测
