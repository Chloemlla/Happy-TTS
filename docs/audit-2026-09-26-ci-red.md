# Synapse 后端单测红灯清单（2026-09-26，Node Verification run 36215411595）

> 依据 `F:\Repositories\GitHub\verified-methodology.md` 原则 8 落盘。每条含编号、文件+行号、类型、
> 详细错误信息（症状/根因/复现条件）、改法。修复按编号追溯，收尾逐条核对去向。
> 硬约束：禁止本地构建/测试/装依赖，CI 是唯一裁判；提交一律签名。

## 归因基线（先定性，再动手）

- `gh api .../workflows/183667724/runs`：**最后一个绿的 Node Verification 是 `61aa11a3`**，自 `cfbb90b2` 起连红 21 笔。
- 但这 21 笔红**不是** `cfbb90b2..719bc804`（media-tool / lumen）引入的回归：`9cb3ee77` 摘掉了
  `backend-tests` / `frontend-tests` 的 `continue-on-error`。在那之前 ts-jest × typescript@7 不兼容
  让 118 个后端套件静默停了六周（方法论 §五-62），Jest 步骤**从来没有真的当过门禁**。
- 结论：下面 13 个套件 / 22 条用例是六周攒下的**存量欠账**——生产代码演进了、测试没跟上；
  `tsc.yml:97-100` 的 step summary 对此有同样描述。
- 其中只有 **T-09（cdict 签名 GET）是真生产缺陷**，其余按条判定改测试还是改生产；
  不许为了变绿把断言调松。

---

## T-01 — ipVerificationTokenReuse 整套件加载期阵亡

- **类型**：加载期错误（测试替身不完整）
- **位置**：`src/tests/ipVerificationTokenReuse.test.ts:29-36`
- **症状**：`● Test suite failed to run — TypeError: mongoService_1.mongoose.Schema is not a constructor`，
  栈停在 `src/models/ipBanModel.ts:5` ← `src/services/turnstile/ipBan.ts:1`。
- **根因**：`cfbb90b2` 给 `ipVerificationService` 加了 `import { manualBanIp } from "./turnstile/ipBan"`，
  而 `ipBan.ts` 静态导入 `models/ipBanModel`，后者在 **import 期**执行 `new mongoose.Schema(...)`。
  本套件的 mongoService 替身只给了 `{ connection: { readyState: 1 } }`，没有 `Schema`。
- **改法**：在接缝处替掉 `../services/turnstile/ipBan`（本套件不测封禁语义）。
  没采用「给 mongoService 补真 Schema」那条：那只能救过 ipBanModel 这一步，
  `ipBan.ts` 还会继续拖 `middleware/ipBanCheck`，而那里会拖进整棵路由树 ——
  正是 `9cb3ee77` 在 `mockAppSecurityBoundaries` 里避开 `requireActual` 的原因。

## T-02 — IPQS 高分未触发挑战

- **类型**：测试替身陈旧（生产行为已被 G5-23 改掉）
- **位置**：`src/tests/ipVerificationService.test.ts:138`（断言）/ `:9-27`（config 替身）/ `:127`（env 赋值）
- **症状**：`requires verification when IPQS reports a high fraud score` → `Expected: true, Received: false`。
- **根因**：`G5-23` 之后 `getApiKeys()` 只读 `config.ipqs.apiKeys`、**不再合并 env**
  （`ipVerificationService.ts:201-206`）。测试仍靠 `process.env.IPQS_API_KEY` 供密钥 ⇒
  `selectApiKey` 返回 `no_keys` ⇒ failOpen 分支把 `requiresVerification` 压成 false，`axios.get` 也从未被调用。
- **改法**：密钥改放 config 替身（`ipqs.apiKeys: ["test-ipqs-key"]`），删掉已失效的 env 赋值。

## T-03 — /ws 三条 pong 超时

- **类型**：缺测试替身（真实现打未连接的 Mongo）
- **位置**：`src/tests/wsUpgradeRouting.test.ts:142 / :161 / :188`
- **症状**：`Timed out waiting for /ws pong`（3s）三条：cookie 认证、query-token 兜底、authority 变更断连。
- **根因**：`wsAuthentication.resolveWebSocketIdentity` 自 G2-05 起调用 `assertActiveAuthSession`，
  真实现走 `AuthSessionModel.findOne(...)`；本套件没起 Mongo ⇒ 驱动缓冲 10s 后才抛错，远超 3s 超时。
- **改法**：本套件加 `jest.mock("../services/authSessionService", ...)`（仓库既有约定，11 个套件已这么做）：
  `assertActiveAuthSession` 放行、`touchAuthSession` 空实现，纯函数继续用 `requireActual`。

## T-04 — app 级套件普遍缺会话替身（401 簇）

- **类型**：缺测试替身
- **位置**：`src/tests/helpers/mockAppSecurityBoundaries.ts`
- **症状**：`totp-authentication-fix` 两条 `expected 200, got 401`。
- **根因**：`authenticateToken`（`src/middleware/authenticateToken.ts:46-56`）与 `authMiddlewareV2`
  现在无条件执行 `assertActiveAuthSession + touchAuthSession`，查不到会话即 401。
  凡 `import app from "../app"` 的套件都没有 Mongo。
