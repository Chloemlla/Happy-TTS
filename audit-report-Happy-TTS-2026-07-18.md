# Synapse 全量代码审计报告

**项目：** Synapse  
**审计模式：** full（25 个维度）  
**日期：** 2026-07-18  
**审计者：** Codex  
**报告语言：** 中文

---

## 1. Executive Summary

Synapse 是一个大型 TypeScript 全栈平台：后端基于 Express 5、MongoDB，并为部分业务提供 MySQL/文件存储适配；前端使用 React 19 + Vite；多个 Rust worker 承担网络、音频、文件、数据和安全任务。与仓库内 2026-07-05 的历史报告相比，当前版本已经修复多项旧高风险问题：不再共享硬编码请求签名密钥，普通浏览器登录改为 HttpOnly Cookie，LogShare 使用 AES-256-GCM，工单路由补齐专用限流，Vercel 使用 frozen lockfile，Jest 不再 `forceExit`，外置 Rust sidecar 强制要求内部令牌。

当前最高风险集中在 TTS 身份和成本门禁。`TtsController.resolveCurrentUser` 只解析 `Authorization: Bearer`，没有复用项目已支持 Cookie 的 `getTokenFromRequest`。因此普通 Cookie-only 浏览器会话会被 TTS 识别为匿名用户，导致用户额度、政策同意、历史 scope 和任务所有权语义偏移。同时 `GENERATION_CODE` 默认值仍为 `admin`，启动代码还会将当前生成码明文写入日志。默认部署或日志读取权限过宽时，攻击者可利用可预测门禁持续产生外部 TTS 成本。

工程治理基础已经较成熟：配置使用 Zod，生产 secret 可 fail fast；路由拥有认证、限流和 bypass 元数据；TTS quota 使用 Mongo transaction；API Key 余额预扣使用条件原子更新；CI 运行 TypeScript、Jest 和 Rust 检查；仓库还有专门的审计策略脚本。但可维护性债务仍明显：静态统计有 57 个 `.ts/.tsx` 文件超过 800 行，前端拥有 53 个 runtime dependencies，计费事件与余额更新未处于同一事务，API Key 限流仍是进程内 Map，CSP 允许 `unsafe-inline`/`unsafe-eval`。

### Score Dashboard

```text
Security        ██████░░░░  6.4  B   旧关键漏洞已修复，但 TTS Cookie 身份丢失、默认生成码和宽松 CSP 仍削弱生产边界；覆盖 High。
Stability       ███████░░░  7.2  A   启动诊断、health、队列、事务配额和 Rust 限制较完整，但内存限流和静默降级影响多实例一致性；覆盖 Medium-High。
Performance     ██████░░░░  6.6  B   有队列、限流和资源上限，但大型依赖与 57 个巨型模块增加构建、加载和变更成本；覆盖 Medium。
Testing         ██████░░░░  6.8  B   约 100 个后端测试且 CI 执行 Jest，但前端、真实集成和 billing 测试不足；覆盖 High。
Maintainability █████░░░░░  5.5  B   分层与治理清晰，但大量 800–2400 行文件形成系统性 SRP 和变更半径问题；覆盖 High。
Design          ██████░░░░  6.3  B   TTS ports/pipeline 分层良好，但身份解析与横切策略仍有重复实现；覆盖 High。
Release         ███████░░░  7.0  A   CI、锁文件和多阶段构建较成熟，但自动合并与浮动 action/toolchain 仍有供应链风险；覆盖 High。
─────────────────────────────────────
Overall         ██████░░░░  6.5  B
```

### Finding Statistics

| Severity | Count | Confirmed | Suspected |
|----------|-------|-----------|-----------|
| Critical | 0 | 0 | 0 |
| High | 2 | 2 | 0 |
| Medium | 8 | 7 | 1 |
| Low | 3 | 2 | 1 |
| Info | 0 | 0 | 0 |
| **Total** | **13** | **11** | **2** |

## 2. Project Map

后端入口是 `src/app.ts`，按 core middleware、安全 middleware、API routes、静态资源和错误处理顺序装配 `src/app/assembly.ts`。路由集中登记于 `src/routes/index.ts`，控制器位于 `src/controllers/`，服务位于 `src/services/`。TTS 进一步拆分为 `src/tts/` 下的 controller、pipeline、queue、quota、history、storage 和 ports。身份体系支持 Cookie/JWT、Bearer、API Key、OAuth、TOTP 与 Passkey。

前端入口是 `frontend/src/main.tsx` 与 `frontend/src/App.tsx`，API 客户端在 `frontend/src/api/`，会话辅助在 `frontend/src/utils/authSession.ts` 和 `frontend/src/hooks/useAuth.ts`。普通浏览器登录使用 HttpOnly `synapse_token` Cookie；显式 Bearer 注入才进入 sessionStorage。

