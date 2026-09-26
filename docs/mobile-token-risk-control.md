# 移动端登录态风控策略（客户端 × Synapse）

> 适用范围：`sml_` 客户端登录令牌（安卓 `Synapse-Client` / PiliPlus 等第三方客户端）与服务端对应接口。
> 本文是**双端共同契约**：一切时间参数、阈值、错误码以服务端为准，客户端只跟随，不自行推算。

## 1. 现有安全底座（服务端，已上线）

| 层 | 实现 |
|---|---|
| WAF / 安全管线 | `src/security/securityPipeline.ts`、`src/middleware/wafMiddleware.ts` |
| 首访 IP 闸门 | `src/middleware/ipVerification.ts` + `IpVerificationService`：除显式 bypass 外，全部 `/api` 必须携带 `X-Fingerprint` + `X-IP-Verification-Token`；令牌 TTL 由服务端下发 |
| IP 信誉 | IPQS / proxycheck（机房、代理、欺诈分），带配额与缓存 |
| IP 封禁 | `ipBanCheck`：违规累计 → 封禁（LRU + Redis + Mongo） |
| 人机验证 | `turnstileAuth`：敏感动作要求 token + fingerprint + IP 三元绑定 |
| 限流 | `routeLimiters` 按 IP 分档（login / auth / verification / sensitive …） |
| 重放防护 | `replayProtection`：`x-timestamp` + `x-nonce` + HMAC |
| 会话台账 | `authSessionModel`：每个凭据一条会话，记录 `deviceId/deviceName/clientType/ipAddress/ipLocation/lastActivityAt/revokedAt`，`clientTokenHash` 关联签发它的 `sml_` 令牌 |
| 设备风险画像 | `deviceTrackingModel`：root / 调试器 / 模拟器 / VPN / 签名校验 / 风险分 |
| 令牌台账 | `mobileClientTokenModel`：只存 SHA-256 哈希、TTL 索引、`deviceId` 绑定、`lastUsedAt/lastUsedIp`、`revokedAt` |

## 2. 为什么仍需要轮换

`sml_` 令牌此前一次签发有效 90 天，且 `POST /mobile-login/client-token/exchange` **不要求 JWT**：
谁拿到这串字符，谁就等价拥有该账号的静默登录能力。风险面：

- T1 令牌外泄（root 后的存储、日志、剪贴板、备份、抓包）→ 攻击者与用户完全等价，服务端**无从区分**；
- T2 `deviceId` 由客户端自报，可连同令牌一起复制；
- T3 唯一的止损是用户主动撤销或管理员撤销会话，发现窗口 = 剩余有效期（可达 90 天）。

## 3. 核心机制：令牌血缘 + 代际复用即吊销

把"一把 90 天的钥匙"改成"**一条链，默认每天推进一代**"。

### 3.1 数据结构（`mobile_client_tokens` 新增字段）

| 字段 | 含义 |
|---|---|
| `lineageId` | 血缘 ID。签发时 = 首代 tokenHash，轮换时继承 ⇒ 一次登录的全生命周期可串联 |
| `rotationIndex` | 第几代，签发为 0，每轮换 +1 |
| `rotatedFrom` | 上一代 tokenHash |
| `supersededAt` | 本代被下一代顶替的时间戳；非空即"已不是当前钥匙" |
| `supersededTo` | 接棒令牌 hash |
| `rotatedIp` / `rotatedFingerprint` | 轮换发生时的来源 IP / 指纹，取证用 |

字段上线前的存量令牌没有 `lineageId`：判定时回退用自身 hash 当链根，因此"旧代 + 它之后的后代"仍在同一条链上。

### 3.2 新端点

```
POST /api/auth/mobile-login/client-token/rotate
Body: { clientLoginToken: string, deviceId: string, reason?: "scheduled" | "manual" }
```

不要求 JWT —— 持有当前有效令牌本身就是凭证；IP 闸门、WAF、限流照常生效，并额外叠一层
按 IP 的专用限流（`authClientTokenRotateLimiter`，1 小时 24 次）。

响应 `200`：

