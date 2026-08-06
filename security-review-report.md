# Synapse 白盒安全审查报告

**审查日期**: 2026-08-06
**项目版本**: main (ec2e378c)
**审查范围**: 全栈源码白盒审计（Node.js/Express 后端 + React/Vite 前端）
**审查方法**: 人工代码审查 + 自动化扫描

---

## 一、漏洞严重性分级说明

| 级别 | 定义 |
|------|------|
| **CRITICAL** | 可导致完全接管服务器/数据库，或无需认证即可获取最高权限 |
| **HIGH** | 可直接导致越权、敏感数据泄露、服务不可用，或组合利用后可达 CRITICAL 效果 |
| **MEDIUM** | 在特定条件下可导致安全风险，或与其他漏洞组合可升级 |
| **LOW** | 信息泄露、配置不当、最佳实践偏离 |

---

## 二、总览

| 类别 | 数量 |
|------|------|
| 已修复的遗留问题 | 9 |
| 仍存在的遗留问题 | 5 |
| 本轮新发现 — HIGH | 4 |
| 本轮新发现 — MEDIUM | 6 |
| 本轮新发现 — LOW | 6 |
| **总计现存问题** | **21** |

---

## 三、已修复的遗留问题（原报告 F-001~F-014）

以下 9 个问题已在当前版本中修复，不再构成风险：

| 编号 | 问题 | 修复位置 |
|------|------|----------|
| F-001 | CORS 通配符 `*` | `corsMiddleware.ts` — 白名单 hard-code 为 tts.chloemlla.com / chloemlla.com |
| F-003 | `authenticateToken.ts` 缺少 JWT 算法白名单 | `authenticateToken.ts:29` — 已添加 `algorithms: ["HS256"]` |
| F-004 | `adminOnly.ts` 未检查 `user` 存在，访问 `user.role` 抛异常 | `adminOnly.ts:6` — 已添加 `if (!user)` 检查 |
| F-008 | AES 密钥硬编码 | 已确认移除，使用环境变量 |
| F-009 | Helmet 配置缺失 | `assembly.ts:282-295` — 已配置完整 CSP/HSTS/框架保护 |
| F-010 | Swagger 生产环境无认证 | `assembly.ts:379-391` — 已添加 admin JWT 门禁 |
| F-012 | 密码明文存储 | 已使用 bcrypt 12 轮 + 可逆加密迁移 |
| F-013 | 前端 CSP 无 nonce | `contentSecurityPolicy.ts` — 已实现 per-request CSP nonce 注入 |
| 其他 | 多项安全中间件加固 | 防篡改签名、XSS filter、referrer policy 等 |

---

## 四、仍存在的遗留问题（5 项）

### L-F005: WAF 绕过路径（MEDIUM）

**文件**: `src/security/securityPolicy.ts:36-41`

WAF 对以下路径自动跳过检测：
- `POST /api/auth/login`
- `POST /api/auth/register`
- `/api/webhooks`（含通用 webhook）
- `/api/ecoenchants/v1/webhooks`
- `/api/data-collection`

**攻击场景**: 攻击者可通过登录/注册接口提交 SQL 注入/XSS payload，避开 WAF 检测。

**修复建议**: 移除这些路径的 WAF 跳过规则，或确保这些路径在控制器层有充分的输入校验。

---

### L-F006: 进程内登录锁定（LOW）

**文件**: `src/middleware/auth.ts:107-147`

`loginAttempts` 使用进程内 `Map`：
- 服务器重启后锁定清零
- 多实例部署下锁定不同步
- 仅按 identifier 锁定（可被用于 DoS 锁定任意已知用户）

**修复建议**: 使用 Redis 或 MongoDB 存储登录尝试计数。

---

### L-F007: 多重认证中间件共存（LOW）

**文件**: `src/middleware/auth.ts:31,155` vs `src/middleware/authenticateToken.ts`

项目同时存在 3 个认证中间件：
- `authMiddleware` (V1): Bearer only，JWT verify 无算法白名单
- `authMiddlewareV2` (V2): Bearer + Cookie，JWT verify 无算法白名单
- `authenticateToken`: Bearer only，有算法白名单 `["HS256"]`

