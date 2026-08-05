# Backend Security & Middleware Scan Report

## Severity Count

| Severity | Count | Confirmed | Suspected |
| --- | ---: | ---: | ---: |
| Critical | 0 | 0 | 0 |
| High | 3 | 3 | 0 |
| Medium | 7 | 6 | 1 |
| Low | 3 | 2 | 1 |
| Info | 1 | 1 | 0 |

## Findings List

```
F-001 | High | Confirmed | CORS 通配符 *.chloemlla.com 子域名匹配过于宽松 | src/middleware/corsMiddleware.ts:8 | 攻击者可在任何受控子域名上发起跨域请求
F-002 | High | Confirmed | CORS 配置同时设置 Access-Control-Allow-Origin: * 和 Access-Control-Allow-Credentials: true | src/middleware/corsMiddleware.ts:130-134 | 违反 CORS 规范，代理/CDN 行为不确定
F-003 | High | Confirmed | openCorsHeadersMiddleware 无条件设置 Access-Control-Allow-Origin: * | src/middleware/corsMiddleware.ts:130-131 | Turnstile 验证端点完全开放
F-004 | Medium | Confirmed | WAF 白名单字段 deviceSignals 整棵子树跳过 WAF 检测 | src/middleware/wafMiddleware.ts:239-281 | 可通过 deviceSignals 注入 SQL/XSS payload
F-005 | Medium | Suspected | 登录/注册端点绕过 WAF | src/security/securityPolicy.ts:36-37 | 认证端点可接受任意 payload
F-006 | Medium | Confirmed | 登录尝试限制使用进程内 Map，多实例部署中失效 | src/middleware/auth.ts:103 | 水平扩展后攻击者可轮询不同实例绕过登录限流
F-007 | Medium | Confirmed | 多个 JWT 认证中间件共存，认证逻辑分散 | src/middleware/authenticateToken.ts, auth.ts, optionalAuthenticateToken.ts | 4个独立实现，存在认证绕过风险
F-008 | Medium | Confirmed | adminOnly 中间件未校验用户是否已认证 | src/middleware/adminOnly.ts:5 | 直接访问 (req as any).user.role，前序无认证中间件时抛出 500
F-009 | Medium | Confirmed | Swagger API 文档公开展示所有 API 端点 | src/app/assembly.ts:352-387 | 攻击者可枚举所有 API 接口，包括管理端点
F-010 | Medium | Confirmed | JWT 验证未指定算法白名单 | 多处 jwt.verify() 调用 | 虽 jsonwebtoken v9 默认拒绝 none 算法，但未显式约束最佳实践
F-011 | Low | Suspected | translationAccessMiddleware 逻辑可能反转 | src/middleware/translationAccessMiddleware.ts:27 | accessUntil > Date.now() 返回403，逆语义
F-012 | Low | Info | 用户注册数据记录到文件系统和 MongoDB | src/middleware/userDataLogger.ts:96-112 | 用户名、邮箱、IP、UA 被持久化存储
F-013 | Low | Info | 启动诊断中 OpenAI API Key 以 Bearer token 形式传输 | src/config/startupDiagnostics.ts:93 | API Key 在 HTTP 请求 header 中传输
F-014 | Info | Confirmed | Replay protection 在 cookie-only 会话中跳过 | src/middleware/replayProtection.ts:80-81 | 浏览器 cookie 会话不进行防重放签名验证
```

## Score

**Security: 6/10**

| Dimension | Score | Notes |
|-----------|:-----:|-------|
| CORS 配置 | 4/10 | 通配符 + 凭据 + 完全开放端点 |
| 认证中间件 | 6/10 | 多个版本共存，但单点逻辑正确 |
| WAF 检测 | 7/10 | 实现质量高，但白名单过大 |
| 防重放/防篡改 | 9/10 | 实现完善，使用 timingSafeEqual |
| 速率限制 | 7/10 | 37 个限流器，但登录限流非共享 |
| CSP 配置 | 8/10 | Nonce 机制 + 合理策略 |
| 审计日志 | 8/10 | 良好脱敏，但用户数据记录需关注 |
| 配置管理 | 7/10 | 无硬编码密钥，但 JWT 可选回退 |

## High+ Detailed Analysis

### F-001 | High | CORS 通配符 `*.chloemlla.com`

**File**: `src/middleware/corsMiddleware.ts:8`

**Issue**: `allowedOrigins` 包含 `"https://*.chloemlla.com"`，匹配正则 `/^https:\/\/[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.chloemlla\.com$/`，任何子域名均被允许。

**Impact**: 控制 `chloemlla.com` 下任一子域名的攻击者可发起带凭据的跨域请求，导致会话劫持。

**Recommendation**: 替换为已知安全子域名白名单，如 `https://tts.chloemlla.com`。

---

### F-002 | High | CORS `*` + `credentials: true`

**File**: `src/middleware/corsMiddleware.ts:130-134`

**Issue**: `openCorsHeadersMiddleware` 和 `openCorsPreflightHandler` 同时设置 `Access-Control-Allow-Origin: *` 和 `Access-Control-Allow-Credentials: true`，违反 CORS 规范。

**Impact**: 浏览器忽略，但中间代理/CDN 可能错误处理，导致凭据泄露。

**Recommendation**: 使用具体 origin 替换 `*`，或移除 `credentials: true`。

---

### F-003 | High | 开放 CORS 中间件

**File**: `src/middleware/corsMiddleware.ts:130-131`

**Issue**: `openCorsHeadersMiddleware` 不验证请求来源，始终设置 `Access-Control-Allow-Origin: *`。用于 `/api/turnstile/verify-token` 和 `/api/turnstile/public-turnstile`。

