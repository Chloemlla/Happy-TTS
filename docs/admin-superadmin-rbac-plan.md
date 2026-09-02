# 双层管理员权限架构(admin / superadmin)

> **状态**: 已实现并合并至 `main`(commit `3bf4a4c4`/`4abc6a13`/`b473774b` 起)。角色分层、守卫、迁移脚本、前端分层、审计补缺全部落地;远程 CI(type-check/build/lint)验证通过。**2026-08-09 逐节核对 `main` 代码,§1–§7 全部落地、无未完成项**(详见下方「落地核对」)。本文为原始设计方案存档 + 落地核对记录。

## Context

当前系统角色为 `user | admin | trusted`,所有管理员授权是扁平的单一检查 `role === "admin"`/`role !== "admin"`,散落在 5 个守卫函数和 ~50 处控制器内联检查里。这导致任何 admin 都能做系统变更(改密钥、关 WAF、改角色、清空数据),不符合最小权限原则。

本次引入两级管理员分层:
- **admin** = 纯只读管理视图,**唯一写权限例外是 OAuth 客户端/授权管理**。
- **superadmin** = admin 全部权限 + 所有其他写操作 + 系统变更(密钥/安全策略/角色变更/危险删除等),是 admin 的超集。
- `trusted` 保持现状(正交的 OAuth 授权特权,不混入分层)。

已确认决策:① 三级角色(不做可配置权限矩阵);② 禁止 superadmin 自降级;③ 所有现有 admin 迁移为 superadmin;④ admin 纯只读(仅 OAuth 管理例外);⑤ OAuth 管理归 admin+superadmin。

JWT 不携带 role(维持现状),`authMiddlewareV2` 每次从 DB 实时查 role,角色变更即时生效。

---

## 落地核对(2026-08-09)

逐节对照 `main` 上当前代码,§1–§7 全部落地。下表为证据(文件:行)与相对设计的差异说明。

### §1 角色模型扩展 — ✓ 全部落地

| 文件 | 行 | 证据 |
|---|---|---|
| `src/utils/userStorageTypes.ts` | 18 | ✓ `role: "user" \| "admin" \| "superadmin" \| "trusted"` |
| `src/services/userService.ts` | 25 | ✓ Mongoose `enum` 含 `"superadmin"` |
| `src/controllers/adminUserListHelpers.ts` | 37 | ✓ `VALID_ROLES` 含 `"superadmin"`(role 写入校验唯一 chokepoint) |
| 同上 | 115 / 184 / 304-306 | ✓ 角色过滤类型、`normalizeEnumQuery` 枚举、stats 分桶均含 `superadmin` |

### §2 中间件分层 — ✓ 全部落地

- `src/middleware/auth.ts`: `ADMIN_ROLES`(11)、`isAdminRole`(14)、`isSuperAdmin(req)`(19)、`authenticateAdmin`(55,读/业务守卫)、`authenticateSuperAdmin`(88,写/系统守卫)、`adminAuthMiddleware`(189,委托 `isAdminRole`)。
- `src/middleware/adminOnly.ts:10` 委托 `isAdminRole`。
- `src/routes/admin/index.ts:36` 本地挂载守卫改 `!isAdminRole`,`userSelfServicePaths` 自助旁路保留(17-34)。
- `src/auth/auth.service.ts`: `requireAdmin`/`isAdmin`(80/89)接受 `{admin,superadmin}`;新增 `requireSuperAdmin`/`isSuperAdmin`(98/107)。
- `src/routes/routeModules/knownMiddleware.ts`: `knownAuthMiddleware`(85)与 `knownAuthHandlerNames`(102)均含 `authenticateSuperAdmin`,治理生成器不报错。

### §3 路由逐条再分类 — ✓ 全部落地

