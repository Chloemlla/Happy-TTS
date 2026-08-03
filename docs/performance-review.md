# 项目性能审查报告

> 生成时间: 2026-08-03
> 审查范围: Database、Backend、Frontend、TTS
> 状态: Database ✓ Backend ✓ Frontend ✓ TTS ❌ (API 余额不足)

---

## 🔴 高优先级

### 1. 管理员用户列表 — 全表查询 + 内存分页

**调用链**: `adminController.getUsers` (adminController.ts:131) → `UserStorage.getAdminUserList()` (userService.ts:198-204) → `buildAdminUserListEnvelope` (adminUserListHelpers.ts:340-368)

| 字段 | 内容 |
|------|------|
| **文件** | `src/controllers/adminController.ts:138-143` |
| **函数** | `adminController.getUsers()` |
| **调用链** | `parseAdminUserListQuery` → `UserStorage.getAdminUserList` → `buildAdminUserListEnvelope` |
| **问题** | `GET admin /users` 调用 `UserStorage.getAdminUserList()` 返回整个 `user_datas` 集合（含 fingerprints/passkeyCredentials 等大数组），然后在 JS 内存中过滤/排序/分页（`adminUserListHelpers.ts:340-368`） |
| **影响** | 每次加载用户列表都传输整个集合。几千用户 × 指纹历史 = 数十 MB/请求，CPU 密集型 JS 排序 |
| **建议** | 将 filter/sort/pagination 下推到 Mongoose 查询，使用 `.skip().limit().countDocuments()` 并行，加复合索引 |

### 2. 认证热路径 — 全表扫描 token

**调用链**: `isAdminToken` (authController.ts:1393) → `UserStorage.getAllUsers()` (userService.ts) → JS `users.find(u => u.token === token)`

| 字段 | 内容 |
|------|------|
| **文件** | `src/controllers/authController.ts:1393-1399` |
| **函数** | `isAdminToken(token)` → 行 1395 `UserStorage.getAllUsers()` → 行 1396 `users.find()` |
| **文件2** | `src/controllers/authController.ts:1402-1409` |
| **函数2** | `logoutHandler(req, res)` → 行 1407 `UserStorage.getAllUsers()` → 行 1408 `users.findIndex()` |
| **问题** | `isAdminToken()` 和 `logoutHandler()` 调用 `UserStorage.getAllUsers()` 然后在 JS 中 `users.find(u => u.token === token)`。`user_datas` 的 schema 上**没有 `token` 索引** |
| **影响** | 每次 admin token 验证和退出登录都读取整个 user 集合，O(N) 全表扫描。两个函数各扫一次（logout 扫两次） |
| **建议** | 在 `token` 字段加索引，替换为 `UserModel.findOne({ token }).lean()` |

### 3. 审计日志统计 — 10 次全集合扫描