**风险**: 路由注册时若混淆使用不同版本，可能导致认证绕过或行为不一致。

**修复建议**: 统一使用 `authenticateToken`（带算法白名单版本），废弃 `auth.ts` 中的 V1/V2 实现。

---

### L-F011: 语义问题（INFORMATIONAL）

早期报告中的语义分析问题，当前版本已无明显残留。

---

### L-F014: Cookie 会话跳过防重放（LOW）

**文件**: `src/middleware/authenticateToken.ts`（cookie 分支）

通过 `synapse_token` Cookie 传递的 JWT 不经过 `jwtId`/`nonce` 防重放检查，仅 Bearer 头路径执行完整校验。

**修复建议**: Cookie 认证路径也应执行 `jwtId` 或 `nonce` 防重放验证。

---

## 五、本轮新发现 — HIGH 严重性（4 项）

### H-001: 硬编码 JWT 回退密钥

**文件**: `src/services/runtimeConfigService.ts:33,43-44`
**发现时间**: 2026-08-06

```typescript
const FALLBACK_JWT_SECRET = "yb56beb12b35ab636b66c4f9fc168646785a8e85a";
```

以及默认值：
```typescript
adminPassword: "admin",
serverStatusPassword: "wmy",
```

当环境变量 `JWT_SECRET` 未设置时，`configureDefaults()` 调用前所有 JWT 操作使用此硬编码密钥。`configureDefaults()` 在运行时用 env 覆盖，但启动时序中可能存在窗口期。

**攻击场景**: 攻击者若知道此密钥，可伪造任意 JWT token，假冒任何用户身份（包括 admin）。

**修复建议**:
1. 移除 `FALLBACK_JWT_SECRET`，启动时若 `JWT_SECRET` 未设置则直接抛出异常退出
2. 移除默认密码 `admin`/`wmy`，强制要求环境变量配置

---

### H-002: IP 伪造导致限流完全绕过

**文件**: 组合利用
- `src/middleware/routeLimiters.ts:104,244` — `isLocalRequest = req.isLocalIp`
- `src/app/assembly.ts:91-99` — `isLocalIp` 中间件使用 `req.ip`
- `src/utils/ipUtils.ts:26-68` — `extractRealIP` 信任 X-Forwarded-For 首值
- `src/app/assembly.ts:239` — `trust proxy` 默认 `1`

**攻击链**:
1. Express `trust proxy: 1` 信任第一个代理设置的 `X-Forwarded-For`
2. `isLocalIp` 中间件将 `req.ip` 与 `config.localIps` 比对
3. 若 `req.ip` 被伪造为 localhost IP，则 `req.isLocalIp = true`
4. `createLimiter()` 默认 `skip: isLocalRequest` — 所有 37 个限流器均跳过此请求
5. 同时 `extractRealIP` 也信任 `X-Forwarded-For` 首值，影响登录审计/会话追踪/Turnstile 验证

**攻击场景**: 攻击者发送 `X-Forwarded-For: 127.0.0.1` → 所有限流器跳过 → 可无限制暴力破解、调用 TTS API、滥用任何限流保护接口。

**修复建议**:
1. `isLocalIp` 不应依赖 `req.ip`，应使用 `req.socket.remoteAddress`（TCP 层真实 IP）
2. `extractRealIP` 在有信任代理时也应验证代理链，或降级使用 `req.ip` 而非手动解析头
3. 移除 `X-Forwarded-For` 等客户端可控头的无条件信任

---

### H-003: Passkey Challenge 可被客户端控制导致重放

**文件**: 
- `src/routes/passkeyRoutes.ts:235-260` — discoverable start 将 challenge 明文返回而不存储
- `src/routes/passkeyRoutes.ts:393-400` — 将客户端提交的 `challenge` 写入 `pendingChallenge`
- `src/services/passkeyService.ts:724` — `expectedChallenge: user.pendingChallenge`

**攻击链**:
1. Passkey discoverable 认证流程中，服务端生成 challenge 但不在服务端存储
2. 客户端在 finish 阶段将 challenge 原样提交
3. 服务端将客户端提交的 challenge 写入 `pendingChallenge`
4. 验证时使用 `user.pendingChallenge` 作为 `expectedChallenge`
5. 攻击者若捕获一个有效 assertion（authenticatorData + clientDataJSON + signature），可重放多次