```json
{
  "success": true, "rotated": true,
  "clientLoginToken": "sml_…",
  "expiresAt": "…", "rotatedAt": "…", "nextRotationAt": "…",
  "rotationIndex": 7, "rotateIntervalMs": 86400000, "graceMs": 300000,
  "requiresVerification": false
}
```

`requiresVerification` 是 P2 设备证明的降级标记（见 §4）：`true` 时 `rotateIntervalMs` 为 1 小时、
`expiresAt` 为降级后的短有效期，客户端应提示用户重新完成一次设备验证，而不是把它当错误。

错误一律带 `errorCode`（控制器不再用"文案里有没有某个词"猜状态码）：

| HTTP | errorCode | 触发条件 |
|---|---|---|
| 400 | `MISSING_CLIENT_TOKEN` | 请求体没带令牌 |
| 401 | `MOBILE_TOKEN_INVALID` / `MOBILE_TOKEN_EXPIRED` / `MOBILE_TOKEN_REVOKED` | 令牌不存在 / 过期 / 已撤销 |
| 401 | `MOBILE_SESSION_REVOKED` | 令牌对应会话已被撤销 |
| 401 | `MOBILE_TOKEN_REUSED` | **旧代超宽限期后被再次使用**（见 3.4） |
| 403 | `MOBILE_TOKEN_DEVICE_MISMATCH` | `deviceId` 与令牌绑定不一致 |
| 429 | `MOBILE_TOKEN_ROTATION_THROTTLED` | 同一代未活满最小间隔，附 `retryAfterSeconds` |
| 429 | `MOBILE_TOKEN_ROTATION_QUOTA` | 该血缘 24 小时内轮换次数超限 |

### 3.3 轮换判定顺序（任一步失败即返回，不做部分写入）

1. 令牌存在、未撤销、未过期；
2. `deviceId` 绑定一致；
3. 代际复用检测（3.4）；
4. 对应 `client-token` 会话仍活跃；
5. 本代已活满 `ROTATION_MIN_INTERVAL_MS`；
6. 该血缘 24 小时内轮换次数 < `ROTATION_DAILY_LIMIT`；
7. 设备证明判定（P2，仅在启用时；见 §4），只决定"是否降级"，不拒绝；
8. 铸新一代（同 `userId` / `deviceId` / `deviceName`，`expiresAt = now + 90d`，降级时为 `now + downgradedTtlHours`）；
9. 旧代打 `supersededAt / supersededTo / rotatedIp`，**不写 `revokedAt`**；
10. 为新令牌建 `client-token` 会话。

设备证明放在第 7 步而不是最前面：被前 6 步拒绝的请求不该先花掉一次 Google 调用与一个 nonce。

### 3.4 复用即断链（真正的止损点）

`supersededAt` 非空的令牌被再次用于 `rotate` 或 `exchange`：

- 在 `ROTATION_SUPERSEDED_GRACE_MS`（5 分钟）内 ⇒ 放行，只为兜住轮换瞬间仍在途的请求；
- 超过宽限期 ⇒ **不给任何情面**：按 `lineageId` 整链吊销（含当前在用的新一代）+ 撤销这些令牌名下的全部会话，
  记 `warn` 级日志（userId / deviceId / lineageId / 代次 / IP）。

真机为什么不会误伤：轮换成功后客户端本地整体覆盖，旧值不再被携带；旧值再次出现只有"被复制"这一种解释。

### 3.5 为什么登录状态不会掉

已签发的 JWT 会话通过 `clientTokenHash` 关联到某代令牌，**轮换只标记旧代、不撤销它的会话**，
新令牌另建自己的会话；旧代只有在整链吊销时才连会话一起清。于是：

- 用户视角：登录状态连续，`expiresAt` 被刷新，无需重新输密码或 2FA；
- 「活动设备与客户端」列表按 `deviceKey`（含 `deviceId`）分组，同设备不会出现重复条目；
- 管理员 / 用户撤销该设备时，整条血缘的令牌与会话一次性失效。

### 3.6 参数