**调用链**: `AuditLogService.getStats` (auditLogService.ts:414) → 8× `$group` aggregation + 2× `countDocuments`

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/auditLogService.ts:414-460` |
| **函数** | `AuditLogService.getStats(params)` |
| **聚合列表** | 行 437-460: `total`, `byModule`, `byResult`, `topActions`, `topUsers`, `byMethod`, `byStatusCode`, `durationStats`, `recentCount`, `recentDurationStats` |
| **问题** | `getStats()` 执行 2 次 `countDocuments` + 8 个独立的 `$group` 聚合（byModule, byResult, topActions 等）。当无过滤条件时 `matchStage` 为空数组（行 431），所有 10 个查询全表扫描 |
| **影响** | 每个 admin 仪表盘加载触发 ~10 次 audit_logs 全表扫描（该集合有 90 天 TTL，可能数百万行） |
| **建议** | 添加默认时间窗口（如最近 24h/7d）到 `$match` 阶段，使用 `$facet` 合并为一次扫描 |

### 4. 认证 token 验证 — 同步 PBKDF2 + 3 次 DB 操作

**调用链**: `authenticateToken` middleware (authenticateToken.ts:38-52) → `assertActiveAuthSession` (authSessionService.ts:180) → `hashAuthCredential` (authSessionService.ts:83) → `crypto.pbkdf2Sync` + `touchAuthSession` (authSessionService.ts:235) → `hashAuthCredential` + `findOne` + `updateOne` + `UserStorage.getUserById`

| 字段 | 内容 |
|------|------|
| **文件** | `src/middleware/authenticateToken.ts:45-49` |
| **函数** | `authenticateToken` middleware |
| **调用链** | 行 45 `assertActiveAuthSession(userId, token)` → `hashAuthCredential` (pbkdf2Sync) + `findOne` → 行 46 `touchAuthSession(userId, token, ...)` → `hashAuthCredential` (pbkdf2Sync) + `findOne` + `updateOne` → 行 38 `UserStorage.getUserById(userId)` |
| **hashAuthCredential** | `src/services/authSessionService.ts:83-84` — `crypto.pbkdf2Sync(value, config.jwtSecret, 10000, 32, "sha256")` |
| **问题** | 每个认证请求执行 2 次同步 PBKDF2-SHA256（10000 轮）+ 3 次 MongoDB 操作（assertActiveAuthSession + touchAuthSession + getUserById）。`crypto.pbkdf2Sync` 阻塞事件循环 ~10-30ms。`touchAuthSession` 每次写 `lastActivityAt` 无节流 |
| **影响** | 每个 API 调用慢 2-3 倍，MongoDB 写负载翻倍，同步 PBKDF2 饿死其他请求，直接限制吞吐量 |
| **建议** | 缓存 session 查询（LRU, 30-60s TTL）；节流 touchAuthSession（每 N 秒一次）；用异步 `crypto.pbkdf2` 或 HMAC 替代 |

### 5. 限流器 — 每次请求 MongoDB 写入

**调用链**: `createSharedRateLimitStore` (sharedRateLimitStore.ts:420) → `ResilientRateLimitStore.run()` → `MongoRateLimitStore.increment()` (行 182-206) → `findOneAndUpdate` upsert

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/sharedRateLimitStore.ts:420-429` |
| **函数** | `createSharedRateLimitStore(prefix, windowMs, options)` |
| **调用链** | 行 425 检测 `startupConfig.redis.url` → 行 426 无 Redis 时 `redisStore = null` → 行 427 `mongoStore = new MongoRateLimitStore(prefix, windowMs)` → 行 429 `new ResilientRateLimitStore(mongoStore, ...)` → 行 182-206 `MongoRateLimitStore.increment()` 执行 `findOneAndUpdate` upsert |
| **问题** | 限流器默认使用 MongoDB findOneAndUpdate (upsert) 写入每个请求。Redis 可选，未配置时退化到 Mongo。`BoundedMemoryRateLimitStore` 存在但仅作为 fallback |
| **影响** | 每个限流路由的 API 调用都产生一次同步 Mongo 写入，加倍 DB 负载 |
| **建议** | 默认使用 `BoundedMemoryRateLimitStore`（内存限流），仅多实例部署时升级到 Mongo/Redis |

---

## 🟡 中优先级

### 6. IP 封禁检查 — 每次缓存未命中 3 次 DB 查询

| 字段 | 内容 |
|------|------|
| **文件** | `src/middleware/ipBanCheck.ts:779` |
| **函数** | `ipBanCheckMiddleware` / `parallelBanCheck` (行 545-657) |
| **调用链** | 每次请求 → `parallelBanCheck` → 3× `Promise.allSettled([Redis exact, Mongo exact, Mongo CIDR])` → `CLEAN_IP_TTL=120s` / `MAX_CACHED_IPS=10000` |
| **问题** | 缓存未命中时并行执行 3 次 lean() 查询（Redis 精确 + Mongo 精确 + Mongo CIDR）。`CLEAN_IP_TTL` 仅 2 分钟，10k 条目 LRU 在大量 IP 下频繁失效 |
| **建议** | 增加 TTL 到 5-10 分钟，CIDR 查询改为定期刷新任务而非每次请求 |