数据主要存储于 MongoDB，部分模块支持 MySQL 或文件模式。TTS 配额使用 reservation ledger 和 transaction；API Key 计费采用预扣、响应结束后结算、失败退款。Rust 服务位于 `rust-services/`，可嵌入或作为 sidecar 运行，并通过 `INTERNAL_SERVICE_TOKEN` 保护内部接口。

发布面包括 pnpm lockfile、Vite、TypeScript、Jest、Biome、Docker、Vercel、GitHub Actions、Dependabot 和自动合并 workflow。

### Coverage Note

本次静态检查了根配置、`src/`、`frontend/src/`、`.github/workflows/`、Docker/Vercel、Rust 服务目录、测试配置和历史审计报告。根据仓库规则，**没有在本地执行构建、测试、类型检查、lint、安装、SCA、浏览器自动化或负载测试**；实际命令应由 GitHub workflow 执行。

### Coverage Matrix

| Dimension | Coverage | Evidence inspected | Exclusions / limits |
|-----------|----------|--------------------|---------------------|
| Architecture | High | app 装配、路由登记、TTS 分层、Rust 边界 | 未生成运行时调用图 |
| Security | High | Cookie/JWT、TTS auth、replay、CSP、LogShare、secret policy | 未做渗透与 CVE 扫描 |
| Stability | Medium-High | startup、health、queue、quota、Mongo、fallback | 未做 fault injection |
| Performance | Medium | 大文件、依赖、队列、限流、资源上限 | 未做 bundle/profile |
| Testing | High | Jest、CI、测试目录、mock setup | 未执行测试和覆盖率 |
| Maintainability | High | 文件行数、目录和模块职责 | 未运行复杂度工具 |
| Design | High | ports、pipeline、route metadata、auth 重复 | 未逐函数审查全部巨型文件 |
| Release | High | workflows、Docker、Compose、Vercel、lockfile | 未实际构建部署 |
| Documentation | Medium | README、docs、OpenAPI 脚本 | 未逐条执行文档命令 |
| Configuration | High | Zod schema、生产必填项、默认值 | 未用生产环境启动 |
| Observability | Medium | logger、request ID、health、diagnostics | 未验证外部 APM |
| Data-Integrity | High | quota transaction、API billing、schemas | 未做并发压力 |
| Privacy | Medium | Cookie、fingerprint、LogShare、audit | 未完成正式数据地图 |
| Accessibility | Low-Medium | dialog、status、aria 抽样 | 未运行 axe/键盘遍历 |
| Supply-Chain | High | actions、pnpm、Rust、Dependabot | 未做 SBOM/签名验证 |
| Cost | Medium-High | TTS 门禁、quota、billing、limiters | 无真实账单数据 |
| AI-Safety | Low applicability | TTS、内容过滤、政策同意 | 非 agent/RAG 系统 |
| Fallback | Medium | Rust fallback、静默 catch、默认值 | 未注入失败场景 |
| Testing-Authenticity | High | CI、live test 排除、global mocks | 未做 mutation testing |
| Type-Safety | Medium | any、Request 扩展、输入边界 | 未运行 compiler |
| Frontend-State | High | App、EnvManager、LogShare 等 | 未做 React profiler |
| Backend-API | High | route registry、auth、limiters、TTS | 未逐 endpoint 调用 |
| Dependency-Weight | Medium | manifests、依赖数量 | 未跑 bundle analyzer |
| Code-Consistency | Medium-High | logger、auth helper、route patterns | 未运行 Biome |
| Comment-Coverage | Low-Medium | 核心注释抽样 | 未全量评价 |

## 3. Top Risks

| Priority | Finding | Severity | Summary |
|----------|---------|----------|---------|
| P0 | TTS 忽略 HttpOnly Cookie 会话 | High | 已登录浏览器用户被视为匿名，额度、策略和任务所有权发生偏移。 |
| P0 | 生成码默认可预测且写入日志 | High | `GENERATION_CODE=admin` 与明文启动日志放大匿名 TTS 成本滥用。 |
| P1 | CSP 允许 unsafe-inline/unsafe-eval | Medium | 注入发生后 CSP 难以发挥第二道防线作用。 |
| P1 | API Key 限流是进程内 Map | Medium | 多实例可绕过限额，长期 key churn 导致 Map 增长。 |
| P1 | 计费余额和事件非事务一致 | Medium | 金额更新成功、事件失败时产生对账缺口。 |
| P1 | MySQL 适配器使用弱默认 URI | Medium | 漏配时可能误连默认 root/password 数据库。 |
| P1 | 57 个 TypeScript 文件超过 800 行 | Medium | UI、状态、网络、业务规则混合，回归半径过大。 |
| P1 | 自动合并依赖单一 workflow 契约 | Medium | workflow 被弱化时仍可能自动合并。 |
| P2 | 前端 runtime 依赖偏重 | Medium | bundle、安装与供应链风险增加。 |
| P2 | 关键前端检测吞异常 | Low | 安全遥测可能静默失效。 |
| P2 | 前端和真实集成测试不足 | Medium | Cookie、transaction、UI 回归可能逃逸。 |
| P2 | Request auth context 大量使用 any | Low | 身份字段变化无法被编译期发现。 |
| P2 | 指纹/IP 缺少统一治理契约 | Low | 保留、删除、导出规则难以证明。 |