- **`/api/admin/*`**: `users.ts` 写路由全部 `authenticateSuperAdmin`(create/update/delete/bulk/fingerprint/reveal-password/penalty/announcement),读路由 admin;`config.ts` 全部 `POST/PUT/DELETE`(envs、各 setting、tts provider、lumen sync)加 `authenticateSuperAdmin`,读路由 admin;`shortlinks.ts` 写路由用内联 `isSuperAdmin`(123/167/235/332,等效),读用 `isAdminRole`;`broadcast.ts`/`registrationInvites.ts` 写用 `authenticateSuperAdmin`;`profile.ts:83` `verify-access` 改 `isAdminRole`;bilibili-sync 读路由挂载在 admin 守卫下。
- **独立模块**: dataCollectionAdmin(`superAdminGuard` 元组)、webhookEvent、cdk、apiKey、policy(`GET /admin/stats`=adminOnly,`POST /admin/cleanup`=superadmin)、tamper(封禁写=superadmin)、ticket(`GET /admin/all`=adminOnly,状态/消息写=superadmin)、libreChat(admin 读 + 删除/Provider 写=superadmin)、markdownArticle、fbiWanted、resource、humanCheck、email(`/send`/`/batch-send` 等=superadmin,`/quota`/`/domains` 读=adminAuthMiddleware)均完成拆分。
- **OAuth 例外**: `oauthRoutes.ts` 读写均保持 `adminAuthMiddleware`(已委托 `isAdminRole` → admin+superadmin),符合设计;token/authorize 等用户侧端点不变。
- `auditLogRoutes.ts` 全 GET,路由级 `authenticateAdmin`(9);`status.ts` `/profiling` 用 `adminOnly`(49)。

> **超计划覆盖**(同一批次补齐,非 §3 逐条列举): turnstile、ipfs、githubBilling、lottery、ecoEnchants、LogShare、tts provider、command、passkey admin、logRoutes、shortUrlRoutes、health 读路由,均补 superadmin 守卫或 `isSuperAdmin` 内联检查。
> `POST /api/server_status`(`diagnosticsRoutes.ts:11`)用 `SERVER_PASSWORD` 独立鉴权(`diagnosticsController.ts:37`),非角色门,符合 CLAUDE.md 文档行为。

### §3C 辅助角色检查 — ✓ 全部落地

- `oauthService.ts:471-472` `canAuthorizeOAuth` 加 `superadmin`;`:579` 管理标志接受双角色。
- `oauthController.ts:41-43` `getAdminUser` 接受双角色。
- `ipfsController.ts:37` 改 `isAdminRole`。
- `accountMergeService.ts:221-224` 合并阻止列表含 `superadmin`。
- `userRepository.ts:38/179/197` 用量限额豁免/告警跳过含 `superadmin`。
- `assembly.ts:397-411` **Swagger 门潜在 bug 已修**: 不再读 JWT 内 role,改为按 `decoded.userId` 查 DB 取实时 role 后 `isAdminRole` 判定。

### §4 防锁死守卫 — ✓ 全部落地(比设计更强)

- `adminController.ts:275-277` 自降级 → 403「不允许修改自身角色」(覆盖 superadmin→admin/user)。
- `:289-301` 降级/封停最后一个 superadmin → 409「无法降级或封停最后一个超级管理员」。
- `:521-526` 批量封停含最后超管 → 409;`:633-638` 删除最后超管 → 409;`:782/:795` 其余封停/删除路径 → 409。
- 辅助函数 `:149-151`(判定目标是否为最后超管)。
- 会话即时失效: `UserStorage.updateUser` 在 role 变更时 emit,`authMiddlewareV2` 实时读 DB,降级下个请求即失权(设计 §4C,无改动)。

### §5 迁移 + Bootstrap — ✓ 落地(**有实现差异**)