**攻击场景**: 拥有捕获的 passkey assertion 的攻击者可在 challenge 校验被绕过的情况下重放认证。

**修复建议**:
1. 服务端生成 challenge 后必须在服务端 session 或数据库存储
2. finish 阶段不应信任客户端提交的 challenge，应从服务端存储读取
3. 每次认证后立即清除已使用的 challenge

---

### H-004: 通用 Webhook 无签名验证（HIGH — DB Flooding / Stored XSS）

**文件**: 
- `src/controllers/webhookController.ts:9-56`
- `src/routes/webhookRoutes.ts:17-20`
- `src/routes/preParserModules.ts:49-54`（WAF 绕过）

**细节**: `POST /api/webhooks/generic[-:source]` 端点：
- 无签名验证，无认证
- WAF 自动绕过
- 接受任意 JSON payload（1MB limit）
- 直接持久化到 MongoDB（`webhook_events` 集合）
- 仅依赖 120/min 限流器

**攻击场景**: 攻击者可无限注入任意 JSON 数据到 MongoDB，导致：
1. 数据库存储耗尽
2. 若 webhook 数据显示在管理后台且未充分转义，可导致 Stored XSS
3. 作为 DDoS 放大向量

**修复建议**:
1. 移除通用 webhook 端点或要求签名验证
2. 若必须保留，添加来源 IP 白名单 + HMAC 签名验证
3. 移除 WAF 绕过路径
4. 限制每个来源的存储量

---

## 六、本轮新发现 — MEDIUM 严重性（6 项）

### M-001: /api/user/me 泄露敏感认证字段

**文件**: 
- `src/services/userService.ts:85-88` — `PUBLIC_USER_SELECT` 包含敏感字段
- `src/controllers/authController.ts:782-790` — `getCurrentUser` 仅过滤 `password*`

```typescript
const PUBLIC_USER_SELECT =
  "id username email role ... totpSecret totpEnabled backupCodes passkeyEnabled passkeyCredentials pendingChallenge currentChallenge ... token tokenExpiresAt";
```

**影响**: `GET /api/user/me` 返回 TOTP secret、备用恢复码、passkey 凭证、JWT token 等，可被用于：
- 直接登录其他账户（JWT token）
- 绕过 TOTP 验证（totpSecret + backupCodes）
- 注册恶意 passkey（passkeyCredentials）

**修复建议**: 创建独立的 `PUBLIC_USER_SELECT`（不含敏感字段），`getCurrentUser` 使用此版本返回。

---

### M-002: Token 日志泄露

**文件**: 
- `src/middleware/ipCheck.ts:82` — `headers: req.headers`
- `src/middleware/rateLimit.ts:60-67` — `headers: req.headers`

**细节**: 中间件在记录请求信息时，直接将 `req.headers` 传入日志，其中包含 `Authorization: Bearer <token>`。

**攻击场景**: 拥有日志文件读取权限的内部人员或攻击者可获取所有活跃 JWT token。

**修复建议**: 在记录日志前使用 `sanitizeLogValue` 对 `Authorization` 头进行脱敏。

---

### M-003: TOTP 备用码使用非加密安全随机数

**文件**: `src/services/totpService.ts:215`

```typescript
code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
```

**细节**: `Math.random()` 在 V8 中不是加密安全伪随机数生成器（CSPRNG），备用恢复码是可直接登录的高价值凭据。

**攻击场景**: 理论上可预测所有备用恢复码序列，结合其他漏洞可绕过 TOTP 验证。

**修复建议**: 使用 `crypto.randomBytes()` 替代 `Math.random()`。

---

### M-004: EcoEnchants 许可 HMAC 硬编码默认密钥

**文件**: `src/services/ecoEnchantsService.ts:138-146`

```typescript
function getLicensePepper(): string {
  return (
    process.env.ECOENCHANTS_LICENSE_PEPPER ||
    process.env.LICENSE_KEY_PEPPER ||
    process.env.JWT_SECRET ||
    config.jwtSecret ||
    "ecoenchants-development-pepper"  // <-- 硬编码回退
  );
}
```