## 4. Detailed Findings

### Finding: TTS 身份解析忽略 HttpOnly Cookie 会话

- Severity: High
- Confidence: High
- Category: Security / Backend API / Data Integrity
- Status: Confirmed
- Affected area: TTS 提交、任务查询、额度与历史所有权
- Evidence:
  - File: `src/tts/tts.controller.ts:35`
  - Function / Module: `TtsController.resolveCurrentUser`
  - Relevant behavior: API Key/OAuth 后只读取 Bearer；没有 Bearer 时直接返回 `null`。
  - File: `src/utils/authCookie.ts:75`
  - Relevant behavior: 统一 helper 已支持 Bearer 与 `synapse_token` Cookie。
  - File: `frontend/src/utils/authSession.ts:4`
  - Relevant behavior: 普通浏览器登录明确采用 Cookie-only。
- Problem: TTS 自行实现了不完整的身份解析，与全站登录契约冲突。
- Why it matters: 已登录用户会被当成匿名用户，quota、政策同意、重复检测、history scope 和 job access 使用错误身份。
- Realistic failure scenario: 用户正常登录后提交 TTS；浏览器只有 Cookie，后端按 anonymous 处理并要求 fingerprint/generationCode，用户额度不生效。
- Minimal fix: 在 `resolveCurrentUser` 中使用 `getTokenFromRequest(req)`，统一执行 JWT 校验。
- Better long-term fix: 建立 typed `AuthContext` middleware，控制器只消费 `req.auth`。
- Regression test suggestion: 增加 Cookie-only 提交、查询 job、消耗用户 quota 的集成测试，并与 Bearer 路径保持一致。
- Estimated effort: 2–4 小时

### Finding: 默认生成码可预测且启动时明文记录

- Severity: High
- Confidence: High
- Category: Security / Configuration / Cost
- Status: Confirmed
- Affected area: 匿名 TTS 门禁、生产日志
- Evidence:
  - File: `src/config/config.ts:84`
  - Relevant behavior: `GENERATION_CODE` 缺失时默认 `admin`。
  - File: `src/app/startup.ts:168`
  - Relevant behavior: 启动日志输出完整当前生成码。
  - File: `src/tts/tts.pipeline.ts:308`
  - Relevant behavior: 非 API Key 请求依赖该值通过生成控制。
- Problem: 成本门禁使用公开可猜默认值，并在日志中泄露。
- Why it matters: 默认部署或日志权限过宽时，匿名用户可持续消耗外部 TTS 额度。
- Realistic failure scenario: 运维未设置生成码；攻击者使用 `admin` 并不断变化文本与指纹，持续触发付费调用。
- Minimal fix: production 强制高熵非空值；删除值日志，只记录 `configured: true/false`。
- Better long-term fix: 使用用户身份、短期票据或服务端 quota 替代长期共享码。
- Regression test suggestion: production 缺失/弱值时配置失败；日志断言不包含真实生成码。
- Estimated effort: 2–4 小时

### Finding: CSP 允许 unsafe-inline 与 unsafe-eval

- Severity: Medium
- Confidence: High
- Category: Security
- Status: Confirmed
- Affected area: 浏览器脚本执行边界
- Evidence:
  - File: `src/app/assembly.ts:260`
  - Relevant behavior: Helmet CSP 多处允许 `'unsafe-inline'`，`scriptSrc` 允许 `'unsafe-eval'`。
- Problem: CSP 对内联脚本和动态求值的限制被显著放宽。
- Why it matters: 富文本、第三方脚本或 DOM 注入出现缺口时，CSP 无法有效阻止执行。
- Realistic failure scenario: 某工具页出现 XSS，攻击脚本调用带 Cookie 的管理 API。
- Minimal fix: 先移除 `unsafe-eval`，必要内联脚本改用 nonce/hash。
- Better long-term fix: CSP report-only 分阶段收紧并收集 violation。
- Regression test suggestion: 浏览器加载核心路由并断言无 CSP violation；增加响应头测试。
- Estimated effort: 1–3 天

### Finding: API Key 限流仅存在于单进程无清理 Map