**Impact**: 任何第三方网站可读取 Turnstile 验证端点响应。

**Recommendation**: 对 Turnstile 端点使用基于白名单的 `Access-Control-Allow-Origin`。

---

## Medium Detailed Analysis

### F-004 | Medium | WAF 白名单过大

**File**: `src/middleware/wafMiddleware.ts:239-281`

**Issue**: `deviceSignals` 整棵子树（30+ 字段）跳过 WAF 检测。`filePath`、`url`、`curlCommand` 也在白名单中。

**Impact**: 攻击者可通过 `deviceSignals` 子树字段注入 SQL/XSS payload。

**Recommendation**: 使用局部字段跳过而非整棵子树跳过，对 `filePath` 使用专用路径验证。

---

### F-005 | Medium | 登录/注册端点绕过 WAF

**File**: `src/security/securityPolicy.ts:36-37`

**Issue**: `/api/auth/login` 和 `/api/auth/register` 配置为绕过 WAF，注释 "Authentication payload compatibility"。

**Impact**: 未认证端点可接受任意 payload，攻击者可尝试 NoSQL 注入。

**Recommendation**: 仅对 `password` 字段单独跳过，其他字段保留 WAF 检查。

---

### F-006 | Medium | 登录限流非共享

**File**: `src/middleware/auth.ts:103`

**Issue**: `loginAttempts` 使用进程内 `Map` 存储计数。重启后重置，多实例独立计数。

**Impact**: 水平扩展部署中，攻击者可轮询不同实例绕过登录限流（每实例 5 次/15 分钟）。

**Recommendation**: 迁移到 Redis 共享存储。

---

### F-007 | Medium | 多个认证中间件共存

**Files**: `src/middleware/authenticateToken.ts`, `src/middleware/auth.ts`, `src/middleware/optionalAuthenticateToken.ts`, `src/auth/auth.middleware.ts`

**Issue**: 4 个独立 JWT 认证实现：
- `authenticateToken.ts`: Bearer + Cookie，带 session 管理
- `auth.ts`: authMiddleware（仅 Bearer）+ authMiddlewareV2（Bearer + Cookie）+ 登录跟踪
- `optionalAuthenticateToken.ts`: 可选认证，失败不停机
- `src/auth/auth.middleware.ts`: 新架构适配器

**Impact**: 路由注册时可能用错版本导致认证绕过，各版本对 session 检查、用户状态检查、错误处理逻辑不统一。

**Recommendation**: 统一到 `src/auth/` 新架构，废弃其他版本。

---

### F-008 | Medium | adminOnly 未认证检查

**File**: `src/middleware/adminOnly.ts:5`

**Issue**: 直接访问 `(req as any).user.role`，无 `user` 存在性检查。try/catch 捕获后返回 500 而非 401。

**Impact**: 错误配置路由时返回 500，掩盖配置问题。

**Recommendation**: 先检查 `user` 是否存在，不存在则返回 401。

---

### F-009 | Medium | Swagger 文档公开

**File**: `src/app/assembly.ts:352-387`

**Issue**: `/api-docs` 公开可用，包含所有 API 端点路径、参数、响应格式。

**Impact**: 攻击者可枚举所有接口，包括管理端点、OAuth 端点。

**Recommendation**: 生产环境添加认证，或通过 `NODE_ENV` 控制。

---

### F-010 | Medium | JWT 算法未约束

**Files**: 多处 `jwt.verify()` 调用

**Issue**: 所有 `jwt.verify()` 调用均未指定 `algorithms` 选项。`jsonwebtoken ^9.0.3` 使用字符串密钥时默认拒绝 `none` 算法。

**Impact**: 当前版本安全，但升级可能导致算法协商风险。

**Recommendation**: 在所有 `jwt.verify()` 调用中添加 `algorithms: ["HS256"]` 参数。

---

## Strengths Noted

1. **WAF 实现质量高**: 预编译正则、迭代式检查（防栈溢出）、URL 深度解码（最多3层）、白名单、高性能缓存
2. **IP 封禁检查完善**: LRU 缓存、Redis 断路器、CIDR 范围匹配、缓存预热、性能监控
3. **CSP 配置合理**: Nonce 机制、`script-src-attr: 'none'`、`upgradeInsecureRequests`
4. **防重放机制**: HMAC-SHA256 + nonce 去重 + 时间戳校验 + `timingSafeEqual` 防止时序攻击
5. **审计日志脱敏**: 正确脱敏 `password`/`token`/`secret` 等字段，长度截断 2000 字符
6. **GENERATION_CODE 强度策略**: 强制 24 字符最小长度、12 种不同字符，拒绝常见弱口令
7. **无硬编码密钥**: 所有密钥从环境变量读取
8. **速率限制覆盖**: 37 个独立限流器覆盖不同路由类别

## Key Improvement Priorities

1. **P0**: 替换 CORS 通配符 `*.chloemlla.com` 为已知安全域名 (F-001)
2. **P0**: 统一认证中间件到 `src/auth/` 新架构，废弃其他版本 (F-007)
3. **P1**: 迁移登录限流到 Redis 共享存储 (F-006)
4. **P1**: 收紧 WAF 白名单，局部跳过而非整棵子树 (F-004)
5. **P1**: 所有 `jwt.verify()` 添加 `algorithms: ["HS256"]` (F-010)
6. **P2**: adminOnly 添加 `user` 存在性检查 (F-008)
7. **P2**: 生产环境保护 Swagger 文档 (F-009)
8. **P2**: 仅对 `password` 字段跳过 WAF (F-005)