**细节**: 若所有环境变量均缺失，HMAC 密钥为公开字符串 `"ecoenchants-development-pepper"`。此值用于 `hashLicenseKey`/`hashInstallationId` 的 HMAC-SHA256。

**攻击场景**: 可伪造任意许可密钥和安装 ID 绑定，绕过许可验证。

**修复建议**: 移除该硬编码回退值，启动时若 `ECOENCHANTS_LICENSE_PEPPER` 未设置则报错。

---

### M-005: Short URL 开放重定向

**文件**: 
- `src/controllers/shortUrlController.ts:36` — `res.redirect(shortUrl.target)`
- `src/routes/shortUrlRoutes.ts:176-242` — 匿名创建短链

**细节**: `target` 仅通过 `new URL()` 验证 URL 合法性，但 `new URL("javascript:alert(1)")` 和 `new URL("file:///etc/passwd")` 均合法。

**攻击场景**: 创建短链指向钓鱼网站、恶意 JavaScript 或文件协议，用于钓鱼攻击。

**修复建议**: 添加域名白名单校验，拒绝 `javascript:`/`data:`/`file:` 等协议。

---

### M-006: 账户锁定导致 DoS

**文件**: `src/controllers/authController.ts:50,599-673`

**细节**: 登录尝试计数器仅按 `identifier`（用户名/邮箱）键控，5 次失败锁定 15 分钟。同进程内 Map（与 L-F006 相同问题）。

**攻击场景**: 攻击者可对任意已知用户名连续发送错误密码，导致该用户 15 分钟无法登录。

**修复建议**: 按 IP 而非用户名做锁定键控，或 IP+用户名组合键控。

---

## 七、本轮新发现 — LOW 严重性（6 项）

### L-001: 第三方 API 间接 SSRF

**文件**: 
- `src/services/networkService.ts:58-142` — ping/speedTest/portScan 将用户 URL 转发至 `https://v2.xxapi.cn`
- `src/services/mediaService.ts:62-99` — pipixia 视频解析
- `src/services/lifeService.ts:453`

**细节**: 用户可控的 `url`/`address`/`ip` 参数原样传递给第三方 API，第三方 API 代表服务器请求目标。虽然 SSRF 目标不在本机网络，但可作为第三方利用的跳板。

**修复建议**: 对用户输入做 URL 格式校验 + 禁止内网 IP 段。

---

### L-002: FLAC 转换开放重定向链

**文件**: `src/controllers/networkController.ts:594-596`

```typescript
if (returnValue === "302" && result.data && typeof result.data === "string") {
  return res.redirect(result.data);
}
```

**细节**: `flacToMp3?return=302` 会将第三方 API 返回的 URL 直接作为 `res.redirect` 目标，攻击者可通过控制第三方 API 返回值或中间人攻击实现开放重定向。

**修复建议**: 对 `result.data` 做 URL 白名单校验。

---

### L-003: config.ts 默认值与文档不一致

**文件**: `src/config/config.ts:193-196`

```typescript
jwtSecret = parsedEnv.JWT_SECRET || generateEphemeralSecret();
```

**细节**: CLAUDE.md 声明"production 缺少 `JWT_SECRET` 会崩溃"，但实际代码会生成一个临时密钥。这意味着：
- 重启后所有 JWT token 失效（所有用户需要重新登录）
- 部署时若漏配此变量，不会立即报错，导致静默降级

**修复建议**: 与文档一致，`JWT_SECRET` 缺失时直接抛出异常。

---

### L-004: 测试模式 Passkey 测试数据绕过

**文件**: `src/services/passkeyService.ts:84-91`

```typescript
const isSyntheticTestAuthenticationResponse = (
  authenticatorData: string,
  clientDataJSON: string,
  signature: string,
): boolean => {
  return authenticatorData === "test-data" && clientDataJSON === "test-data" && signature === "test-signature";
};
```

当 `NODE_ENV === "test"` 时，返回 `verified: true`。生产环境受 `NODE_ENV` 门控保护，但部署配置错误可能导致此绕过生效。