- **改法**：在共享替身里加 authSessionService 直通（一处覆盖 7 个套件），保留 `hashAuthCredential` 等纯函数。

## T-05 — 登录 500：createAuthSession 打真库

- **类型**：缺测试替身
- **位置**：`src/tests/totp-login.test.ts:35`；抛出链 `src/controllers/auth/loginHandlers.ts:258`
  → `issueTrackedLoginToken` → `createAuthSession` → `AuthSessionModel.create`
- **症状**：`完整流程` → `Expected: 200 Received: 500`，响应体 `{"error":"登录失败"}`，用例耗时 **11019 ms**。
- **根因**：未连接 Mongo ⇒ 驱动缓冲 10s 抛错 ⇒ 控制器 catch 成 500。11s 耗时就是该超时的指纹。
- **改法**：由 T-04 的共享替身覆盖（直通 create/assert/touch）。

## T-06 — logRoutes 缺 Bearer 与 superadmin

- **类型**：测试陈旧（路由鉴权自 `a72b49b0` 收紧）
- **位置**：`src/tests/logRoutes.test.ts:43 / :56 / :65 / :82`；判据 `src/routes/logRoutes.ts:57,251`
- **症状**：四条全部 401（`未授权`），另有两条期望 403 / 404。
- **根因**：`POST /api/sharelog` 与 `POST /api/sharelog/:id` 现在挂
  `authenticateToken + authenticateSuperAdmin`；测试只发 `adminPassword` 表单字段、不带任何令牌，
  且替身里唯一的 admin 用户角色是 `admin`，过不了 superadmin 判据。
- **改法**：套件内取/建成 superadmin 用户并签 JWT，四个请求统一带 `Authorization: Bearer`。
  口令二次确认（403）与 404 分支的断言原样保留。
- **附带修一处替身缺口**：`checkAdminPassword` 在口令不等于 `adminOperationPassword` 时会落到
  `UserStorage.getPrimaryAdminAuthUser()`（`logShare/store.ts:104`），而
  `src/tests/helpers/mockUserService.ts` 没有这个导出——`userRepository.ts:118` 直接调它，
  一旦走到就是 `is not a function` → 500，把该当 403 的用例抓成错。已补上同义实现。

## T-07 — backupCodes：局部替身缺方法 + 断言陈旧

- **类型**：缺测试替身 + 契约变更未跟
- **位置**：`src/tests/backupCodes.test.ts:33-37`（UserStorage 替身）/ `:59 / :79 / :91`（断言）
- **症状**：三条全部 500。
- **根因 A**：`G2-22` 后 `getBackupCodes` 读 `UserStorage.getUserSecretsById`（`totpController.ts:671`），
  本套件的局部 UserStorage 替身只给 `getUserById` ⇒ `getUserSecretsById is not a function` ⇒ catch ⇒ 500。
- **根因 B**：同一次审计把响应改成**不回显明文恢复码**（`totpController.ts:691-695`：
  `backupCodes: []` + 文案「仅在生成时显示一次」），测试仍断言五条明文与旧文案。
- **改法**：替身补 `getUserSecretsById`；第一条按现行契约断言（`backupCodes: []`、`remainingCount: 5`、新文案），
  另两条（400/404 分支）断言不动。

## T-08 — passkey 校验用假凭据过真密码学

- **类型**：测试夹具无效
- **位置**：`src/tests/passkey-token-validation.test.ts:127`；抛出点 `src/services/passkeyService.ts:746-747`
- **症状**：`验证认证响应失败`（`throw new Error("验证认证响应失败")`）。
- **根因**：夹具把 `authenticatorData/clientDataJSON/signature` 写成 `"test-data"` 字面量，
  而 `verifyAuthenticationResponse`（`@simplewebauthn/server` v14）做真实 CBOR 解码 + 签名验证，必然抛错。
  该用例**从写下起就没可能通过**——六周静默期正好盖住了它。
- **改法**：本套件替掉 `@simplewebauthn/server` 的 `verifyAuthenticationResponse`
  （返回 `{ verified: true, authenticationInfo: { newCounter: 2 } }`），
  让用例继续测它真正声称的东西：用户匹配 + token 里的 userId/username。

## T-09 — cdict 签名 GET 在 enforce 下必然验签失败（**生产缺陷**）

- **类型**：生产缺陷（测试是对的）
- **位置**：`src/middleware/nexaiRequestSignature.ts:73-85`（`getRawBodyString`）
- **症状**：`accepts the previous secret during rotation` → `req.cdictClient` 为 `undefined`；
  `rejects replay of a valid signed request` → 第一次就 `nextCalled: false`。两条都是 GET。