- **差异**: 迁移脚本为 `scripts/migrations/migrate-admin-to-superadmin.js`(**JS**,非计划中的 `.ts`;`e636f12b` 为可在生产容器运行改为纯 Node + mongodb 驱动,直接操作 `user_datas` 集合)。幂等(重复执行 matched=0)、支持 `--dry-run`、打印 `{total, upgraded, matched, skipped}` JSON。`package.json:41` 脚本 `migrate:admin-to-superadmin` → `node scripts/migrations/migrate-admin-to-superadmin.js`。
- `userBootstrapService.ts`: `buildDefaultAdmin` role=`"superadmin"`(14);`reconcileAdmin` 对 username 匹配的既有 admin 重提升为 `superadmin`(48-50),冲突过滤排除 `admin`/`superadmin`(52-58)。

### §6 前端分层 — ✓ 全部落地(UX only,后端守卫为准)

- `frontend/src/utils/rbac.ts`: `isAdminRole`(admin|superadmin)/`isSuperAdmin`;`frontend/src/hooks/useRBAC.ts`: `useIsAdmin`/`useIsSuperAdmin`。
- `frontend/src/hooks/useSidebarView.ts:25-26` 与 `frontend/src/hooks/useAuth.ts:161` 改用 rbac helper,并传 `isSuperAdmin` 给导航上下文。
- `frontend/src/navigation/navConfig.ts`: `NavVisibilityContext` 加 `isSuperAdmin`(45-49);`filterByVisibility` 支持 `requiredRole: 'superadmin'`(56-57);管理导航项逐个标注 `requiredRole`(环境变量/邮件/IP 封禁/广播/CDK/抽奖/FBI/Markdown/短链/命令等=superadmin,审计/翻译审计/用户列表/apikey 读=admin),并导出 superadmin URL 集合(521+)。
- 25+ 管理组件用 `isSuperAdmin` 门控写控件:BroadcastManager、AnnouncementManager、ApiKeyManager、EnvManager、UserManagement、WebhookEventsManager、LotteryAdmin、ShortLinkManager、DataCollectionManager、TicketSystem、TamperDetectionDemo、LibreChatAdminPage 等。

### §7 审计日志 — ✓ 全部落地

- 基础设施: `auditLog.ts:99` 记 `role`,superadmin 操作自动以 `role:"superadmin"` 落库。
- 补缺全部就位: 指纹清理/require、dataCollection `delete-all`/`delete-batch`、webhookEvent 全部写、apiKey create/update/revoke/enable/delete/billing.adjust、libreChat 删除/Provider 写,均挂 `auditLog`。
- role 变更审计: `admin/users.ts:236-243` action 动态 `user.role.change` + `extractDetail:{oldRole,newRole}`(旧角色经 `adminController.ts:272` 的 `__targetOldRole` 注入);最后超管 409 拒绝经审计链记 failure。

### 生成产物 — ✓ 已重生成

- `docs/generated/route-audit.json`、`route-governance.md`、`cross-layer-compliance.md` 均含 `authenticateSuperAdmin`(各 24 处),由 CI `chore(docs)` 提交生成(`2dd9d413`/`e381eb41`),`authPolicy.handlers` 反映读=admin / 写=superadmin 拆分。

---

## 1. 角色模型扩展

在 `role` 枚举和联合类型中加入 `superadmin`:

| 文件 | 行 | 改动 |
|---|---|---|
| `src/utils/userStorageTypes.ts` | 18 | `role: "user" \| "admin" \| "superadmin" \| "trusted"` |
| `src/services/userService.ts` | 25 | `enum: ["user", "admin", "superadmin", "trusted"]` |
| `src/controllers/adminUserListHelpers.ts` | 37 | `VALID_ROLES` Set 加入 `"superadmin"`(这是 role 写入校验的唯一 chokepoint) |
| `src/controllers/adminUserListHelpers.ts` | 115,184,304-306 | 角色过滤类型、查询参数枚举、stats 分桶均加 `superadmin` |

**关键**: `VALID_ROLES` 是 `validateAndSanitizeUserUpdates` 校验 role 写入的唯一入口,加入 `superadmin` 后现有 `PUT /api/admin/users/:id` 即可接受新角色,无需改控制器。