- Severity: Medium
- Confidence: High
- Category: Stability / Performance / Backend API
- Status: Confirmed
- Affected area: API Key 请求限流
- Evidence:
  - File: `src/middleware/apiKeyAuth.ts:9`
  - Relevant behavior: 每个 key 的窗口存入模块级 `Map`，无定时清理或容量上限。
- Problem: 状态不共享、不持久，过期 key 条目不主动回收。
- Why it matters: 多副本可放大额度；大量 key 导致 Map 长期增长。
- Realistic failure scenario: 三副本部署实际允许约三倍请求；轮换 key 使每个进程保留大量 bucket。
- Minimal fix: 复用 Redis/shared limiter；过渡期增加 TTL sweep 和最大容量。
- Better long-term fix: 将 per-key 动态额度纳入统一 limiter 系统。
- Regression test suggestion: 多实例共享 store 测试总额度不随实例数增加，并验证 bucket 回收。
- Estimated effort: 1–2 天

### Finding: API Key 余额更新与计费事件不在同一事务

- Severity: Medium
- Confidence: High
- Category: Data Integrity / Cost
- Status: Confirmed
- Affected area: prepaid API Key 账本
- Evidence:
  - File: `src/services/apiKeyBillingService.ts:91`
  - Relevant behavior: 条件 `findOneAndUpdate` 原子预扣余额。
  - File: `src/services/apiKeyBillingService.ts:139`
  - Relevant behavior: 退款/累计更新后独立创建 billing event，没有 session transaction。
- Problem: 金额状态和审计事件可能部分成功。
- Why it matters: 余额是财务事实，事件是对账依据；不一致会使差额无法解释。
- Realistic failure scenario: 余额更新成功，事件集合写入失败，用户余额变化但没有 charge/refund 记录。
- Minimal fix: 用 transaction 包裹金额和事件；无法使用 transaction 时采用 outbox。
- Better long-term fix: 不可变双录账本 + reconciliation。
- Regression test suggestion: 故障注入事件失败，断言余额回滚或产生可重试 outbox。
- Estimated effort: 1–3 天

### Finding: MySQL 存储适配器回退到弱默认连接串

- Severity: Medium
- Confidence: High
- Category: Configuration / Security
- Status: Confirmed
- Affected area: lottery、modlist、user generation storage
- Evidence:
  - File: `src/services/lotteryStorage/mysql.ts:3`
  - File: `src/services/modlistStorage/mysql.ts:4`
  - File: `src/services/userGenerationStorage/mysql.ts:5`
  - Relevant behavior: 均回退到 `mysql://root:password@localhost:3306/tts`。
- Problem: 选择 MySQL 模式但漏配 URI 时不会 fail fast。
- Why it matters: 可能误连错误数据库并鼓励保留弱默认凭据。
- Realistic failure scenario: storage mode 切为 mysql，遗漏 URI，服务将数据写入本机默认库。
- Minimal fix: 删除默认 URI；任何 MySQL 模式都由配置 schema 强制 `MYSQL_URI`。
- Better long-term fix: 共享 MySQL provider，集中校验、TLS、池化和生命周期。
- Regression test suggestion: 配置矩阵断言 MySQL 模式缺少 URI 时启动失败。
- Estimated effort: 4–8 小时

### Finding: 57 个巨型模块形成系统性 SRP 违规

- Severity: Medium
- Confidence: High
- Category: Maintainability / Design / Frontend State
- Status: Confirmed
- Affected area: 前端管理组件、路由、核心服务
- Evidence:
  - File: `frontend/src/utils/integrityCheck.ts:1` — 约 2444 行。
  - File: `frontend/src/components/EnvManager.tsx:1` — 约 2200 行。
  - File: `frontend/src/components/CDKStoreManager.tsx:1` — 约 1867 行。
  - File: `src/routes/index.ts:1` — 约 1612 行。
  - Relevant behavior: 共 57 个 `.ts/.tsx` 文件超过 800 行。
- Problem: 多个文件同时承担状态、请求、渲染、校验和业务规则。
- Why it matters: 小改动需要理解大范围上下文，冲突和回归概率上升。
- Realistic failure scenario: EnvManager 新增配置时同时修改状态、请求、通知和多个 section，导致无关配置回归。
- Minimal fix: 先抽纯函数、API hooks、section components 和 route metadata 数据文件。
- Better long-term fix: 建立 800 行治理阈值并渐进减债，不做一次性重写。
- Regression test suggestion: 拆分前补关键行为测试；CI 对新增超阈值文件报警。
- Estimated effort: 分批 2–6 周
- Principle violated: SRP 1.1、High Cohesion 2.2、Small Files 1.2

### Finding: 自动合并依赖单一 workflow 名称和内容

