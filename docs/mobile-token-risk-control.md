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
| `deviceFingerprint` | `deviceId` + `deviceName` 的哈希，标识"这台设备"（P3） |
| `deviceFirstSeenAt` | 该设备首次出现在这个账号上的时间，跨代、跨血缘继承（P3） |
| `verificationPending` | 本代是在设备证明未通过时签发的，还没等到一次通过的证明（P3） |
| `riskSignals` | 本代被轮换掉时命中的风险信号，仅审计用（P3） |
| `reusedAt` | 本代（已顶替）超宽限期后又被使用、触发整链吊销的时间；非空即一次 `MOBILE_TOKEN_REUSED` 事件（P4） |
| `reusedIp` | 触发复用时那次请求的来源 IP，取证用（P4） |

字段上线前的存量令牌没有 `lineageId`：判定时回退用自身 hash 当链根，因此"旧代 + 它之后的后代"仍在同一条链上。
要把它并入真正的链根，跑一次 `pnpm run migrate:mobile-token-lineage`（默认 dry-run，见 §6.6.1）。

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
  "requiresVerification": false,
  "escalated": false
}
```

`requiresVerification` 是 P2 设备证明的降级标记（见 §4）：`true` 时 `rotateIntervalMs` 为 1 小时、
`expiresAt` 为降级后的短有效期，客户端应提示用户重新完成一次设备验证，而不是把它当错误。

`escalated` 是 P3 风险分级的标记（见 §5）：`true` 表示这次轮换命中了风险信号，`nextRotationAt`
被压到提级间隔。它只是一个布尔值 —— 命中了哪几路信号只进服务端日志，不下发。

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
10. 为新令牌建 `client-token` 会话；
11. 风险分级（P3，见 §5）：拿新建会话的属地与上一代比，命中信号就把响应里的下次轮换提前。
    它只改响应节奏，另外把命中的信号记到旧代文档的 `riskSignals` 备查，不影响任何令牌的可用性。

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
| `LINEAGE_MAX_GENERATIONS` | 400 代 / 血缘 | 代次数上限；越线只记一条告警并进后台（P5，见 §6.6.2），不拒绝也不放慢 |
| `SUPERSEDED_IP_RETENTION_DAYS` | 30 天 | 被顶替代次上 `lastUsedIp` / `rotatedIp` 的保留期（P5，见 §6.6.3） |

### 3.7 轮换响应里的两个"提前"标记

`requiresVerification`（§4）与 `escalated`（§5）互不替代，但都只做同一件事：**把下一次轮换提前**。
两者任一为 `true` 时，`nextRotationAt` / `rotateIntervalMs` 都会从 24 小时压到 1 小时；
`requiresVerification` 还会同时缩短单代有效期，`escalated` 不会。

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

## 5. 风险分级轮换（P3）

P2 只处理一件事：设备证明没过就降级。P3 处理的是"这一代看起来不太对劲"，手段只有一种 ——
**把下一次轮换提前**（24 小时 → 1 小时），既不缩短单代有效期，也不拒绝任何请求。

把它和 P2 分开的理由：`MOBILE_TOKEN_INTEGRITY.mode` 放在 `observe` 时，P2 只记日志、不下发降级；
P3 正好是把那些观察结果变成实际动作的地方 —— 判定没过就一小时后再证明一次，而不是干等 24 小时。

### 5.1 三路信号

| 信号 | 含义 | 数据来源 |
|---|---|---|
| `GEO_JUMP` | 这次轮换的 IP 属地与上一代签发时不是同一个地方 | 上一代取自会话台账的 `ipLocation`，这一代取自新建会话的 `ipLocation` |
| `VERIFICATION_PENDING` | 上一代是在设备证明未通过的情况下签发的，还没等到一次通过的证明 | 令牌文档上的 `verificationPending`，跨代继承，判定通过即清除 |
| `NEW_DEVICE` | 这台设备在该账号上还很新（首次出现后的 `newDeviceTrustHours` 内） | 令牌文档上的 `deviceFirstSeenAt`，跨代、跨血缘继承 |

几个刻意的取舍：

- **属地判定宁可漏报**：属地形如 `"中国, 北京, 北京 运营商: 中国联通"`，取逗号切段后的第一段（国家），
  `geoJumpScope = region` 时连第二段（省/州）一起看。任一侧取不到有意义的值（`未知` / 空）就不判 ——
  不能拿"查不到"当"换了个国家"。同一个国家内省份未知也不判。
- **设备标识是 `deviceId` + `deviceName` 的哈希**（`deviceFingerprint`）：只看 `deviceId` 挡不住
  "自报原 deviceId 但换一台机器名重放"。`deviceFirstSeenAt` 跨血缘继承，所以同一台设备登出再登录
  不会被反复当成新设备。
- **不额外发归属地查询**：判定放在建完新会话之后，这一代的属地直接取那条会话已经算好的值。

### 5.2 运行时配置（`MOBILE_TOKEN_ROTATION_RISK`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 总开关；不开时轮换节奏与 P2 完全一致 |
| `elevatedIntervalMinutes` | `60` | 命中任一信号后的轮换间隔；必须小于 1440，否则保存被拒 |
| `geoJumpEnabled` / `geoJumpScope` | `true` / `country` | 是否启用属地判定，以及比对粒度（`country` / `region`） |
| `newDeviceTrustHours` | `24` | 新设备在多长时间内算"新" |
| `carryOverVerificationPending` | `true` | 是否把"待重新验证"这个标记继续压在提级节奏上 |

没有机密字段，因此读要管理员、写要超管，与 §4.3 那一组一致；保存后 ≤10s 在多实例收敛。

### 5.3 边界

- 命中信号**只影响节奏**：不动 `expiresAt`，不动登录状态，不清任何令牌；
- 整体没开（`enabled = false`）时连"上一代属地"那一次查询都不发；
- 命中的信号会写进旧代令牌文档的 `riskSignals` 字段，只作审计与后台聚合，
  响应里只回一个 `escalated: true`。

## 6. 客户端契约（`Synapse-Client`）

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
7. 风险分级（P3）：响应里的 `escalated` **不需要客户端做任何事** —— 它只意味着这次的
   `nextRotationAt` 比平时近，客户端照样只认服务端下发的时间。不要用 `escalated` 去推断风险，
   更不要据此提示用户"账号异常"。

## 6.5 后台可视化（P4，超管只读）

前面几层产生的轨迹需要有人看得懂，否则断链发生了也只会躺在 `warn` 日志里。P4 加一个
超管专用的只读面板（管理后台「登录令牌血缘」），四个端点全挂在 `/api/admin/mobile-token/*` 下，
全部 `GET`、全部 `authenticateSuperAdmin`、沿用 `/api/admin` 的既有限流：

| 端点 | 回答的问题 |
|---|---|
| `GET …/overview` | 现在有多少张令牌、多少条血缘、多少张已顶替/撤销、近期复用断链几起 |
| `GET …/reuse` | 每一次 `MOBILE_TOKEN_REUSED`：哪条链、第几代、什么时候被顶替、什么时候又出现、从哪个 IP 出现 |
| `GET …/lineage?lineageId=…`（或 `?userId=…`） | 一条血缘的完整代际时间线：每代签发/过期/顶替/撤销时间、轮换时的属地与 IP |
| `GET …/generations?userId=…&deviceFingerprint=…` | 某用户名下（可再限一台设备）签到了第几代、共几条血缘 |

### 6.5.1 复用事件的数据来源

`MOBILE_TOKEN_REUSED` 原先只有一行 `warn` 日志，没有可查询的落点。现在断链时会在**触发复用的那一张
（已顶替的旧代）**上补写 `reusedAt` / `reusedIp` 两个字段，看板直接按 `reusedAt` 倒序查
`mobile_client_tokens` —— 不新建集合、不给正常请求路径增加任何写入。存量数据没有这两个字段，
看板自然从上线之后开始积累。

### 6.5.2 边界

- 库里本来就只有 SHA-256 哈希，面板再对**哈希 / `deviceId` / 来源 IP** 做一层掩码
  （哈希留 10 位、设备 ID 留头 4 尾 2、IPv4 留前两段），明文令牌与完整标识一律不出后端；
- 属地只取会话台账里已经算好的 `ipLocation`，**不额外发归属地查询**；
- 只读：面板没有任何撤销/封禁动作，处置仍走「活动设备与客户端」与 IP 封禁那两处；
- 时间线一次最多 500 代并明确标出截断，列表分页上限 200。

## 6.6 存量与清理（P5）

前三阶段只对"从上线之后签发/轮换的令牌"完整生效，P5 收口的是存量数据与长期堆积。

### 6.6.1 存量 `lineageId` 回填

```bash
pnpm run migrate:mobile-token-lineage            # dry-run，只打印将回填的分组
pnpm run migrate:mobile-token-lineage -- --apply # 真正写入
```

脚本（`scripts/migrations/backfill-mobile-token-lineage.js`）沿 `rotatedFrom` 把每一代走到链根，把链根应写的
`lineageId` 一次性 `updateMany` 下去；走到某个祖先本身已有 `lineageId` 就以它为准，**不会把两条链并成一条**。
链根取"最顶端那一代自己的 `tokenHash`"，与运行时回退（`lineageIdOf`）的取值一致，因此回填前后同一条链的
`lineageId` 不会跳变。只匹配 `lineageId` 为空的文档，可重复执行；`rotatedFrom` 指向的上一代已被 90 天 TTL
清掉的，就按"这一代自己是链根"处理——这也是运行时本来的判定。

与其余迁移脚本同一约束：纯 node + `mongodb` 驱动，不 import `src/`（生产镜像只有混淆后的 `dist/`）。

### 6.6.2 代次数上限告警

正常一条血缘一天推进一代，一年也就三百多代。`LINEAGE_MAX_GENERATIONS`（400）之上的链基本只有两种解释：
脚本拿着有效令牌在刷，或是一条没人管的链被反复轮换。

越线时轮换路径记一条 `warn`（userId / deviceId / lineageId / 代次 / IP），后台「登录令牌血缘」概览页顶部
多出一块「代次数越线告警」列表（按链去重，取该链最高的一代，最多 50 条）。

**它只是观测**：不拒绝请求、不放慢节奏、不动任何令牌——节流仍然只由 `ROTATION_DAILY_LIMIT`（8 次 / 24h / 血缘）
与 `ROTATION_MIN_INTERVAL_MS` 负责。这与 P2 的降级、P3 的提级是同一个原则：告警不改变可用性。

### 6.6.3 被顶替代次的来源 IP 保留期

`lastUsedIp` / `rotatedIp` 只在"这一代还在用 / 刚被顶替"的那几天有运维价值。被顶替超过
`SUPERSEDED_IP_RETENTION_DAYS`（默认 30 天，可用环境变量 `MOBILE_TOKEN_IP_RETENTION_DAYS` 覆盖）后，
后台每 6 小时扫一次，把这两个字段 `$unset` 掉（走 `supersededAt` 稀疏索引）。

两个刻意的例外：

- **不清 `reusedIp`**：那是 `MOBILE_TOKEN_REUSED` 事件的取证记录，也是 P4 复用看板的取数依据，
  清它等于把已经发生的断链事故抹掉；
- **不清 `rotatedFingerprint` / `deviceFingerprint`**：那是设备指纹而不是用户出口地址，且 P3 的新设备判定
  要靠它跨代继承。

清理是幂等的，Mongo 未就绪时直接跳过，日志只在真的清掉东西时记一行。

## 7. 后续阶段

| 阶段 | 内容 |
|---|---|
| ~~P2~~ | ~~Play Integrity 设备证明~~ —— **已落地**，见 §4 |
| ~~P3~~ | ~~风险分级轮换：IP 属地突变、设备证明未通过、新设备登录时把节奏压到 1 小时~~ —— **已落地**，见 §5 |
| ~~P4~~ | ~~后台可视化：血缘时间线、`MOBILE_TOKEN_REUSED` 事件看板、按用户/设备查询代次~~ —— **已落地**，见 §6.5 |
| ~~P5~~ | ~~存量令牌回填 `lineageId` 的迁移脚本 + 代次数上限告警 + 被顶替代次的 IP 保留期~~ —— **已落地**，见 §6.6 |

明确不做：客户端本地"到期才允许轮换"的硬校验（设备时间不可信）；旧代宽限期延长（每延长一分钟，断链检测就晚一分钟）。