### 7. 审计日志 — 每次 API 响应写入 MongoDB

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/auditLogService.ts:583-640` |
| **函数** | `AuditLogService.globalAuditMiddleware()` |
| **调用链** | 行 583 `globalAuditMiddleware` → 行 630 拦截 `res.json`/`res.send` → 每次 `/api` 响应执行 `AuditLog.create()` |
| **问题** | 全局中间件在每次 `/api` 响应后写一条 audit 日志。启用 payload 捕获时（`AUDIT_LOG_CAPTURE_PAYLOADS`）还做 `JSON.parse(JSON.stringify(body))` 双序列化（行 631-632） |
| **建议** | 批量写入（每 N ms / M 条刷新），默认关闭 payload 捕获 |

### 8. 限流器指标 — 内存泄漏

| 字段 | 内容 |
|------|------|
| **文件** | `src/middleware/routeLimiters.ts:132-145` |
| **函数** | `RateLimitMetricsRegistry.record()` |
| **类** | `RateLimitMetricsRegistry` — 行 136 `byIp = new Map<string, number>()`，行 137 `byRoute = new Map<string, number>()` |
| **问题** | `RateLimitMetricsRegistry` 的 `byIp`/`byRoute` Map 只增不减（仅 `record()` 写入，无删除），每个 429 响应添加一个永久 key |
| **建议** | 使用 LRU 淘汰或定期重置 |

### 9. 静态文件 — 每次请求同步读盘

| 字段 | 内容 |
|------|------|
| **文件** | `src/app/assembly.ts:419-424` |
| **函数** | `sendIndexHtml(_req, res)`（行 419，catch-all SPA 路由，注册于行 438） |
| **代码** | 行 424 `html = fs.readFileSync(indexPath, "utf8")` |
| **问题** | `sendIndexHtml` 每次请求执行 `fs.readFileSync(indexPath)`，`index.html` 在部署间不变 |
| **建议** | 启动时一次性读入内存缓存，部署信号时重新加载 |

### 10. 审计日志 Regex 搜索 — 无法使用索引

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/auditLogService.ts:418-429`（`getStats`）、`src/services/auditLogService.ts:513-522`（`exportCsv`） |
| **函数** | `AuditLogService.getStats` 行 418-429、`AuditLogService.exportCsv` 行 513-522 |
| **代码** | `filter.$or = [{ requestId: /re/i }, { username: /re/i }, { userId: /re/i }, { action: /re/i }, { targetId: /re/i }, { targetName: /re/i }, { ip: /re/i }, { path: /re/i }]` |
| **问题** | 关键词搜索构建 8 字段 `$or` + 大小写不敏感 `$regex`，无法使用任何索引，强制全表扫描 |
| **建议** | 使用前缀正则（如 `^/username/`）或文本索引，限制 regex 到单字段 |

### 11. Ticket 创建 — 全表扫描获取管理员列表

| 字段 | 内容 |
|------|------|
| **文件** | `src/controllers/ticketController.ts:201-205`（创建 ticket）和 `ticketController.ts:365`（列出 admin） |
| **函数** | ticket 创建匿名函数（行 199-206） |
| **代码** | 行 201 `const allUsers = await UserStorage.getAllUsers()` → 行 202-203 `allUsers.filter(u => u.role === "admin")` |
| **问题** | 每次创建 ticket 调用 `UserStorage.getAllUsers()` 然后 JS 过滤 role === 'admin'。行 365 重复同样操作 |
| **建议** | 替换为 `UserModel.find({ role: 'admin' }).select('email username id').lean()`，加 `role` 索引 |

### 12. 批量用户更新 — N+1 顺序操作