| 常量 | 默认 | 作用 |
|---|---|---|
| `CLIENT_TOKEN_TTL_MS` | 90 天 | 单代上限不变，实际寿命由轮换推进 |
| `ROTATION_INTERVAL_MS` | 24 小时 | 节奏，写进 `nextRotationAt` 下发 |
| `ROTATION_MIN_INTERVAL_MS` | 5 分钟 | 同一代最短寿命，防连点与刷链 |
| `ROTATION_DAILY_LIMIT` | 8 次 / 24h / 血缘 | 配额，正常使用量是 1 次/天 |
| `ROTATION_SUPERSEDED_GRACE_MS` | 5 分钟 | 旧代在途宽限，超期即断链 |
| `ROTATION_ELEVATED_INTERVAL_MS` | 1 小时 | 设备证明降级后的节奏，替代上面那条 24 小时 |

## 4. 设备证明（Play Integrity，P2）

`deviceId` 的本质是客户端自报的一个随机 UUID（`SynapseDeviceId.kt`），可以连同 `sml_` 一起被复制。
P2 加一层**由 Google Play 签发**的证明，用来确认"这次请求来自未被改包、由 Play 分发的正版 App 与一台通过
完整性校验的设备"，从而把脚本化重放与改包客户端挡在常规登录态之外。

### 4.1 能力边界（先说清楚，不要在文档或界面上夸大）

Play Integrity **不提供设备唯一标识**，它证明的是"应用与设备环境的可信度"，不是"这台机器就是当初那台"。
因此它挡得住改包客户端与脚本重放，挡不住"在另一台干净设备上装正版 App 并输入被复制的令牌"——
后者仍然靠 §3.4 的代际复用断链来兜。

### 4.2 流程

```
客户端                               服务端
  │  POST …/mobile-login/integrity-challenge   │
  │  { clientLoginToken | Authorization: Bearer } │
  │ ─────────────────────────────────────────► │  按 userId/deviceId 记一个一次性 nonce
  │ ◄───────────── { required, nonce, expiresAt, minDeviceIntegrity } │
  │                                            │
  │  Play Integrity SDK（经典请求 setNonce = nonce）│
  │ ◄──────────────── integrityToken ──────────│
  │                                            │
  │  POST …/client-token/rotate                │
  │  { clientLoginToken, deviceId, integrityNonce, integrityToken } │
  │ ─────────────────────────────────────────► │  nonce 反查归属 → 向 Google 解码 → 比对策略
```

- **nonce 一次性**：无论校验成功与否都立即消费；哈希后存在进程内表里（与扫码挑战同级的进程内状态）。
- **归属绑定**：nonce 记的是"哪个 userId、哪台 deviceId"，别的用户/设备拿到的 nonce 一律 `NONCE_UNKNOWN`。
- **回显比对**：解码结果里的 `requestDetails.nonce`（经典请求）或 `requestDetails.requestHash`
  （标准请求）必须等于签发的 nonce，因此"证明是我要的"与"证明没过期/没被重放"在同一步完成。
  安卓端用的是经典请求，服务端两种都认。
- 本层未启用时挑战端点回 `required: false`，客户端不必白跑一次 Google。

### 4.3 运行时配置（`MOBILE_TOKEN_INTEGRITY`）

环境变量只提供种子默认值（`PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER` / `PLAY_INTEGRITY_PACKAGE_NAME` /
`PLAY_INTEGRITY_SERVICE_ACCOUNT_EMAIL` / `PLAY_INTEGRITY_SERVICE_ACCOUNT_PRIVATE_KEY`），
`mode` **故意不从环境变量播种**：某台机器设了服务账号不该让全网客户端都进降级路径。

| 字段 | 默认 | 说明 |
|---|---|---|
| `mode` | `off` | `off` 不校验；`observe` 校验并记日志但不下发降级；`enforce` 校验并决定降级 |
| `packageName` / `cloudProjectNumber` | — | 被证明的包名与 Google Cloud 项目号 |
| `serviceAccountEmail` / `serviceAccountPrivateKey` | — | 服务账号；私钥只以掩码回显，鉴权走 JWT bearer 换 access token |
| `minDeviceIntegrity` | `MEETS_DEVICE_INTEGRITY` | 最低设备完整性档位 |
| `requirePlayRecognizedApp` | `true` | 要求 `appRecognitionVerdict = PLAY_RECOGNIZED` |
| `requireLicensedAccount` | `false` | 是否额外要求 `appLicensingVerdict = LICENSED` |
| `nonceTtlSeconds` / `maxTokenAgeSeconds` | 300 / 600 | nonce 有效期与证明时间戳的新鲜度窗口 |
| `timeoutMs` | 5000 | 调用 Google 的超时 |
| `failOpen` | `true` | 校验链路自身故障（网络/配置缺失）时是否放行 |
| `downgradedTtlHours` | 24 | 降级后的单代有效期，取代 90 天 |