- Severity: Medium
- Confidence: Medium
- Category: Release / Supply Chain
- Status: Suspected
- Affected area: Pull request 自动合并
- Evidence:
  - File: `.github/workflows/auto-merge.yml:4`
  - Relevant behavior: `TypeScript Compilation Check` 成功后自动 squash merge。
  - File: `.github/workflows/tsc.yml:46`
  - Relevant behavior: 当前 workflow 包含 Jest，但自动合并安全性依赖其内容未来不被弱化。
- Problem: 脚本不独立验证 required checks、review 数和 head SHA 完整状态。
- Why it matters: workflow 被删减但名称不变时，自动合并门槛会悄然降低。
- Realistic failure scenario: 为提速暂时跳过 Jest，但保留 workflow 名；所有通过 TSC 的 PR 继续自动合并。
- Minimal fix: 使用 branch ruleset + GitHub auto-merge，或显式校验 required checks 和 approvals。
- Better long-term fix: 合并策略作为 repository ruleset 管理。
- Regression test suggestion: event fixture 覆盖无 review、缺 check、过期 head SHA。
- Estimated effort: 4–8 小时

### Finding: 前端运行时依赖面偏重

- Severity: Medium
- Confidence: Medium
- Category: Performance / Dependency Weight
- Status: Confirmed
- Affected area: frontend bundle 与供应链
- Evidence:
  - File: `frontend/package.json:15`
  - Relevant behavior: 53 个 runtime dependencies，包含 docx、jsPDF、html2canvas、JSZip、Mermaid、KaTeX、Chart.js、Swagger UI 和多套 Markdown/高亮工具。
- Problem: 少数工具页使用的重型库处于同一应用依赖面。
- Why it matters: 懒加载不完整时增加首屏、安装、SCA 和升级成本。
- Realistic failure scenario: 导出组件被静态导入，普通首页用户也下载 PDF/文档依赖。
- Minimal fix: 核查路由 lazy import，将导出、Mermaid、Swagger 隔离为动态 chunk。
- Better long-term fix: 建立 bundle budget 与依赖准入记录。
- Regression test suggestion: workflow 运行 bundle analyzer 并设置入口 chunk 阈值。
- Estimated effort: 1–3 天

### Finding: 关键前端反篡改检测吞掉异常

- Severity: Low
- Confidence: High
- Category: Fallback / Observability
- Status: Confirmed
- Affected area: 扩展/Tampermonkey 检测
- Evidence:
  - File: `frontend/src/main.tsx:454`
  - File: `frontend/src/main.tsx:478`
  - File: `frontend/src/main.tsx:521`
  - File: `frontend/src/main.tsx:561`
  - File: `frontend/src/main.tsx:597`
  - Relevant behavior: 多个分支使用空 `catch (e) {}`。
- Problem: 检测失败既不记录，也不进入降级状态。
- Why it matters: 安全遥测可能静默降低能力，误报/漏报无法诊断。
- Realistic failure scenario: 浏览器阻止属性读取，检测异常退出但系统报告“未检测到”。
- Minimal fix: 记录限频、去敏 debug telemetry，并区分 not-detected 与 check-failed。
- Better long-term fix: 将客户端反篡改仅作为低信任遥测，不作为授权边界。
- Regression test suggestion: mock 属性访问抛错，断言返回不确定状态并仅记录一次。
- Estimated effort: 2–4 小时

### Finding: CI 缺少关键真实路径与前端覆盖

- Severity: Medium
- Confidence: High
- Category: Testing / Testing Authenticity
- Status: Confirmed
- Affected area: frontend、live integrations、billing
- Evidence:
  - File: `jest.ci.config.js:5`
  - Relevant behavior: 多个依赖真实数据库/API/部署环境的测试被 CI 排除。
  - File: `frontend/src/tests/`
  - Relevant behavior: 仅观察到约 5 个测试文件，而前端有大量复杂组件。
  - File: `src/services/billing/__tests__/unit/.gitkeep`
  - Relevant behavior: billing 的 unit/integration/property 目录只有占位文件。
  - File: `src/tests/setup.ts:1`
  - Relevant behavior: 全局 Mongoose mock 不会真实复现索引、session 和 transaction。
- Problem: 最可能发生环境差异和事务语义错误的路径保护不足。
- Why it matters: Cookie auth、Mongo transaction、billing、真实路由装配与前端账号切换回归可能在绿色 CI 中逃逸。
- Realistic failure scenario: mock 支持某查询，但真实 Mongo index/session 行为不同，CI 通过而生产账本不一致。
- Minimal fix: 增加少量 Mongo replica-set integration、Cookie auth 和核心 browser tests；live API tests 进入 nightly workflow。
- Better long-term fix: 建立 unit、contract、integration、browser、nightly 矩阵。
- Regression test suggestion: 优先加入前两项 TTS 回归、billing failure injection 和 Cookie-only 浏览器流程。
- Estimated effort: 1–2 周