**out of scope**: `src/models/nexaiUserModel.ts` 是独立并行认证系统(`nexai_users` 集合,自带 `nexaiAuthRequired` 守卫,不与 Synapse admin 链相交),不动,记为后续 ticket。`ticketModel.ts`、`workspaceModel.ts`、`ecoEnchantsModel.ts` 的 role 枚举是无关领域枚举,不动。

---

## 2. 中间件分层

在 `src/middleware/auth.ts` 引入共享角色集和两个规范守卫:

```
const ADMIN_ROLES = new Set(["admin", "superadmin"]);
authenticateAdmin       // 读/业务守卫: role ∈ {admin, superadmin}
authenticateSuperAdmin  // 写/系统守卫: role === "superadmin"
```

- **`authenticateAdmin`**(改 `auth.ts:42`): `user.role !== "admin"` → `!ADMIN_ROLES.has(user.role)`。仍保留"若 req.user 缺失则先跑 authMiddlewareV2"的行为。用于所有只读端点 + OAuth 管理。
- **`authenticateSuperAdmin`**(新增,接在 `authenticateAdmin` 后): 同构,检查 `role !== "superadmin"`,403 `权限不足，仅限超级管理员访问`。

**收敛 5 个散落守卫名**(保留导出名,内部委托到上面两个):
- `adminAuthMiddleware`(`auth.ts:143`,oauthRoutes / admin/index 用): 改为 `!ADMIN_ROLES.has(req.user.role)`。
- `adminOnly`(`adminOnly.ts:9`,policy/tamper/ticket 用): 同上委托。
- `src/routes/admin/index.ts:16-40` 本地 `adminAuthMiddleware`(带 `userSelfServicePaths` 旁路): 改角色检查为 `!ADMIN_ROLES.has`,**保留自助旁路逻辑不动**。
- `src/auth/auth.service.ts:80-91` `requireAdmin`/`isAdmin`: 接受 `{admin, superadmin}`,补 `requireSuperAdmin`/`isSuperAdmin`。

**内联检查辅助**(给控制器 ~50 处用),在 `auth.ts` 或新 `src/utils/rbac.ts` 导出:
```
export function isSuperAdmin(req: Request): boolean
export function isAdminRole(role?: string): boolean  // ADMIN_ROLES.has
```

**路由治理注册表** `src/routes/routeModules/knownMiddleware.ts:79-110`: 把 `authenticateSuperAdmin` 加入 `knownAuthMiddleware`(函数引用→名)和 `knownAuthHandlerNames`(集合),保证 `generate:route-audit` 不报错。

---

## 3. 路由逐条再分类

**规则**: GET = admin(读); POST/PUT/PATCH/DELETE = superadmin(写/系统)。**例外**: OAuth 管理 = admin+superadmin;自助 profile 端点 = 任意已认证用户(已由 `userSelfServicePaths` 旁路)。

### 3A. `/api/admin/*` 挂载(`src/routes/admin/index.ts` + 子路由)
挂载级守卫(`index.ts:36`)放行 `{admin, superadmin}`,然后逐路由加 superadmin 守卫:

**`admin/users.ts`**
- 读(admin): `GET /users`, `GET /users/:id`, `GET /translation-logs`, `GET /translation-logs/stats`, 各 status 端点。
- 写(superadmin,加 `authenticateSuperAdmin`): `POST /users`(创建)、`PUT /users/:id`(更新,含 role 变更)、`DELETE /users/:id`(删除)、`POST /users/bulk-action`、`POST /users/:id/translation-penalty`、`POST /users/:id/fingerprint/require`、`DELETE /users/:id/fingerprints`、`DELETE /users/:id/fingerprints/:fpId`、`POST /users/:id/reveal-password`、`POST /users/:id/reveal-password/verify`、`POST /announcement`、`DELETE /announcement`。

**`admin/config.ts`** — 全为系统配置:
- 读(admin): 所有 `GET /*`(envs、各模块 setting、`GET /tts/provider`)。
- 写(superadmin): 所有 `POST/PUT/DELETE /*`(set/delete envs、set/delete settings、`PUT /tts/provider`、`POST /lumen-config/sync-github`)。对应 `adminController.ts` 内联检查(setEnv/deleteEnv @1130/1160、`set*Setting`/`delete*Setting` @1179–1930)改 `isSuperAdmin`。