| 字段 | 内容 |
|------|------|
| **文件** | `src/controllers/adminController.ts:463-474` |
| **函数** | `adminController.bulkUpdateUsers()` |
| **代码** | 行 463 `for (const id of userIds)` → 行 469 `const targetUser = await UserStorage.getUserById(id)` → ... → `await UserStorage.updateUser(id, ...)` |
| **问题** | `bulkUpdateUsers()` 对最多 100 个用户逐次 `await` 查询+更新，最多 200 次顺序 DB 操作 |
| **建议** | 使用 `updateMany` 或 `bulkWrite` |

### 13. IP 封禁同步 — N+1 逐条写入

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/ipBanSyncService.ts:227-232` |
| **函数** | `reverseSyncRedisToMongo()` |
| **代码** | 行 232 `const mongoBan = await IpBanModel.findOne({ ipAddress: ip })` → 行 251 `mongoBan.save()` 或行 259 `IpBanModel.create()` |
| **问题** | `reverseSyncRedisToMongo()` 循环中逐条 `findOne` + `save`/`create`，每个 IP 一到两次往返 |
| **建议** | 使用 `bulkWrite` 批量 upsert |

### 14. Google OAuth 登录 — 全表扫描兜底

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/googleAuthService.ts:106-117` |
| **函数** | `findUserByEmail(email)` |
| **代码** | 行 107 `UserStorage.getUserByEmail(email)`（精确匹配）→ 行 113 `UserStorage.getAllUsers()` → 行 114-115 `users.find()` 大小写不敏感匹配 |
| **问题** | 精确 email 匹配失败后，调用 `getAllUsers()` 全表扫描做大小写不敏感匹配。社交登录中大小写不匹配常见 |
| **建议** | 存储时统一小写，或使用 `findOne({ email: new RegExp('^' + escaped + '$', 'i') })` |

### 15. 翻译日志 — 无 TTL 索引 + 无法使用索引的搜索

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/translationLogService.ts:41-42` |
| **函数** | `TranslationLogService.query()` |
| **代码** | 行 41 `{ input_text: { $regex: escapedKeyword, $options: "i" } }`，行 42 `{ output_text: { $regex: escapedKeyword, $options: "i" } }` |
| **问题** | `$regex` 在 `input_text`/`output_text` 上无法使用索引，集合无 TTL 索引无限增长 |
| **建议** | 添加 TTL 索引（如 90 天），限制文本搜索范围 |

### 16. Webhook 事件统计 — 全集合聚合

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/webhookEventService.ts:285-319` |
| **函数** | `WebhookEventService.groups()`（行 285）、`WebhookEventService.stats()`（行 297） |
| **代码** | 行 305-317: 4 个独立 `$group`（byStatus, byProvider, byRouteKey, byType）+ `countDocuments`，WebhookEventModel 无 TTL |
| **问题** | 仪表盘统计使用多个 `$group` 全表扫描，集合无 TTL 无限增长 |
| **建议** | 限制时间窗口，使用 `$facet` 合并，添加 TTL 索引 |

---

## 🔵 低优先级

### 17. Swagger 页面 — 每次请求重建 HTML

| 字段 | 内容 |
|------|------|
| **文件** | `src/app/assembly.ts:370-376` |
| **函数** | `sendSwaggerHtml(_req, res)` |
| **代码** | 行 372 `const html = generateSwaggerHtml(swaggerDocForHtml, swaggerSetupOptions)` — 每次请求重建完整 HTML |
| **建议** | 启动时缓存渲染后的 HTML，仅重新生成 nonce |

### 18. 请求体缓冲 — 每次 JSON 请求复制 Buffer

| 字段 | 内容 |
|------|------|
| **文件** | `src/app/assembly.ts:250-252` |
| **函数** | `express.json()` verify hook |
| **代码** | 行 252 `(req as any).rawBody = Buffer.from(buf)` — 为所有 JSON 请求复制完整 raw body（最大 10MB） |
| **建议** | 仅对 NexAI 路由保留 rawBody，或引用而非复制 |

### 19. WAF 开销 — 每次请求遍历 body