### Finding: Request 鉴权上下文大量依赖 any

- Severity: Low
- Confidence: High
- Category: Type Safety / Code Consistency
- Status: Confirmed
- Affected area: auth middleware、TTS、API Key
- Evidence:
  - File: `src/middleware/apiKeyAuth.ts:20`
  - File: `src/tts/tts.controller.ts:35`
  - Relevant behavior: 使用 `(req as any).user`、`apiKey`、`oauthToken`、`requestId`。
- Problem: 身份上下文没有统一 declaration merge 或 discriminated union。
- Why it matters: 字段变化无法在编译期传播到控制器。
- Realistic failure scenario: OAuth middleware 改字段名后，TTS 编译通过但把 OAuth 用户当匿名。
- Minimal fix: 定义统一 `AuthenticatedRequest`/`AuthContext`。
- Better long-term fix: 使用 cookie/jwt/apiKey/oauth/anonymous discriminated union。
- Regression test suggestion: 类型测试并禁止新增 `(req as any).user`。
- Estimated effort: 1–2 天

### Finding: 指纹与 IP 数据缺少统一保留/删除契约

- Severity: Low
- Confidence: Medium
- Category: Privacy / Documentation
- Status: Suspected
- Affected area: anonymous TTS、Turnstile、audit logs
- Evidence:
  - File: `src/tts/tts.pipeline.ts:333`
  - Relevant behavior: 匿名 TTS 使用 fingerprint 与 IP 进行重复检测和访问控制。
  - File: `src/services/turnstile/fingerprint.ts:1`
  - Relevant behavior: 存在持久化 fingerprint 记录。
  - File: `README.md:1`
  - Relevant behavior: 描述数据收集与 Clarity，但未发现统一的数据分类、保留、删除和导出矩阵。
- Problem: 设备指纹、IP 和行为数据的治理规则分散在实现中。
- Why it matters: 用户删除、数据最小化和保留期难以证明一致。
- Realistic failure scenario: 用户删除账户后，匿名 fingerprint/TTS history 仍长期保留。
- Minimal fix: 建立 collection/字段/目的/保留期/删除/导出数据地图。
- Better long-term fix: 将 TTL、删除 job 和隐私导出做成可测试契约。
- Regression test suggestion: 删除用户 fixture 后断言关联 collection 被清理或依法去标识化。
- Estimated effort: 2–5 天

## 5. Architecture Analysis

| Subtype | Count | Affected Areas | Action |
|---------|-------|----------------|--------|
| BoundaryLeak | 1 | TTS auth | 复用统一 auth context |
| OversizedModule | 57 | frontend/routes/services | 渐进拆分 |
| CrossLayerCoupling | 1 | controllers 与身份/存储 | typed middleware/ports |

已验证：`src/app.ts` 装配顺序清晰；路由认证、限流和 bypass 元数据集中治理；TTS controller/pipeline/queue/quota/ports 分层良好；Rust worker 与 Node 有明确内部 token 边界。

## 6. Security Analysis

已修复旧报告中的固定签名密钥、完整 token 日志和 LogShare CBC/内容预览问题。生产环境强制 JWT、sign secret 和管理员密码；Cookie 使用 HttpOnly、SameSite=Lax 和生产 Secure。当前重点是 Cookie-only TTS 身份、默认 generation code 和 CSP。

## 7. Stability Analysis

启动失败明确退出，health 分为公共粗粒度和管理员 details；TTS 使用 queue、reservation confirm/release；Rust 服务有 timeout 和 fallback。风险来自单进程 limiter、多实例状态不一致和静默 catch。

## 8. Performance Analysis

正向项包括 TTS 队列、重复结果复用、路由限流、上传大小限制和 Rust worker。主要风险是前端依赖重量、巨型组件和可能未充分懒加载的导出/渲染库。由于未运行 profiling，结论为 Medium confidence。

## 9. Testing Analysis

Jest 不再 `forceExit`，默认检测开放句柄；CI 执行 Jest，后端约有 100 个测试文件。前端测试、真实 Mongo transaction、外部 integration 和 billing 测试仍不足。

## 10. Maintainability Analysis

目录和命名总体一致，配置与路由治理成熟。57 个 800+ 行文件是最主要的系统性债务。建议每次功能改动顺手抽一个稳定边界，不做大爆炸重写。

## 11. Design Principles Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| SRP | Violation | 57 个巨型模块 |
| High Cohesion | Mixed | TTS 良好，巨型前端组件较弱 |
| Low Coupling | Mixed | ports 正向；TTS auth 重复解析 |
| DRY | Violation | 三个 MySQL 默认 URI、身份解析重复 |
| KISS | Mixed | backend pipeline 清晰，客户端反篡改复杂 |
| Fail Fast | Violation | generation code/MySQL 危险默认 |
| Least Privilege | Mixed | admin routes 较好，CSP/共享码偏宽 |
| Explicit Contracts | Mixed | Zod/ports 良好，Request auth context 较弱 |