- **根因**：body-parser 的 `json()` 在检查 `hasBody` **之前**就执行 `req.body = req.body || {}`，
  所以 GET 的 `req.body` 是 `{}` 而不是 `undefined`；而 `rawBody` 只在 `/api/cdict|nexai|lumen` 且**有请求体**时
  才被 `verify` 捕获（`src/app/assembly.ts:288-290`）。于是 `getRawBodyString` 落到
  `JSON.stringify({}) === "{}"`，而客户端按空串签名 ⇒ canonical 不一致 ⇒ HMAC 必然不匹配。
  线上 enforce 模式下**所有签名 GET 都会被 403**（`"trusts a valid signature"` 那条是 POST，所以没暴露）。
- **改法**：`getRawBodyString` 里把「无 rawBody 且 body 是空对象」当作无请求体，返回 `""`。
  rawBody 存在时一律优先，因此真实的 `{}` JSON 请求体不受影响。

## T-10 — ttsFishProvider：夹具音频过不了魔数校验

- **类型**：测试夹具陈旧（生产校验是刻意的）
- **位置**：`src/tests/ttsFishProvider.test.ts:45`（`Uint8Array.from([1,2,3])`）/ `:83`
- **症状**：`TtsGenerationError: 语音服务返回的音频内容无法识别`。
- **根因**：`assertAudioResponse`（`src/tts/tts.provider.ts:24-35`）新增魔数校验，
  防止把 HTML/JSON 错误页当有效音频永久缓存；`[1,2,3]` 既非 `ID3` 也无帧同步。
- **改法**：夹具换成合法 MP3（`ID3\x03\x00` 头 + 若干字节），同步改 `audioBuffer` 断言。

## T-11 — bilibiliSyncService：一次性替身覆盖了链式替身

- **类型**：测试替身缺陷
- **位置**：`src/tests/bilibiliSyncService.test.ts:95-97`
- **症状**：`TypeError: BilibiliSyncModel.findOneAndUpdate(...).lean is not a function`。
- **根因**：`beforeEach` 用 `queryLike()`（可 await 又可链）做默认值，但本用例用
  `mockResolvedValueOnce(...)` 连压两次——plain Promise 没有 `.lean`。
  生产侧 `updateBilibiliSettings` 走 `findOneAndUpdate(...).lean()`（`bilibiliSyncService.ts:370`），
  `ensureDocument` 走直接 await（`:276`），两种用法都在。
- **改法**：两次 Once 都改成 `mockReturnValueOnce(queryLike(...))`；第二次给 `queryLike(null)` 以触发版本冲突分支。

## T-12 — bilibiliAccountService：updateOne 少了第三个实参

- **类型**：断言陈旧
- **位置**：`src/tests/bilibiliAccountService.test.ts:133-136`；生产 `src/services/bilibiliAccountService.ts:113-126`
- **症状**：`toHaveBeenCalledWith` 差异里多出一个 `{"upsert": true}`。
- **根因**：`mirrorLegacyPrimary` 现在给 `BilibiliSyncModel.updateOne` 传 `{ upsert: true }`
  （无旧文档时也要落这条镜像，重复键由 `isDuplicateKeyError` 兜住）。
- **改法**：断言补上第三个实参 `{ upsert: true }`。

## T-13 — linuxDo：ticket 已移到 URL fragment

- **类型**：断言陈旧
- **位置**：`src/tests/linuxDoAuthService.test.ts:122`；生产 `src/services/linuxDoAuthService.ts:337-352`
- **症状**：`Expected: "ticket-value"  Received: null`。
- **根因**：`G2-38` 把一次性 ticket 从 query 移到 URL fragment（不进 Referer、不上服务端日志）：
  `parsed.hash = new URLSearchParams({ ticket }).toString()`。`searchParams.get("ticket")` 自然是 null。
- **改法**：断言改从 `hash` 读 ticket；`client` 参数仍在 query，保持原断言。

---

## 汇总表

| 编号 | 套件 | 类型 | 去向 |
|---|---|---|---|
| T-01 | ipVerificationTokenReuse | 加载期阵亡 | 替掉 turnstile/ipBan |
| T-02 | ipVerificationService | 替身陈旧 | apiKeys 进 config 替身 |
| T-03 | wsUpgradeRouting ×3 | 缺替身 | 替掉 authSessionService |
| T-04 | totp-authentication-fix ×2 | 缺替身 | 共享替身加直通 |
| T-05 | totp-login | 缺替身 | 同上 |
| T-06 | logRoutes ×4 | 测试陈旧 | 补 Bearer + superadmin |
| T-07 | backupCodes ×3 | 缺替身 + 断言陈旧 | 补 getUserSecretsById，断言跟契约 |
| T-08 | passkey-token-validation | 夹具无效 | 替掉 simplewebauthn |
| T-09 | cdictRequestSignature ×2 | **生产缺陷** | 改 getRawBodyString |
| T-10 | ttsFishProvider | 夹具陈旧 | 换合法 MP3 头 |
| T-11 | bilibiliSyncService | 替身缺陷 | Once 改 queryLike |
| T-12 | bilibiliAccountService | 断言陈旧 | 补 `{upsert:true}` |
| T-13 | linuxDoAuthService | 断言陈旧 | ticket 从 hash 读 |