**`admin/shortlinks.ts`** — 内联检查 @22,122,166,234,331,367:
- 读(admin): `GET /shortlinks`, `GET /shortlinks/migration-stats`。
- 写(superadmin): `POST /shortlinks`(创建)、`DELETE /shortlinks/:id`、`POST /shortlinks/batch-delete`、`POST /shortlinks/migrate`。

**`admin/profile.ts`**: `POST /verify-access`(@83 内联)改 `ADMIN_ROLES.has`;其余自助端点已旁路。

**`admin/broadcast.ts`、`admin/registrationInvites.ts`、`admin/index.ts:93-94`**(bilibili-sync 读): 广播推送 = superadmin;邀请读 = admin、创建/撤销 = superadmin;bilibili-sync 读 = admin。

### 3B. 独立挂载的管理路由模块

**`dataCollectionAdminRoutes.ts`**(混,每路由 `guard` 元组):
- 读(admin,留 `authenticateAdmin`): `GET /stats`、`GET /`、`GET /:id`、`GET /:id/raw`。
- 写(superadmin,换 `authenticateSuperAdmin`): `POST /`(创建)、`DELETE /:id`、`POST /delete-batch`、`DELETE /all`(危险清空)。

**`webhookEventRoutes.ts`**(混,每路由 `authenticateAdmin`):
- 读(admin): `GET /`、`GET /stats`、`GET /groups`、`GET /:id`。
- 写(superadmin): `POST /test`、`POST /bulk-status`、`POST /bulk-delete`、`PATCH /:id/status`、`POST /:id/replay`、`POST /`、`PUT /:id`、`DELETE /:id`。

**`cdkRoutes.ts`**(每路由 `authenticateAdmin`):
- 读(admin): `GET /`、`GET /stats`、`GET /total-count`、`GET /export`。
- 写(superadmin): `POST /`、`PUT /`、`DELETE /all`、`DELETE /unused`、`DELETE /:id`、`POST /ks/import`。

**`oauthRoutes.ts`** — **修正后的例外**(用 `adminAuthMiddleware`,2B 委托后已放行 admin+superadmin):
- 读(admin): `GET /clients`、`GET /clients/:clientId`、`GET /grants`。
- 写(admin+superadmin,保持 `adminAuthMiddleware` 不升级): `POST /clients`、`PUT /clients/:clientId`、`POST /clients/:clientId/rotate-secret`、`DELETE /clients/:clientId`、`POST /grants/:grantId/revoke`。
- `/oauth/authorize*`、`/oauth/token|introspect|revoke|userinfo` 不变(用户/OAuth 客户端认证,非 admin 管理)。

**`apiKeyRoutes.ts`**(内联 @28,39,50,69,78-81,107,140,173,187,193-194,221,238,255):
- 读(admin): `GET /permissions`、`GET /billing/rates`、`GET /mine`、`GET /all`、`GET /:keyId/billing/events`。`role === "admin" ? listAllKeys()` 分支改 `isAdminRole(role) ? listAllKeys()`(superadmin 也看全部)。
- 写(superadmin): `POST /`、`POST /:keyId/billing/adjust`、`PUT /:keyId`、`POST /:keyId/revoke`、`POST /:keyId/enable`、`DELETE /:keyId`。`isAdmin` 标志派生改 `ADMIN_ROLES.has(role)`,403 门 @107/140 改 `isSuperAdmin`。