## 12. Release Analysis

Vercel 和 CI 使用 frozen lockfile，Docker 多阶段构建，Rust worker 使用非 root 用户。风险是 action 未 pin commit SHA、Rust `stable` 浮动、Dependabot maintenance 使用 PAT，以及自动合并门槛依赖单一 workflow。

## 13. Documentation Analysis

README 和 docs 覆盖架构、功能、安全、部署、OAuth、Rust hybrid 和 telemetry；OpenAPI 有生成与校验脚本。需补统一隐私数据地图、TTS Cookie 身份契约、generation code 生产要求和 integration test 运维说明。

## 14. Configuration Analysis

Zod 对多个生产 secret fail fast，Rust sidecar profile 强制 token。主要违规为 `GENERATION_CODE=admin`、MySQL root/password 默认值。所有产生权限、外部成本或数据库连接的配置都应“启用即必填”。

## 15. Observability Analysis

项目有结构化 logger、request ID、profiling、startup diagnostics、health 和 audit log。未观察到统一 Prometheus/OpenTelemetry/Sentry 证据；应优先增加 TTS 成本、quota 拒绝、billing mismatch、Rust fallback 和 limiter hit 指标。

## 16. Data Integrity Analysis

TTS quota reservation 使用 Mongo transaction；API Key 预扣通过条件更新防止负余额。主要缺口是金额更新与 event 非事务。还应确认 reservation `taskId` 唯一索引和 reconciliation。

## 17. Privacy Analysis

Cookie 和 LogShare 已有较好保护。TTS、Turnstile、Clarity、audit 会处理 IP、fingerprint 和用户标识，应建立统一数据地图、保留期、删除/导出和第三方共享说明。

## 18. Accessibility Analysis

抽样可见 `role=status`、`aria-live`、dialog `aria-modal`、焦点选择器、aria-label 和 alt，说明有主动投入。未运行 axe/屏幕阅读器，因此应补自动化键盘焦点、错误 announcement 和颜色对比测试。

## 19. Supply Chain Analysis

pnpm frozen lockfile、Dependabot、Docker 多阶段和 CI 检查是亮点。建议固定高权限 action SHA 与 Rust toolchain，减少 PAT 权限，并增加 SBOM 和镜像签名。

## 20. Cost Analysis

TTS 有 quota、复用、API Key 预付费、队列和 timeout。最大成本风险是默认/泄露 generation code；匿名请求仅阻止相同内容重复，攻击者可变化文本。应增加匿名日额度和全局预算熔断。

## 21. AI / LLM Safety Analysis

项目主要使用 OpenAI TTS，不是 agent/RAG 系统，prompt injection 适用性低。内容过滤、政策同意、审计事件和输入校验是正向控制。应继续限制文本长度、供应商错误回显和总预算。

## 22. Fallback Analysis

Rust fallback 有可用性价值，但必须通过 readiness、指标和响应 metadata 区分降级。前端空 catch 应改为限频遥测；客户端完整性不应成为强授权边界。

## 23. Testing Authenticity Analysis

### Valuable Tests

- replay protection、auth Cookie、LogShare crypto、critical route security。
- CI 不使用 `forceExit`，能暴露开放句柄。

### Suspicious / Limited

- 全局 Mongoose mock 无法真实复现 index/session/transaction。
- live environment tests 被 CI 排除。
- billing 测试目录为空。

### Missing Tests

- Cookie-only TTS 身份、quota、job ownership。
- generation code 配置与日志脱敏。
- billing 部分失败与 reconciliation。
- 前端认证、账号切换和管理配置。

## 24. Type Safety Analysis

配置、TTS ports 和领域模型类型较好。问题集中在 Express Request 扩展与外部边界的 `(req as any)`。应使用 declaration merging 与 discriminated auth context。

## 25. Frontend State Analysis

| Subtype | Assessment | Affected Components |
|---------|------------|---------------------|
| ComponentSize | High risk | EnvManager、CDKStoreManager、LibreChatPage、LogShare、UserProfile、App |
| StateDuplication | Medium | useAuth、部分组件缓存 |
| EffectChain | Medium | App、大型工具页 |
| UIBusinessCoupling | High | EnvManager、LogShare、CommandManager |
| RequestState | Medium | 多组件自行处理 loading/error |
| RenderPerf | Not assessed | 未运行 profiler |

## 26. Backend API Analysis

路由普遍有专用 limiter，工单 read/write/admin limiter 已补齐，health details 要求管理员。最大问题是 TTS 未复用 Cookie token helper。建议用自动测试保证 route registry metadata 与实际 middleware 一致。