升到 `observe` / `enforce` 前必须把包名、项目号、服务账号邮箱与私钥配齐，否则保存被拒——
缺配置时本层只会恒判"无法判定"，升档等于骗自己。

### 4.4 判定失败不拒绝，只降级

`enforce` 下判定为不可信（或 `failOpen=false` 且无法判定）时：

- 新一代 `expiresAt` 从 90 天降到 `downgradedTtlHours`（默认 24 小时）；
- `rotateIntervalMs` 与 `nextRotationAt` 从 24 小时压到 1 小时（提早重新证明）；
- 响应带 `requiresVerification: true`，客户端提示用户重新完成设备验证；
- **照常铸票、照常保留登录状态**，旧代仍只打 `supersededAt`。

理由：把判定失败做成硬拒绝，等于让"Google 抖动 / 用户换了台刷了机但没 root 的设备"变成强制登出；
降级路径既缩小了窗口，又不会把风控故障传染成可用性故障。

失败原因以机器码记日志（`NONCE_MISMATCH` / `TOKEN_STALE` / `APP_NOT_PLAY_RECOGNIZED` / `PACKAGE_MISMATCH` /
`DEVICE_INTEGRITY_TOO_LOW` / `ACCOUNT_NOT_LICENSED` / `DECODE_FAILED` / `NONCE_UNKNOWN` / `TOKEN_MISSING`），
供后台聚合，不直接展示给用户。

## 5. 客户端契约（`Synapse-Client`）

1. 持久化 `nextRotationAt` / `rotatedAt` / `rotationIndex`，**到期才自动轮换**；不自己推算节奏。
2. 触发点：① App 启动后凭据就绪时后台跑一次；② 静默登录成功后做一次非阻塞到期检查；③ 用户在「本地会话」手动点「立即轮换」。
3. 单飞：同一进程内轮换互斥；旧令牌在宽限期内仍可用于在途请求。
4. 失败语义：
   - `429` → 按 `retryAfterSeconds` 把 `nextRotationAt` 往后推，**静默**，不打扰用户；
   - 网络 / 5xx → 原令牌仍然有效，保持现状，下一轮再试；
   - `401` 任意一种（含 `MOBILE_TOKEN_REUSED`）→ 清除该账号的 `sml_` 与 JWT，提示重新登录。**不做自动重登**，避免把攻击面变成循环。
5. 令牌明文：界面只渲染 `sml_xxxx...yyyy` 预览；复制到剪贴板必须先过锁屏 / PIN 验证；不写日志、不进 URL、不进崩溃上报。
6. 设备证明（P2）：轮换/首次签发前先取一次挑战；`required: false` 时直接跳过，不要报错也不要重试。
   Play Integrity 拿不到证明（设备不支持、无 Play 服务、用户离线）时**照常提交轮换**，由服务端决定降级——
   客户端不做本地否决。响应里 `requiresVerification: true` 时只提示，不阻塞。

## 6. 后续阶段

| 阶段 | 内容 |
|---|---|
| ~~P2~~ | ~~Play Integrity 设备证明~~ —— **已落地**，见 §4 |
| P3 | 风险分级轮换：IP 属地突变、`requiresVerification` 命中、新设备登录时把节奏压到 1 小时 |
| P4 | 后台可视化：血缘时间线、`MOBILE_TOKEN_REUSED` 事件看板、按用户/设备查询代次 |
| P5 | 存量令牌回填 `lineageId` 的迁移脚本 + 代次数上限告警 |

明确不做：客户端本地"到期才允许轮换"的硬校验（设备时间不可信）；旧代宽限期延长（每延长一分钟，断链检测就晚一分钟）。