**`policyRoutes.ts`**(用 `adminOnly`): `GET /admin/stats` = admin;`POST /admin/cleanup` = superadmin。
**`tamperRoutes.ts`**(用 `adminOnly`): 摘要读 = admin;封禁块变更 = superadmin。
**`ticketRoutes.ts`**(@13 本地 `adminOnly`): `GET /admin/all` = admin;`PATCH /admin/:id/status`、`PUT/DELETE /admin/:id/messages/:messageIndex` = superadmin(拆守卫)。
**`libreChatRoutes.ts`**(@600–746 `authenticateAdmin`): `GET /admin/users`、`GET /admin/users/:userId/history`、`GET /admin/providers` = admin;`DELETE /admin/users/:userId`、`DELETE /admin/users`、`DELETE /admin/users/all`(危险)、`POST /admin/providers`、`DELETE /admin/providers/:id` = superadmin。
**`markdownArticleRoutes.ts`**: 公开读 = open;创建/更新/发布/删除 = superadmin。
**`fbiWantedRoutes.ts`**: 公开读 = open;admin 列表 = admin;CRUD = superadmin。
**`resourceRoutes.ts`**: resources 读 = admin;CRUD = superadmin。
**`auditLogRoutes.ts`**(@9 路由级 `authenticateAdmin`,全 `GET`): 全 admin(读),无需改守卫,2A 已让 `authenticateAdmin` 接受 superadmin。
**`status.ts`**: `GET /profiling`(用 `adminOnly`) = admin;若有 `/server_status` 写 = superadmin。
**`humanCheckRoutes.ts`**: stats/trace 读 = admin;trace 管理写 = superadmin。
**`emailRoutes.ts`**: 邮件/广播写 = superadmin;读 = admin。

### 3C. 辅助角色检查(非 403 门,改行为分支)
- `src/services/oauthService.ts:472` `canAuthorizeOAuth`: 加 `|| user.role === "superadmin"`(superadmin 是 admin 超集)。
- `src/controllers/oauthController.ts:43` `getAdminUser`: `user?.role === "admin" || user?.role === "superadmin"`。
- `src/controllers/ipfsController.ts:36,50` `isAdmin`: 改 `ADMIN_ROLES.has(user?.role)`(superadmin 上传不被误标)。
- `src/services/accountMergeService.ts:221`: 合并阻止列表加 `superadmin`。
- `src/utils/userRepository.ts:38,179,197`: 用量限额豁免/告警跳过,`admin` 检查加 `superadmin`。
- `src/app/assembly.ts:402` Swagger 门: **潜在 bug** — 读 `decoded.role`(JWT 不携带 role)。改为从 DB 查用户后 `ADMIN_ROLES.has(role)`,作 admin(读)。低优先级。

---

## 4. 防锁死守卫

### 4A. 禁止自降级(已存在,保留)
`src/controllers/adminController.ts:263` 已有自 role 变更守卫(`req.user?.id === user.id && req.body.role !== user.role` → 403),角色无关,已覆盖 `superadmin→admin/user`。**保留**。另: `PUT /api/admin/users/:id` 路由本身要加 superadmin 守卫(3A),确保只有 superadmin 能改任何人的 role。

### 4B. 禁止降级最后一个 superadmin(新增)
在 `adminController.ts` `updateUser` 处理器、自降级检查之后、`UserStorage.updateUser` 之前(@265 后、@293 前)加:
```
if ("role" in updates && updates.role !== "superadmin" && user.role === "superadmin") {
  const superadminCount = (await UserStorage.getAllUsers()).filter(u => u.role === "superadmin").length;
  if (superadminCount <= 1) return res.status(409).json({ error: "无法降级最后一个超级管理员" });
}
```
**同样保护覆盖删除用户**(`deleteUser`)和**封停/禁用**路径:目标是最后一个 superadmin 时 → 409(删/封最后一个 superadmin 会锁死系统)。
**原子性**: admin role 变更并发极低,控制器级 count 检查可接受,记录竞态窗口。若部署用副本集,可包 `mongoose.connection.transaction` 或用 `countDocuments({role:"superadmin"}) > 1` 的条件 `findOneAndUpdate`。

### 4C. 会话失效(已具备)
`UserStorage.updateUser`(`userStorage.ts:116-121`)在 role 变更时 emit `emitUserAuthorityChanged`,`authMiddlewareV2` 每次从 DB 实时读 role → 降级用户下个请求即失权。无需改动。