## 27. Dependency Weight Analysis

| Area | Status | Risk | Action |
|------|--------|------|--------|
| Backend runtime deps（约 60） | Medium | 攻击面与升级成本 | 定期 depcheck/SCA |
| Frontend runtime deps（53） | Overweight | bundle/供应链 | route-level lazy chunks |
| Markdown/export stack | Overlapping | 多套解析渲染 | 明确用途并移除重复 |
| Rust workers | Healthy with complexity | 多工具链发布 | 固定 toolchain、contract tests |

## 28. Code Consistency Analysis

logger、Zod config、route limiters 和命名总体一致。少量 controller 仍使用 `console.log`，多个模块自行解析 Request auth。建议扩展 `check-audit-policies.js`：禁止日志输出 generation code、禁止生产默认数据库 URI、禁止新增 `(req as any).user`。

## 29. Comment Coverage Analysis

安全、TTS、Cookie、路由治理和 Rust 边界有较多解释性注释。主要风险是注释契约和实现漂移，例如 Cookie-only 浏览器契约没有被 TTS controller 实现。应优先维护“为什么”和安全假设。

## 30. Recommended Fix Order

### Fix Immediately

| Order | Finding | Minimal fix | Verification |
|-------|---------|-------------|--------------|
| 1 | TTS 忽略 Cookie | 复用 `getTokenFromRequest` | Cookie-only TTS integration |
| 2 | generation code 默认/日志 | production 必填高熵值，日志仅写是否配置 | config + redaction test |

### Fix Before Stable Release

| Order | Finding | Minimal fix | Verification |
|-------|---------|-------------|--------------|
| 3 | CSP unsafe | 移除 unsafe-eval，逐步 nonce | browser CSP test |
| 4 | API Key 内存 limiter | Redis/shared limiter + TTL | multi-instance test |
| 5 | billing 非事务 | transaction/outbox | failure injection |
| 6 | MySQL 默认 URI | 模式化强制配置 | config matrix |
| 7 | 自动合并 | branch ruleset required checks/reviews | event fixture |

### Schedule Later

| Finding | Action |
|---------|--------|
| 巨型模块 | 按功能改动渐进拆分，禁止新增超阈值文件 |
| 前端依赖 | bundle budget、动态 import、依赖准入 |
| 测试真实性 | Mongo integration、browser、nightly live tests |
| Request any | typed auth context |
| 隐私治理 | retention/delete/export contract |

### Ignore for Now

- 公共 health 不限流：返回粗粒度信息且用于探针，可由边缘层防 DDoS。
- 客户端随机 integrity key：可作本地一致性遥测，但不能视作服务端秘密。
- Rust fallback：可保留，但必须能观测降级。

## 31. Quick Wins

| Quick Win | Value | Effort |
|-----------|-------|--------|
| 删除生成码明文日志 | 立即减少 secret 暴露 | 15 分钟 |
| production 强制 generation code | 阻断默认成本门禁 | 30–60 分钟 |
| TTS 使用统一 token helper | 修复 Cookie 身份 | 1–2 小时 |
| 删除 MySQL 默认 URI | 防误连弱凭据 | 1 小时 |
| API Key Map 增加 TTL sweep | 缓解内存增长 | 1–2 小时 |
| 空 catch 增加限频 telemetry | 提高降级可见性 | 1–2 小时 |
| 审计策略禁止 generation code 日志 | 防止回归 | 1 小时 |

## 32. Long-term Refactor Plan

1. **统一身份上下文**：middleware 解析 Cookie/JWT/API Key/OAuth，输出 typed discriminated union；先以现有 auth 集成测试固定契约。
2. **计费与配额账本统一**：采用 transaction/outbox/reconciliation，明确 reservation、charge、refund 不变量。
3. **大型前端模块渐进拆分**：按 API、state hook、section、presentation 拆边界，不重写 UI。
4. **发布治理规则化**：将 required checks、reviews 和 auto-merge 移入 repository ruleset，增加 SBOM/签名。
5. **可观测与成本面板**：聚合 TTS 生成量、匿名命中、quota 拒绝、billing 差异、Rust fallback 和外部 API 成本。

---

## Final Self-Check

- 已覆盖 full 模式全部 25 个维度。
- 主要发现均含 severity、confidence、status、evidence、场景、修复、测试建议和工作量。
- Confirmed 与 Suspected 已区分。
- 分数方向正确：10.0 最好，0.0 最差。
- 未输出 `.env`、token、密码、私钥或完整敏感值。
- 未在本地执行构建、测试、类型检查、lint 或安装。
- 报告基于 2026-07-18 当前工作区静态证据；GitHub workflow 实际运行结果不在本次范围内。