| 字段 | 内容 |
|------|------|
| **文件** | `src/middleware/wafMiddleware.ts:85`（`checkObject`）、`wafMiddleware.ts:134`（`shouldBypassSecurityComponent`） |
| **函数** | `checkObject(obj)` + `shouldBypassSecurityComponent("waf", p)` |
| **调用链** | 行 134 `shouldBypassSecurityComponent` → `getRouteBypassForPath` 线性扫描所有路由模块 → 行 168 `checkObject(req.body)` 递归遍历 body |
| **建议** | 超过 body 大小阈值时短路；路由绕过表预计算为 Map |

### 20. WebSocket — 错误处理未关闭 socket

| 字段 | 内容 |
|------|------|
| **文件** | `src/services/wsService.ts:224-227` |
| **函数** | `WebSocketService` 的 ws.on("error") 处理 |
| **代码** | 行 224 `ws.on("error", ...)` → 行 225 `logger.error` → 行 226 `this.clients.delete(ws)` — 未调用 `ws.terminate()` |
| **对比** | 行 126 `ws.terminate()` 在心跳 sweep 中调用，但错误处理未使用 |
| **问题** | 错误时从 clients Map 删除但未关闭底层 socket，可能残留连接直到 30s 心跳；同时无 `maxPayload` 和消息频率限制 |
| **建议** | 错误处理器中调用 `ws.terminate()`，设置 `maxPayload` 和消息频率限制 |

---

## 🔴 高优先级 — 前端

### 21. 全局 DOM 观察者 — 持续全 DOM 序列化 + 正则扫描

**双重观察者**: `main.tsx` 的 `runDangerousExtensionCheck` + `WsConnector.tsx` 的碰撞检测

| 字段 | 内容 |
|------|------|
| **文件1** | `frontend/src/main.tsx:658` |
| **函数** | `runDangerousExtensionCheck` |
| **代码** | `MutationObserver` 监听整个 document（childList+subtree+attributes）+ `setInterval` 每 20s → 行 395 `document.documentElement.outerHTML.toLowerCase()`、行 417 `document.body.innerHTML`、行 485 `document.documentElement.outerHTML` 全 DOM 序列化 + 数十次正则/querySelectorAll |
| **文件2** | `frontend/src/components/WsConnector.tsx:116` |
| **函数** | `checkIfCoveringPageControl` |
| **代码** | `MutationObserver` over `document.body` + `ResizeObserver` + capture-phase scroll/resize/visualViewport 监听 → `document.elementsFromPoint(x,y)` 5 次采样 + getBoundingClientRect/getComputedStyle |
| **问题** | 两个全局 DOM 观察者同时运行，每个 DOM 变化/滚动都触发全 DOM 序列化或元素命中测试，React 重渲染 + WS 驱动 DOM 变化时持续消耗 CPU |
| **影响** | 整个应用的持续 CPU 开销（TTS 页面、admin 仪表盘），导致页面卡顿和电池消耗，是所有发现中影响最大的运行时问题 |
| **建议** | 正常操作时断开 MutationObserver；仅在有信号预期时附加；`runDangerousExtensionCheck` 改为 `pageshow` + 长间隔（分钟级）而非每次 mutation；WsConnector 碰撞检测节流到单个 rAF 每用户交互 |

### 22. 入口包体积 — 条件渲染组件被静态导入

| 字段 | 内容 |
|------|------|
| **文件** | `frontend/src/App.tsx:7` |
| **问题** | 多个仅条件渲染的组件被 `import`（静态导入）到入口包：`TOTPManager`（17KB，仅弹窗时渲染）、`AnnouncementModal`、`PenaltyAppealHost`、`BroadcastModalProvider`、`ToastContainer` |
| **影响** | 更大初始包体积，增加所有页面的解析/执行时间，降低移动端 time-to-interactive |
| **建议** | 将这些组件改为 `React.lazy()` 动态导入 |

---

## 🟡 中优先级 — 前端

### 23. API 调用模式 — 顺序请求可并行