---

## 5. 迁移

### 5A. 一次性迁移脚本
新建 `scripts/migrations/migrate-admin-to-superadmin.ts`(仿 `migrate-user-passwords.ts`): `connectMongo()` → 遍历 `getAllUsersAuth()` → `role === "admin"` 的 `updateUser(id, {role:"superadmin"})` → 打印 `{upgraded, skipped}` JSON 摘要。`package.json` 加 `"migrate:admin-to-superadmin": "ts-node --transpile-only scripts/migrations/migrate-admin-to-superadmin.ts"`。

**顺序关键**: 部署时先跑迁移再上代码。若先上代码,现有 admin 在迁移前会变只读。

### 5B. Bootstrap admin 升 superadmin
`src/utils/userBootstrapService.ts`: @14 `role:"admin"`→`"superadmin"`;@40 `=== "admin"`→`=== "superadmin"`;@46-47 reconcile 重提升设 `"superadmin"`;@51 冲突过滤 `!== "admin"`→`!== "superadmin"`。确保新环境 bootstrap 出 superadmin。

---

## 6. 前端(UX only,后端守卫为准)

- **`frontend/src/hooks/useSidebarView.ts:24`** 与 **`useAuth.ts:160`**: `role === 'admin'` → `isAdminRole(role)`(`=== 'admin' || === 'superadmin'`),放 superadmin 进管理导航/重定向。建议 `frontend/src/utils/rbac.ts` 放共享 helper + `useIsSuperAdmin()` hook。
- **`navConfig.ts`**: `NavVisibilityContext`(@45-48)加 `isSuperAdmin: boolean`;`filterByVisibility`(@50-62)加 `requiredRole: 'superadmin'` 二级。系统/写重模块(环境变量、邮件系统、IP 封禁、系统管理、广播、CDK、抽奖、命令、FBI、Markdown 文章、短链、短链迁移、邮件发送)标 `superadmin`;只读/概览(审计日志、翻译审计、TTS 历史、用户列表、apikey 读)标 `admin`。逐个 `NavItem` 在 `getAdminNavGroups()`(@253-470) 标注。
- **各管理组件**(`admin/*`、`ApiKeyManager.tsx`、`BroadcastManager.tsx`、`BilibiliSyncAdmin.tsx`@187): 非超管的 admin 隐藏/禁用写控件。后端 403 是真正执行点。

---

## 7. 审计日志

- **基础设施已就绪**: `src/middleware/auditLog.ts:95` 已记 `role`,superadmin 操作自动以 `role:"superadmin"` 落库。
- **补缺口**(superadmin 写路由缺 `auditLog` 的加上): 指纹清理、`fingerprint/require`、dataCollection `delete-all/delete-batch`、webhookEvent 写(bulk-status/bulk-delete/replay/PUT/DELETE)、apiKey create/revoke/delete/adjust、libreChat 删除/Provider 写。
- **role 变更审计**: `PUT /api/admin/users/:id` 已有 `auditLog({module:"user",action:"user.update"})`;补 `action:"user.role.change"` + `extractDetail:{oldRole,newRole}` 便于过滤。409 拒绝(最后超管降级)经 `auditLog` 链自动记 failure。

---

## 8. 验证

