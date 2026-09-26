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
  "rotationIndex": 7, "rotateIntervalMs": 86400000, "graceMs": 300000
}
```

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
7. 铸新一代（同 `userId` / `deviceId` / `deviceName`，`expiresAt = now + 90d`）；
8. 旧代打 `supersededAt / supersededTo / rotatedIp`，**不写 `revokedAt`**；
9. 为新令牌建 `client-token` 会话。

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

## 4. 客户端契约（`Synapse-Client`）

1. 持久化 `nextRotationAt` / `rotatedAt` / `rotationIndex`，**到期才自动轮换**；不自己推算节奏。
2. 触发点：① App 启动后凭据就绪时后台跑一次；② 静默登录成功后做一次非阻塞到期检查；③ 用户在「本地会话」手动点「立即轮换」。
3. 单飞：同一进程内轮换互斥；旧令牌在宽限期内仍可用于在途请求。
4. 失败语义：
   - `429` → 按 `retryAfterSeconds` 把 `nextRotationAt` 往后推，**静默**，不打扰用户；
   - 网络 / 5xx → 原令牌仍然有效，保持现状，下一轮再试；
   - `401` 任意一种（含 `MOBILE_TOKEN_REUSED`）→ 清除该账号的 `sml_` 与 JWT，提示重新登录。**不做自动重登**，避免把攻击面变成循环。
5. 令牌明文：界面只渲染 `sml_xxxx...yyyy` 预览；复制到剪贴板必须先过锁屏 / PIN 验证；不写日志、不进 URL、不进崩溃上报。

## 5. 后续阶段

| 阶段 | 内容 |
|---|---|
| P2 | Play Integrity / 设备密钥绑定，把 `deviceId` 从"客户端自报"升级成"可验证"（需新增依赖与服务端校验链路） |
| P3 | 风险分级轮换：IP 属地突变、`requiresVerification` 命中、新设备登录时把节奏压到 1 小时 |
| P4 | 后台可视化：血缘时间线、`MOBILE_TOKEN_REUSED` 事件看板、按用户/设备查询代次 |
| P5 | 存量令牌回填 `lineageId` 的迁移脚本 + 代次数上限告警 |

明确不做：客户端本地"到期才允许轮换"的硬校验（设备时间不可信）；旧代宽限期延长（每延长一分钟，断链检测就晚一分钟）。