| 字段 | 内容 |
|------|------|
| **文件** | `frontend/src/components/UserProfile.tsx` |
| **问题** | 多处 `await fetch(A)`; `await fetch(B)` 顺序请求，可并行 |
| **建议** | 使用 `Promise.all` 并行化独立接口调用 |

### 24. 大型列表无虚拟化

| 字段 | 内容 |
|------|------|
| **文件** | `frontend/src/components/` 中多处渲染列表 |
| **问题** | 长列表渲染时无虚拟化（react-window / react-virtual），所有 DOM 节点同时渲染 |
| **建议** | 对超过 50 项的列表使用虚拟化 |

### 25. 重渲染 — TtsPage 播放状态导致全页重渲染

| 字段 | 内容 |
|------|------|
| **文件** | `frontend/src/components/TtsPage.tsx:456` |
| **问题** | 播放状态（isPlaying, activeHistoryId）在 TtsPage 级别管理，每次播放/暂停切换重渲染整个页面（含 TTSForm 34KB + 20 行音频列表） |
| **影响** | 每次播放控制导致可见卡顿 |
| **建议** | 将历史列表提取为 memoized 子组件，行级状态下沉到行组件，`TTSForm` 用 `React.memo` 包裹 |

### 26. 初始加载 — 请求扇出

| 字段 | 内容 |
|------|------|
| **文件** | `frontend/src/` |
| **问题** | 首屏加载时多个独立 API 请求串行或并行发出，无请求合并或缓存 |
| **建议** | 首屏关键请求合并或使用 SWR/React Query 缓存 |

---

## 🔵 低优先级 — 前端

### 27. 大型路由包 — 单文件 admin 页面

| 字段 | 内容 |
|------|------|
| **文件** | `frontend/src/components/EnvManager.tsx`（~108KB）、`CDKStoreManager.tsx`（~87KB）、`LogShare.tsx`（~83KB）、`UserProfile.tsx`（~74KB） |
| **问题** | 大型 admin 页面是单文件 chunk，虽然已 `React.lazy` 加载，但每个页面内所有功能捆绑在一起 |
| **建议** | 将最大 admin 页面按 section 拆分懒加载，jspdf/canvg/html2canvas/mermaid 等重型库按需动态导入 |

### 28. react-icons 桶导入 — 打包全图标集

| 字段 | 内容 |
|------|------|
| **文件** | `frontend/src/components/TOTPManager.tsx:11`、`PenaltyAppealHost.tsx:3`、`BroadcastModal.tsx:3` 等 |
| **问题** | 从 `react-icons/fa`、`react-icons/fi` 桶导入，打包完整 FontAwesome/Material 图标集 |
| **建议** | 使用 tree-shake 安全的直接导入，或对少量图标改用内联 SVG（如 `Notification.tsx` 的做法） |

---

## 总结

| 严重程度 | 数量 | 主要领域 |
|---------|------|---------|
| 🔴 高 | 7 | 全表扫描、认证热路径、同步 PBKDF2、全局 DOM 观察者、入口包体积 |
| 🟡 中 | 15 | N+1 查询、缓存缺失、Regex 搜索、内存泄漏、API 顺序请求、重渲染、列表虚拟化 |
| 🔵 低 | 7 | 缓存缺失、WAF 开销、WebSocket、大型路由包、react-icons 桶导入 |

**最大瓶颈排序**:
1. **全局 DOM 观察者** (main.tsx + WsConnector.tsx) — 双观察者持续全 DOM 序列化 + 命中测试，全应用范围卡顿
2. **认证中间件** (authenticateToken.ts) — 同步 PBKDF2 × 2 + 3 次 DB 操作，每个请求阻塞事件循环
3. **管理员用户列表** (adminController.ts) — 全表查询 + 内存分页，数据量越大越慢
4. **审计日志统计** (auditLogService.ts) — 10 次全集合扫描，每次仪表盘加载都触发
5. **限流器** (sharedRateLimitStore.ts) — 无 Redis 时每次请求 MongoDB 写入
6. **多处全表扫描** — `getAllUsers()` 在 auth/ticket/Google OAuth 中反复调用