1. **类型**: `npx tsc --noEmit` 通过(注意 `User["role"]` 的 exhaustive switch 补 `superadmin` case)。
2. **路由治理**: `npm run generate:route-audit`、`npm run check:openapi-drift` 通过(2D 注册表已更新)。
3. **构建**: `npm run build:backend`(tsc + obfuscate)。
4. **Jest** `npm run test`: `oauthService.test.ts` 加 `superadmin`→true 用例;新增 `authenticateAdmin`/`authenticateSuperAdmin`/`isSuperAdmin`/最后超管 409/自降级 403/迁移脚本 单测。
5. **手动**(两个种子账号):
   - 迁移: admin 种子 → 跑迁移 → 变 superadmin;user/trusted 不变。
   - Bootstrap: 新 DB + `ADMIN_PASSWORD` → 出 superadmin。
   - admin 读通: `GET /api/admin/users`、`GET /envs`、`GET /data-collection/admin/stats`、`GET /oauth/clients`、`GET /webhook-events`、`GET /cdks` 均 200。
   - admin 写被拦: `POST /envs`、`DELETE /users/:id`、`POST /data-collection/admin/delete-batch`、`POST /webhook-events/bulk-delete`、`DELETE /cdks/all`、`PUT /users/:id`(改角色) 均 403。
   - superadmin 写通: 同上 200。
   - **OAuth 例外**: admin → `POST /oauth/clients`、`DELETE /oauth/clients/:id`、`POST /oauth/grants/:id/revoke` 均 200(非 403);superadmin 同。
   - 自降级拦: superadmin `PUT /users/<self>` `{role:"admin"}` → 403。
   - 最后超管拦: 两个 superadmin 降一个 → 200;剩一个再降 → 409。
   - 即时失权: 降级后该用户下个写请求 → 403。
   - 前端: superadmin 见全部导航;admin 只见读导航,写按钮禁用。
6. **重新生成治理文档**: `docs/generated/route-governance.md`、`route-audit.json`(生成产物,改后重跑)。

---

## 9. 实现顺序

1. 角色枚举扩展(第 1 节,基础)。
2. 中间件整合(2A–2D): `authenticateAdmin` 接受双角色、加 `authenticateSuperAdmin`、委托 `adminAuthMiddleware`/`adminOnly`、更新注册表。
3. 防锁死守卫(第 4 节)。
4. 路由再分类(第 3 节,最大机械改动,逐模块)。
5. 控制器内联检查(2C): 按读/写分类替换。
6. 辅助角色检查(3C)。
7. Bootstrap + 迁移(第 5 节)。
8. 审计补缺(第 7 节)。
9. 前端(第 6 节)。
10. 验证(第 8 节)。

---

## 风险

- **迁移顺序**: 先迁移后上代码,否则现有 admin 在迁移前变只读。
- **`accountMergeService.ts:221`**: 合并阻止列表加 `superadmin`(合并超管更敏感)。
- **`assembly.ts:402` Swagger 门**: 读 JWT 内 role 的潜在 bug,顺手修。
- **生成产物**: 路由守卫改后重跑治理文档生成器,保持 `authPolicy.handlers` 真实。
- **`adminUserListHelpers.ts:115,184,304`**: 用户管理 UI 的角色过滤和 stats 必须含 `superadmin`,否则超管在用户列表不可见。
- **最后超管 count 竞态**: admin role 变更并发极低,可接受;副本集可用事务加强。

## 关键文件

- `src/middleware/auth.ts`(守卫分层核心)
- `src/middleware/adminOnly.ts`(委托)
- `src/controllers/adminController.ts`(60+ 内联检查 + 防锁死)
- `src/controllers/adminUserListHelpers.ts`(role 枚举 chokepoint)
- `src/utils/userStorageTypes.ts`、`src/services/userService.ts`(role 类型/枚举)
- `src/routes/admin/index.ts`(挂载级守卫 + 自助旁路)
- `src/routes/oauthRoutes.ts` + `src/services/oauthService.ts` + `src/controllers/oauthController.ts`(OAuth 管理例外)
- `src/routes/dataCollectionAdminRoutes.ts`、`webhookEventRoutes.ts`、`cdkRoutes.ts`、`apiKeyRoutes.ts`、`libreChatRoutes.ts`(混路由拆分)
- `src/utils/userBootstrapService.ts`(bootstrap superadmin)
- `scripts/migrations/migrate-admin-to-superadmin.ts`(新建)
- `frontend/src/navigation/navConfig.ts`、`hooks/useSidebarView.ts`、`hooks/useAuth.ts`(前端分层)