**修复建议**: 除 `NODE_ENV` 检查外，添加更严格的运行环境断言。

---

### L-005: auth.ts V1/V2 JWT verify 缺少算法白名单

**文件**: 
- `src/middleware/auth.ts:44` — `jwt.verify(token, config.jwtSecret)`
- `src/middleware/auth.ts:168` — `jwt.verify(token, config.jwtSecret)`

**细节**: 与已修复的 `authenticateToken.ts` 不同，`auth.ts` 的两个版本均未指定 `algorithms` 参数。理论上可被 JWT 算法混淆攻击（如将 HS256 token 当作 RS256 验证）。

**修复建议**: 添加 `{ algorithms: ["HS256"] }` 参数。

---

### L-006: ipfsController 独立 IP 解析绕过 ipUtils

**文件**: `src/controllers/ipfsController.ts:390-399`

```typescript
private static getClientIp(req: Request): string {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    (req.headers["x-real-ip"] as string) ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    "unknown";
  return ip.replace(/^::ffff:/, "");
}
```

**细节**: 此方法优先使用 `X-Forwarded-For` 首值，且用于 Turnstile 跳过决策（`isLocalIp && isDev && isAdmin`）。与项目其他部分使用的 `ipUtils.extractRealIP` 行为不一致。

**修复建议**: 统一使用 `ipUtils.extractRealIP` 或 `req.ip`。

---

## 八、修复优先级建议

### 立即修复（CRITICAL/HIGH 且利用成本低）

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P0 | H-002: IP 伪造限流绕过 | 所有限流保护失效 |
| P0 | H-001: 硬编码 JWT 回退密钥 | 完全身份伪造 |
| P1 | H-003: Passkey challenge 重放 | 认证绕过 |
| P1 | H-004: 通用 Webhook 无签名 | DB 注入 / Stored XSS |
| P1 | M-001: /api/user/me 泄露 | 敏感凭证泄露 |

### 近期修复（MEDIUM）

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P2 | M-002: Token 日志泄露 | 凭据泄露 |
| P2 | M-005: Short URL 开放重定向 | 钓鱼攻击 |
| P2 | M-003: TOTP 备用码 Math.random() | 恢复码可预测 |
| P2 | M-004: EcoEnchants 硬编码默认 pepper | 许可伪造 |
| P2 | M-006: 账户锁定 DoS | 登录拒绝服务 |
| P2 | L-F005: WAF 绕过路径 | 攻击载荷绕过 WAF |

### 低优先级（LOW / 需配合其他漏洞）

| 优先级 | 问题 |
|--------|------|
| P3 | L-003: config.ts 默认值与文档不一致 |
| P3 | L-005: auth.ts 缺少算法白名单 |
| P3 | L-004: 测试模式 passkey 绕过 |
| P3 | L-006: ipfsController 独立 IP 解析 |
| P3 | L-001/L-002: 第三方 SSRF / 开放重定向 |
| P3 | L-F006/L-F007/L-F014: 遗留问题 |

---

## 九、架构性建议

1. **统一 IP 提取层**: 整个项目应使用单一 IP 提取函数（`ipUtils.extractRealIP` 或 `req.ip`），避免各模块自行解析头部。当前 `ipfsController`、`networkService`、`routeLimiters` 等模块各自实现 IP 提取，行为不一致。

2. **统一认证中间件**: 废弃 `src/middleware/auth.ts` 的全部内容，统一使用 `authenticateToken.ts`（已修复算法白名单版本）。当前三套认证中间件共存增加维护复杂度和安全风险。

3. **限流器 skip 策略审计**: 所有限流器的 `skip` 函数应仅用于合法的健康检查和内部监控，不应基于可伪造的客户端 IP 属性。

4. **敏感字段边界定义**: 创建明确的敏感字段白名单/黑名单，审计所有 `select()` 和 `$project` 操作，确保 `PUBLIC_USER_SELECT` 不包含任何认证敏感字段。

5. **密钥管理**: 所有硬编码密钥回退值应在生产构建中禁用。启动时应对所有关键密钥进行存在性检查，缺失即崩溃。

---

*报告结束*