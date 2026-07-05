# Fuck My Shit Mountain Audit Report

**Project:** Synapse
**Audit mode:** full
**Date:** 2026-07-05
**Reviewer:** GPT-5 Codex

---

## 1. Executive Summary

本次审计按 `fuck-my-shit-mountain` skill 的 `full` 模式执行，覆盖后端 Express/TypeScript、前端 React/Vite、Rust sidecar、CI/CD、Docker/Vercel、测试和文档。审计方式为静态检查；没有运行本地构建、测试或安装命令，遵守仓库要求“实际 build/test 在 GitHub workflow 中执行”。

项目整体不是不可维护状态：配置 schema、启动诊断、请求 ID、集中限流、TTS timeout/circuit breaker、Rust 输入限制、审计日志脱敏和文档都已有明显工程投入。主要风险集中在安全边界和发布链路：请求签名密钥进入前端包，认证 token 被浏览器日志输出，LogShare 会把上传内容片段写入服务端日志，CI workflow 存在 mutable action 与 PAT 自动写回主分支。

稳定性和 TTS/Rust 子系统相对更成熟，但可维护性受超大文件、混合职责组件和大量 `any` 边界拖累。建议优先处理密钥、日志和 CI 权限，再修复发布可复现性、限流缺口和测试真实性。

### Score Dashboard

```
Security        █████░░░░░  4.8  C   客户端签名密钥、Bearer token 日志和 LogShare 敏感日志使安全边界不可信；覆盖为 Medium-High。
Stability       ███████░░░  6.8  B   TTS timeout/circuit、Rust 输入限制和 healthz 存在，但 Compose sidecar token 默认会造成可预期启动失败；覆盖为 Medium。
Performance     ██████░░░░  6.4  B   TTS 有队列/配额，Rust 有大小限制；但依赖重量和超大前端组件会增加构建与运行成本；未做 profiling。
Testing         ██████░░░░  5.6  B   测试数量不少，但 `forceExit`、全局 mock 和过度 mock 降低失败信号真实性；未本地运行测试。
Maintainability █████░░░░░  4.7  C   多个 1500-2600 行文件和混合 UI/业务/配置职责形成系统性变更成本；覆盖为 High。
Design          █████░░░░░  5.0  B   路由治理和分层有正向设计，但 SRP、文件大小、类型边界和配置一致性仍有明显债务；覆盖为 Medium-High。
Release         █████░░░░░  4.9  C   Vercel 忽略 lockfile、CI mutable refs/PAT 自动写回和未 pin 全局工具削弱可复现发布；覆盖为 High。
─────────────────────────────────────
Overall         ██████░░░░  5.5  B
```

Each dimension scored 0.0-10.0. **Higher = better (10 = clean, 0 = shit mountain).** Scores are judgment-based, not formula-based.

### Finding Statistics

| Severity | Count | Confirmed | Suspected |
|----------|-------|-----------|-----------|
| Critical | 1 | 1 | 0 |
| High | 3 | 3 | 0 |
| Medium | 8 | 8 | 0 |
| Low | 0 | 0 | 0 |
| Info | 0 | 0 | 0 |
| **Total** | **12** | **12** | **0** |

## 2. Project Map

Synapse 是一个 TypeScript 全栈 TTS 平台。后端入口为 `src/app.ts` 和 `src/app/assembly.ts`，路由集中在 `src/routes/`，控制器在 `src/controllers/`，业务服务在 `src/services/` 和 `src/tts/`，鉴权、WAF、限流、审计、请求 ID 等横切逻辑在 `src/middleware/`。前端入口为 `frontend/src/main.tsx` 和 `frontend/src/App.tsx`，UI 组件集中在 `frontend/src/components/`，认证与业务 hooks 在 `frontend/src/hooks/`。Rust sidecar 位于 `rust-services/`，提供 network/file/audio/data/security worker，并通过 `INTERNAL_SERVICE_TOKEN` 保护内部 HTTP/IPC。

主要数据流：浏览器持有 JWT/API key 调用 Express API；Express 经过 CORS、WAF、tamper/replay、鉴权、限流后进入路由与控制器；TTS 请求进入 `TtsSubmissionPipeline`、Mongo quota ledger、`TtsQueue`、OpenAI provider 和音频持久化；部分安全、网络、文件和音频任务可交给 Rust worker。主要持久化为 MongoDB，文档中已明确用户体系为 Mongo-only，TTS job/history/audio asset 均有 Mongo 模型。

高风险边界：前端可见密钥、浏览器 token 存储/日志、LogShare 上传内容和加密下载、GitHub Actions 写权限/PAT、Docker/Vercel 可复现构建、路由限流元数据、超大 React 管理组件和 `any` 类型边界。

### Coverage Matrix

| Dimension | Coverage | Evidence inspected | Exclusions / limits |
|-----------|----------|--------------------|---------------------|
| Architecture | Medium-High | `src/app*`, `src/routes/index.ts`, `src/tts/*`, `frontend/src/App.tsx`, 文件清单和大文件统计 | 未画完整依赖图；未运行循环依赖工具 |
| Security | Medium-High | 签名/replay、auth hook、LogShare、route limiters、CI secrets、Rust token auth | 未做动态渗透、依赖 CVE 扫描或 secret 扫描工具 |
| Stability | Medium | TTS retry/circuit、Mongo service、startup diagnostics、healthRoutes、Rust config/input limits | 未做 fault injection、负载测试或服务启动验证 |
| Performance | Medium | TTS queue/quota、Rust max bytes/concurrency、依赖和大文件统计 | 未做 profiling、bundle 分析或 DB explain |
| Testing | Medium | Jest config、package scripts、代表性测试、Rust contract tests | 按仓库要求未本地运行测试 |
| Maintainability | High | 全量文件清单、line count 热点、核心组件/服务结构 | 未做自动复杂度度量 |
| Design | Medium-High | 路由治理、TTS 分层、Rust边界、超大组件、类型边界 | 未逐函数审计所有 1000+ 行文件 |
| Release | High | `.github/workflows/*`, Dockerfile, docker-compose, Vercel config, package manifests | 未实际发布或构建镜像 |
| Documentation | Medium | `docs/rust-node-hybrid-deployment.md`, `docs/backend-mongo-persistence-detail.md`, generated route docs | 未逐字校验所有 docs |
| Configuration | Medium-High | `src/config/config.ts`, `src/config/env.ts`, compose, Vercel, Docker | 未验证所有运行环境变量组合 |
| Observability | Medium | requestId/requestProfiling、healthRoutes、startupDiagnostics、auditLogService、routeLimiter metrics | 未检查外部 APM/Prometheus/alerting |
| Data-Integrity | Medium | TTS quota ledger、job storage、history/audio asset、Mongo docs | 未做并发压力验证 |
| Privacy | Medium | LogShare、auth token、audit log redaction、fingerprint logging | 未做数据地图/保留期全量验证 |
| Accessibility | Low-Medium | App focus trap/status roles、UserManagement/LogShare 表单与按钮抽样 | 未运行浏览器、键盘遍历或 axe |
| Supply-Chain | High | workflows、Dockerfile、Vercel install、package manifests | 未运行 `npm audit`/SCA |
| Cost | Medium | TTS rate/quotas、OpenAI timeout、queue concurrency、logs/dependencies | 未查真实用量和账单 |
| AI-Safety | Low applicability | TTS/OpenAI speech surface、无 RAG/agent/tool-LLM | 项目不是 LLM agent；只做适用性检查 |
| Fallback | Medium | TTS retry/fallback、Rust fallback docs/config、startup fallbacks | 未运行失败场景 |
| Testing-Authenticity | Medium | Jest forceExit、mock-heavy tests、setup global mocks | 未计算覆盖率或 mutation testing |
| Type-Safety | Medium | `any`/casts 搜索、代表性边界文件 | 未运行 TypeScript compiler |
| Frontend-State | High | 大组件统计、`useAuth`, `App`, 管理组件抽样 | 未做 React profiler |
| Backend-API | Medium | 路由注册、TTS routes、ticket routes、route governance | 未逐 endpoint 手工调用 |
| Dependency-Weight | Medium-High | root/frontend `package.json`, Vite config, Docker build deps | 未跑 bundle analyzer |
| Code-Consistency | Medium | env/config patterns、route metadata、test mocks、file naming | 未运行 linter |
| Comment-Coverage | Low-Medium | 文档、TODO/注释抽样、关键模块注释 | 未做全量注释质量审查 |

## 3. Top Risks

| Priority | Finding | Severity | Summary |
|----------|---------|----------|---------|
| P0 | 客户端和服务端共享硬编码请求签名密钥 | Critical | 签名/replay 保护所需的 HMAC secret 被编译进前端，任何浏览器用户都可拿到同一密钥。 |
| P0 | 浏览器日志输出完整 Bearer token | High | `useAuth` 在设置和检查认证时打印 token，扩大 XSS、共享设备和远程日志采集后的账号接管面。 |
| P0 | LogShare 写入上传内容预览并使用弱加密设计 | High | 上传日志内容前 100 字符进入服务端日志，下载加密使用静态 salt + CBC，无认证标签。 |
| P0 | CI workflow 使用 mutable action 与 PAT 自动写回 | High | `actions/*@main`、`version: latest`、`USER_PAT` 自动提交会扩大供应链攻击和误改主分支风险。 |
| P1 | Vercel/Docker/CI 构建不可完全复现 | Medium | Vercel 使用 `--no-frozen-lockfile`，Docker/CI 全局安装未 pin 工具，部署 job 临时安装依赖。 |
| P1 | Compose sidecar 默认空内部 token | Medium | 外置 Rust sidecar profile 会把空 token 注入所有服务，而 Rust worker 会拒绝启动。 |
| P1 | Ticket routes 无路由级限流 | Medium | 工单创建/回复/管理端点只有认证，没有 route limiter，易被认证用户放大为资源消耗。 |
| P1 | 测试基础设施用 `forceExit` 掩盖开放句柄 | Medium | `forceExit` 与全局 mocks 让 CI 绿灯不一定代表资源清理和真实集成路径正确。 |
| P2 | 超大组件和服务违反 SRP/文件大小原则 | Medium | 多个 1500-2600 行文件混合 UI、请求、状态和业务规则，变更 blast radius 大。 |
| P2 | 路由治理元数据与实际路由限流不一致 | Medium | route registry 报告多个模块 `rateLimited:false`，但实际 router 有 limiter，治理输出会误导审核。 |
| P2 | 前端 package 混入后端/构建依赖 | Medium | frontend manifest 包含 Prisma、bcrypt、jsonwebtoken、server WebAuthn、obfuscator 等，增加安装和供应链面。 |
| P2 | `any` 类型边界削弱验证与契约 | Medium | 存储 provider、Mongo options、前端表单/Passkey 多处 `any`，外部边界类型不能提供真实保证。 |

## 4. Detailed Findings

### Finding: 客户端和服务端共享硬编码请求签名密钥

- Severity: Critical
- Confidence: High
- Category: Security
- Status: Confirmed
- Affected area: replay/tamper/request signing
- Principle violated: Configuration over hardcoding 9.1; Fail on missing configuration 9.2; Least privilege 4.6
- Evidence:
  - File: `frontend/src/utils/sign.ts:3-6`
  - Function / Module: frontend HMAC signing helper
  - Relevant behavior: 前端用硬编码 `SECRET_KEY` 对内容做 HMAC；值已在报告中脱敏。
  - File: `frontend/src/utils/requestSigner.ts:18`
  - Function / Module: request signer
  - Relevant behavior: `VITE_SIGN_SECRET_KEY` 缺失时回退到同一个硬编码 signing secret。
  - File: `src/middleware/replayProtection.ts:20`
  - Function / Module: replay protection middleware
  - Relevant behavior: 服务端 `SIGN_SECRET_KEY` 缺失时也使用相同默认 secret。
  - File: `src/utils/sign.ts:3-6`
  - Function / Module: backend signing helper
  - Relevant behavior: 后端 HMAC 默认值与前端一致。
  - File: `frontend/src/utils/integrityCheck.ts:55-58,954`
  - Function / Module: integrity checker
  - Relevant behavior: 前端 integrity/network key 有默认字符串，并参与签名计算。
- Problem: HMAC/replay/integrity secret 不能放在浏览器包内。只要用户能打开前端 bundle，就能提取 secret 并生成看似合法的签名请求；服务端缺少 `SIGN_SECRET_KEY` 时还会接受同一默认值。
- Why it matters: 这会让“签名请求”和“防重放”退化为公开算法，攻击者不需要窃取服务器环境变量即可伪造受保护请求。
- Realistic failure scenario: 攻击者下载前端 bundle，提取 signing secret，脚本化生成带合法 HMAC 的请求，绕过 replay/tamper 中间件对高成本或敏感 API 发起批量操作。
- Minimal fix: 移除前端共享 secret 设计；服务端启动时强制要求 `SIGN_SECRET_KEY`，并且不要提供生产默认值。浏览器端只能持有一次性 nonce、服务器下发的短期 challenge 或用户级 token。
- Better long-term fix: 将签名边界改为服务器生成、服务器验证的一次性 challenge，签名材料绑定用户、action、path、method、timestamp 和 nonce，并对失败原因做审计。
- Regression test suggestion: 添加测试：生产模式缺少 `SIGN_SECRET_KEY` 必须启动失败；前端 bundle/static search 不得包含 signing secret 字面值；replay token 必须绑定 action/path。
- Estimated effort: 1-2 天

### Finding: 浏览器日志输出完整 Bearer token

- Severity: High
- Confidence: High
- Category: Security
- Status: Confirmed
- Affected area: frontend authentication/session handling
- Evidence:
  - File: `frontend/src/hooks/useAuth.ts:74-78`
  - Function / Module: axios request interceptor
  - Relevant behavior: 从 `localStorage` 读取 token 后设置 `Authorization`，并 `console.log` 完整 `Bearer` token。
  - File: `frontend/src/hooks/useAuth.ts:196-201`
  - Function / Module: auth status check
  - Relevant behavior: 认证检查时打印完整 token 和响应数据。
  - File: `frontend/src/hooks/useAuth.ts:121-146,311-393`
  - Function / Module: saved accounts/login/register
  - Relevant behavior: JWT 和多账号 token 存入 `localStorage`/`synapse_saved_accounts`。
  - File: `frontend/src/utils/fingerprint.ts:397-407`
  - Function / Module: fingerprint reporting
  - Relevant behavior: 日志打印 token 前缀和设备信号 payload。
- Problem: 前端认证 token 本来就因 `localStorage` 暴露给 XSS；再把完整 Bearer token 输出到 console，会让远程日志采集、浏览器扩展、共享设备调试记录和用户截图都成为凭证泄漏面。
- Why it matters: JWT 一旦泄漏，攻击者可直接调用 API，影响范围等同于当前用户权限，管理员 token 影响更大。
- Realistic failure scenario: 用户在问题排查时打开 DevTools 或上传浏览器日志，完整 Bearer token 被复制到工单/聊天/远程调试平台，第三方在 token 过期前复用凭证调用管理 API。
- Minimal fix: 删除所有输出 token 的 `console.log`；对必须保留的认证调试日志只记录 token 是否存在、长度或哈希前 6 位，并仅在显式 debug build 中启用。
- Better long-term fix: 用 HttpOnly/SameSite secure cookie 或短期 access token + refresh token 机制降低 XSS 后果；建立前端日志脱敏 wrapper。
- Regression test suggestion: 增加静态测试或 ESLint rule，禁止 `console.*` 参数包含 `token`、`Authorization`、`Bearer`；单测断言 auth hook 不输出敏感值。
- Estimated effort: 2-4 小时

### Finding: LogShare 写入上传内容预览并使用弱加密设计

- Severity: High
- Confidence: High
- Category: Security
- Status: Confirmed
- Affected area: LogShare upload/download/privacy
- Evidence:
  - File: `src/routes/logRoutes.ts:121-155`
  - Function / Module: `checkAdminPassword`
  - Relevant behavior: 管理员密码校验流程用 `console.log` 记录认证流程、用户数量和管理员用户名。
  - File: `src/routes/logRoutes.ts:190-211`
  - Function / Module: `encryptData`
  - Relevant behavior: 使用静态 salt、PBKDF2 10000 次、AES-256-CBC 加密；没有认证标签。
  - File: `src/routes/logRoutes.ts:269-270`
  - Function / Module: `/sharelog` upload
  - Relevant behavior: 保存上传内容时把 `content.slice(0, 100)` 写入服务端日志。
  - File: `src/routes/logRoutes.ts:337,424`
  - Function / Module: encrypted responses
  - Relevant behavior: 下载/列表响应用用户 token 或管理员密码派生密钥加密。
- Problem: 上传日志通常可能包含 token、邮箱、IP、错误堆栈、业务数据或用户输入。服务端日志写入前 100 字符会违反最小化原则；CBC 无认证会让密文完整性不可验证，静态 salt 也削弱密码派生隔离。
- Why it matters: 日志系统常被更多人员和第三方平台访问，敏感内容进入日志后比进入 Mongo 更难删除和审计。
- Realistic failure scenario: 用户上传包含 access token/API key 的日志，服务端把开头片段写入容器日志；日志被集中采集到第三方平台，运维或攻击者拿到可用凭证。
- Minimal fix: 删除 `contentPreview` 日志；管理员认证日志改用结构化 logger 且只记录 requestId/result。加密改为 AES-GCM/ChaCha20-Poly1305，随机 salt，提升 KDF 参数并保存版本字段。
- Better long-term fix: 为 LogShare 建立数据分类、保留期、删除作业和访问审计；上传前后均执行敏感模式脱敏。
- Regression test suggestion: 单测上传包含伪 token 的内容，断言 logger 不接收原文片段；加密测试篡改密文必须解密失败。
- Estimated effort: 1 天

### Finding: CI workflow 使用 mutable action 与 PAT 自动写回

- Severity: High
- Confidence: High
- Category: Release
- Status: Confirmed
- Affected area: GitHub Actions supply-chain / branch integrity
- Evidence:
  - File: `.github/workflows/biome-check.yml:16-31`
  - Function / Module: Biome safe-fix workflow
  - Relevant behavior: 使用 `actions/checkout@main`、`actions/setup-node@main`、`pnpm/action-setup` `version: latest`，并执行 `pnpm add -D --save-exact @biomejs/biome`。
  - File: `.github/workflows/biome-check.yml:77-96,158`
  - Function / Module: workflow writeback
  - Relevant behavior: 第二套 job 同样使用 mutable refs/latest，并通过 `secrets.USER_PAT` 进行 GitHub CLI 操作。
  - File: `.github/workflows/auto-merge.yml:32`
  - Function / Module: auto merge
  - Relevant behavior: token 使用 `secrets.USER_PAT || github.token`。
- Problem: CI 中 mutable action refs 和 `latest` 会随上游变化；结合 PAT 写权限和自动提交/合并逻辑，会把供应链或配置错误直接放大到主分支。
- Why it matters: 发布链路的完整性取决于 workflow 本身可审计、可复现、最小权限。可变引用和长期 PAT 会绕过很多代码审查假设。
- Realistic failure scenario: 上游 action 的 `main` 分支变化或被污染，workflow 使用 PAT checkout 并写回“safe fix”，导致未审查的依赖/格式化/配置变更进入主分支。
- Minimal fix: 将 action pin 到稳定 tag 或 commit SHA；移除 `pnpm add` 动态改依赖；safe-fix workflow 只打开 PR，不直接推主分支；默认使用 `GITHUB_TOKEN` 最小权限。
- Better long-term fix: 发布 workflow 单独隔离权限，所有写操作经过环境保护、CODEOWNERS 和分支保护；引入 provenance/SBOM。
- Regression test suggestion: 添加 workflow lint（如 actionlint + 自定义检查）禁止 `uses: *@main`、`version: latest` 和未审批 PAT push。
- Estimated effort: 0.5-1 天

### Finding: Vercel/Docker/CI 构建不可完全复现

- Severity: Medium
- Confidence: High
- Category: Release
- Status: Confirmed
- Affected area: release reproducibility
- Evidence:
  - File: `vercel.json:3`
  - Function / Module: root Vercel install command
  - Relevant behavior: `pnpm install --no-frozen-lockfile` 允许部署时解析出不同依赖图。
  - File: `frontend/vercel.json:3`
  - Function / Module: frontend Vercel install command
  - Relevant behavior: 同样使用 `--no-frozen-lockfile`。
  - File: `Dockerfile:67`
  - Function / Module: Docker build tool install
  - Relevant behavior: 全局安装 `javascript-obfuscator`，不受 lockfile 管理。
  - File: `.github/workflows/tsc.yml:41`
  - Function / Module: CI build prep
  - Relevant behavior: CI 也全局安装 obfuscator。
  - File: `.github/workflows/docker.yml:81,174`
  - Function / Module: Docker publish/deploy workflow
  - Relevant behavior: 使用 `node-version: latest`，部署阶段临时 `pnpm install ssh2 dotenv axios form-data --ignore-scripts`。
- Problem: 同一 commit 在 Vercel、Docker、CI 和部署脚本中可能解析出不同依赖/工具版本，构建结果不可完全复现。
- Why it matters: 当线上回归或供应链问题发生时，无法确定问题来自源码、lockfile、工具链还是当天解析到的包。
- Realistic failure scenario: Vercel 部署当天解析到新的 transitive dependency 或新的 Node latest，前端 build 行为变化；本地/CI lockfile 构建无法复现线上问题。
- Minimal fix: Vercel 使用 `pnpm install --frozen-lockfile --ignore-scripts`；Docker/CI 使用 lockfile 内的 devDependency 或 `pnpm exec`；Node 版本 pin 到明确 LTS。
- Better long-term fix: 用 Corepack/pnpm/action setup 固定版本，生成可追溯 artifact，Docker image pin base digest 并输出 checksum/SBOM。
- Regression test suggestion: workflow lint 检查禁止 `--no-frozen-lockfile`、`node-version: latest`、未 pin 全局安装。
- Estimated effort: 0.5-1 天

### Finding: Compose sidecar 默认空内部 token

- Severity: Medium
- Confidence: High
- Category: Stability
- Status: Confirmed
- Affected area: Docker Compose Rust sidecars
- Evidence:
  - File: `docker-compose.yml:50,67,82,97,113,129`
  - Function / Module: app and Rust sidecar environment
  - Relevant behavior: 多个服务设置 `INTERNAL_SERVICE_TOKEN=${INTERNAL_SERVICE_TOKEN:-}`，默认为空字符串。
  - File: `rust-services/network-tools/src/config.rs:27-29`
  - Function / Module: network-tools config
  - Relevant behavior: Rust 从环境读取 token，空值直接返回 `MissingInternalToken`。
  - File: `rust-services/audio-worker/src/config.rs:22-24`, `rust-services/file-worker/src/config.rs:22-24`, `rust-services/security-worker/src/config.rs:23-25`
  - Function / Module: Rust worker config
  - Relevant behavior: 多个 worker 均要求非空 `INTERNAL_SERVICE_TOKEN`。
  - File: `src/config/config.ts:260-265`
  - Function / Module: Node config validation
  - Relevant behavior: 外置 Rust service 启用且 embedded disabled 时会要求 token。
  - File: `docs/rust-node-hybrid-deployment.md:43-45,91-122`
  - Function / Module: deployment docs
  - Relevant behavior: 文档要求 sidecar 模式显式提供共享 token。
- Problem: 文档和 Rust 代码都要求外置 sidecar 有 token，但 Compose 默认值允许空 token 进入配置，导致 `rust-sidecars` profile 启动体验和发布验证不一致。
- Why it matters: 发布时的启动失败比编译失败更晚暴露，容易造成部署窗口内服务不可用或 Rust path 被意外禁用。
- Realistic failure scenario: 运维按 Compose profile 启动外置 sidecars 但忘记设置 token；Rust 容器立即失败，Node 也因外置 Rust config 校验失败或内部调用 401/503。
- Minimal fix: Compose 用 `${INTERNAL_SERVICE_TOKEN:?set INTERNAL_SERVICE_TOKEN for rust sidecars}`；仅 embedded 单容器模式允许 Node 生成临时 token。
- Better long-term fix: 增加 `docker compose config`/workflow smoke check，分别覆盖 embedded 和 sidecar 两种部署模式。
- Regression test suggestion: CI 增加 Compose 配置校验：未设置 token 的 sidecar profile 必须失败且错误清晰；设置 token 后 config 渲染一致。
- Estimated effort: 1-3 小时

### Finding: Ticket routes 无路由级限流

- Severity: Medium
- Confidence: High
- Category: Security
- Status: Confirmed
- Affected area: ticket API
- Evidence:
  - File: `src/routes/ticketRoutes.ts:8`
  - Function / Module: ticket router
  - Relevant behavior: router 只全局使用 `authenticateToken`。
  - File: `src/routes/ticketRoutes.ts:11-14`
  - Function / Module: user ticket endpoints
  - Relevant behavior: 创建工单、查询工单、回复消息未挂 route limiter。
  - File: `src/routes/ticketRoutes.ts:25-28`
  - Function / Module: admin ticket endpoints
  - Relevant behavior: 管理端查询、状态更新、编辑/删除消息也未挂 route limiter。
  - File: `src/routes/index.ts:878-882`
  - Function / Module: route governance registry
  - Relevant behavior: `ticket-routes` 标记 `rateLimited: false`。
- Problem: 工单是可增长的持久化写入/查询面，只有认证不足以防止被有效账号或被盗账号刷爆。
- Why it matters: 单个认证用户可以批量创建工单/消息，增加数据库、通知、审计和管理员工作量；管理员端也缺少暴力操作保护。
- Realistic failure scenario: 攻击者注册或盗用普通账号，循环调用创建和回复接口，短时间写入大量 ticket/message 文档并拖慢后台查询。
- Minimal fix: 为 ticket router 增加 `ticketLimiter`，创建/回复使用更严格写限流，列表/详情使用读限流，admin 操作叠加 `adminLimiter`。
- Better long-term fix: 引入 per-user quota、工单状态机幂等和 abuse audit，route governance 中声明 policy 并生成文档。
- Regression test suggestion: 路由集成测试连续提交超过阈值后返回 429，并验证 admin route 同时需要 auth/admin/limiter。
- Estimated effort: 2-4 小时

### Finding: 测试基础设施用 forceExit 掩盖开放句柄

- Severity: Medium
- Confidence: High
- Category: Testing
- Status: Confirmed
- Affected area: Jest test runner and representative tests
- Evidence:
  - File: `package.json:22-34`
  - Function / Module: npm test scripts
  - Relevant behavior: 多个测试脚本使用 `jest --forceExit --detectOpenHandles`，CI 脚本使用 `--runInBand --coverage`。
  - File: `jest.config.js:46-51`
  - Function / Module: Jest config
  - Relevant behavior: `maxConcurrency: 1`、`maxWorkers: 1`、`forceExit: true`、`detectOpenHandles: true`。
  - File: `src/tests/authRoutes.test.ts:5-61`
  - Function / Module: auth route test
  - Relevant behavior: 大量 controller/middleware 被 mock 成 noop，只测试 helper 行为。
  - File: `src/tests/setup.ts:244-400,509-596`
  - Function / Module: global test setup
  - Relevant behavior: Mongoose、rate limiters、config、storage 等大量基础设施被全局 mock。
- Problem: `forceExit` 会让未关闭连接/定时器/worker 被强制吞掉；过度 mock 的路由测试验证的是 mock 接线而不是真实 middleware/controller 行为。
- Why it matters: 资源泄漏、真实初始化顺序、auth/rate-limit 集成和数据库连接清理问题可能在 CI 绿灯下逃逸。
- Realistic failure scenario: 某个服务新增 interval 或 Mongo listener 未清理，Jest 仍强制退出；线上长时间运行后出现句柄泄漏或重复任务。
- Minimal fix: 逐步移除 `forceExit`，先为最容易泄漏的套件补 teardown；保留少量 mock 单测，但关键 auth/rate-limit/TTS flow 增加真实 middleware 集成测试。
- Better long-term fix: 建立测试分层：纯单元、真实 Express supertest、Mongo memory/integration、Rust contract；禁止全局 mock 影响集成测试。
- Regression test suggestion: 新增 CI job 不带 `forceExit` 跑关键集成套件；authRoutes 增加真实 controller/middleware wiring 测试。
- Estimated effort: 1-3 天

### Finding: 超大组件和服务违反 SRP/文件大小原则

- Severity: Medium
- Confidence: High
- Category: Maintainability
- Status: Confirmed
- Affected area: frontend components, backend controllers/services
- Principle violated: Single Responsibility 1.1; File Size Limit 1.2; KISS 4.3
- Evidence:
  - File: `frontend/src/components/EnvManager.tsx:1-2611`
  - Function / Module: environment management UI
  - Relevant behavior: 单文件约 2611 行，覆盖多个配置域、表单状态、API 调用和渲染。
  - File: `frontend/src/components/UserProfile.tsx:1-2228`
  - Function / Module: user profile
  - Relevant behavior: 单文件约 2228 行，包含账号绑定、MFA、Passkey、资料编辑等多职责。
  - File: `frontend/src/components/UserManagement.tsx:1-2224`
  - Function / Module: admin user management
  - Relevant behavior: 单文件约 2224 行，混合筛选、批量操作、表单、敏感字段展示。
  - File: `src/controllers/adminController.ts:1-1947`
  - Function / Module: admin controller
  - Relevant behavior: 管理端控制器约 1947 行。
  - File: `src/services/ecoEnchantsService.ts:1-1597`, `src/services/dataCollectionService.ts:1-1451`
  - Function / Module: backend services
  - Relevant behavior: 多个服务超过 1400 行。
- Problem: 这些文件超过 skill 原则阈值很多倍，通常意味着多个 change reason 被塞进一个文件；小需求会触碰大量状态和渲染分支。
- Why it matters: 代码 review、测试定位、冲突解决和回归范围都会变大，安全/权限改动也更容易漏掉某个分支。
- Realistic failure scenario: 修改 EnvManager 某个 secret 配置表单时，影响同文件其他 provider 配置状态；review 难以确认没有破坏无关配置流。
- Minimal fix: 先按稳定边界拆分：API client hook、schema/表单 reducer、展示组件、危险操作 modal；每次只拆一个配置域或管理 workflow。
- Better long-term fix: 为 admin/config 建立领域级模块结构和共享 form primitives，结合 focused tests 覆盖每个 workflow。
- Regression test suggestion: 每拆一个组件，添加对应 UI smoke/unit test，验证主要表单 load/save/delete 和错误状态。
- Estimated effort: 1-2 周分批

### Finding: 路由治理元数据与实际路由限流不一致

- Severity: Medium
- Confidence: High
- Category: Maintainability
- Status: Confirmed
- Affected area: route governance registry and generated docs
- Evidence:
  - File: `src/routes/index.ts:802-807`
  - Function / Module: route module registry
  - Relevant behavior: `api-key-routes` 标记 `rateLimited: false`。
  - File: `src/routes/apiKeyRoutes.ts:20,33-34`
  - Function / Module: API key routes
  - Relevant behavior: 实际定义 `apiKeyManagementLimiter` 并 `router.use(apiKeyManagementLimiter)`。
  - File: `src/routes/index.ts:914,996,1047,1091,1135,1182`
  - Function / Module: route module registry
  - Relevant behavior: human-check、lottery、log、image-data、fbi-wanted、nexai 等模块被标记未限流。
  - File: `src/routes/humanCheckRoutes.ts:10,65`, `src/routes/logRoutes.ts:112,221`, `src/routes/nexaiRoutes.ts:18-54,120-706`
  - Function / Module: concrete routers
  - Relevant behavior: 实际路由存在 limiter。
  - File: `package.json:36`, `src/routes/index.ts:1411-1502`
  - Function / Module: generated route audit/governance
  - Relevant behavior: 项目有 route audit 生成与治理校验脚本。
- Problem: 治理元数据和真实路由行为不一致，会让生成文档和审计输出产生 false positive/false negative。
- Why it matters: 安全审核依赖治理表时，可能误判某些路由未限流，也可能漏掉真正未限流的 ticket routes。
- Realistic failure scenario: 发布前只看 generated route governance，团队认为大量路由缺限流而忽略真实 limiter，同时对 ticket routes 的真实缺口没有提升优先级。
- Minimal fix: 更新 registry 中 `rateLimited` 与 `rateLimitPolicy`，把 route-level limiter 也纳入治理模型。
- Better long-term fix: 从 Express router 实际 middleware 或 declarative route builder 自动生成治理数据，减少人工双写。
- Regression test suggestion: route governance test 对比 registry 与 concrete router policy，已挂 limiter 的模块不得标记 false。
- Estimated effort: 0.5-1 天

### Finding: 前端 package 混入后端/构建依赖

- Severity: Medium
- Confidence: High
- Category: Performance
- Status: Confirmed
- Affected area: frontend dependency manifest and build toolchain
- Evidence:
  - File: `frontend/package.json:35-61`
  - Function / Module: frontend dependencies
  - Relevant behavior: 前端依赖包含 `@prisma/client`、`@react-email/components`、`@simplewebauthn/server`、`bcrypt`、`express-rate-limit`、`form-data`、`javascript-obfuscator`、`jsonwebtoken`。
  - File: `frontend/package.json:103,115`
  - Function / Module: frontend devDependencies
  - Relevant behavior: `@types/javascript-obfuscator` 与另一个 `javascript-obfuscator` 版本并存。
  - File: `frontend/static-server.js:3`
  - Function / Module: static server helper
  - Relevant behavior: `express-rate-limit` 只在 frontend static server 中使用。
  - File: `frontend/vite.config.ts:6,465`
  - Function / Module: Vite config
  - Relevant behavior: build-time 使用 obfuscator，并在 optimizeDeps 中排除。
- Problem: 浏览器前端 manifest 中混入服务器、加密、邮件、ORM 和构建混淆依赖，会拉长安装时间、扩大供应链面，并增加误打包风险。
- Why it matters: 依赖越重，CI/Vercel/Docker 解析、缓存、审计和漏洞响应成本越高；server-only 包进入前端 workspace 会模糊边界。
- Realistic failure scenario: 一个 server-only dependency 出现高危 CVE，Dependabot/CI 在 frontend 也报警；团队需要判断是否真实可利用，发布被阻塞。
- Minimal fix: 将 static server 和 build obfuscator 依赖移到明确的 devDependency/tooling package；移除前端未使用 server deps。
- Better long-term fix: 分离 workspace：`frontend` 只保留 browser/runtime deps，tooling/server helpers 放到独立 package 或根 devDependency。
- Regression test suggestion: 添加 dependency policy 脚本，禁止 frontend dependencies 中出现 ORM、bcrypt、jsonwebtoken、server WebAuthn 等 server-only 包。
- Estimated effort: 0.5-1 天

### Finding: `any` 类型边界削弱验证与契约

- Severity: Medium
- Confidence: High
- Category: Maintainability
- Status: Confirmed
- Affected area: TypeScript type boundaries
- Principle violated: Boundary contracts 7; Fail-fast 4.4
- Evidence:
  - File: `src/utils/userStorageProvider.ts:5-13`
  - Function / Module: `UserStorageProvider`
  - Relevant behavior: 用户存储接口返回和接收大量 `any`，包括 `getAllUsers`, `createUser`, `updateUser`。
  - File: `src/services/userGenerationStorage/mongo.ts:21,27,39`
  - Function / Module: user generation storage
  - Relevant behavior: `sanitizeString(str: any)`, `findDuplicateGeneration(...: any)`, `addGenerationRecord(record: any)`。
  - File: `src/services/mongoService.ts:62`
  - Function / Module: Mongo connection options
  - Relevant behavior: `mongooseOptions: any` 承载连接配置。
  - File: `frontend/src/components/UserManagement.tsx:1166-1401,1911-2326`
  - Function / Module: admin user management
  - Relevant behavior: 多个 `catch (e: any)` 和 `passkeyResponse: any` 出现在安全相关管理 UI。
  - File: `frontend/src/components/UserProfile.tsx:124`
  - Function / Module: API response wrapper
  - Relevant behavior: `ApiResponse<T = any>` 默认绕过响应类型。
- Problem: 类型系统在数据存储、API 响应、Passkey、管理表单这些边界处被绕过，运行时验证和编译期契约割裂。
- Why it matters: 字段重命名、权限字段缺失、日期/数字类型错误和敏感字段泄漏更难在编译期发现。
- Realistic failure scenario: 用户模型新增安全字段后，`any` 接口允许前端/后端传递不完整对象，管理员编辑保存时覆盖或丢失字段。
- Minimal fix: 从用户、TTS generation、Passkey response、API response 四个边界开始定义精确类型；`catch` 用 `unknown` 后窄化。
- Better long-term fix: 外部输入全部用 Zod/schema 解析，内部用 domain types；API client 自动生成或共享 response DTO。
- Regression test suggestion: 增加 type-level tests 或 `tsc --noEmit` CI gate，禁止关键目录新增 `any`；为 UserStorageProvider 增加 DTO contract tests。
- Estimated effort: 2-5 天分批

## 5. Architecture Concerns

- Coverage: Medium-High
- Inspected evidence: `src/app.ts`, `src/app/assembly.ts`, `src/routes/index.ts`, `src/tts/*`, `frontend/src/App.tsx`, 大文件统计。
- Exclusions / limits: 未运行依赖图工具；未全量审计每个 service。

主要架构是分层的：routes/controllers/services/middleware 清晰，TTS 已拆出 pipeline/queue/provider/storage/asset，Rust worker 通过 internal token 与 HTTP/IPC 形成边界。主要架构债务是超大 UI/controller/service 文件和 route governance 双写。相关 findings：F8、F9、F10、F12。

| Subtype | Count | Affected Areas | Recommended Action |
|---------|-------|----------------|-------------------|
| ModuleBoundary | 2 | EnvManager/UserManagement/adminController | 按 workflow 和 API hook 拆分 |
| BoundaryContract | 2 | UserStorageProvider, route governance | 建立显式 DTO 和自动化治理 |
| EvolutionRisk | 2 | frontend admin pages, release workflows | 降低单文件/单 workflow 变更面 |

## 6. Security Concerns

- Coverage: Medium-High
- Inspected evidence: HMAC/replay, auth hook, LogShare, route limiters, CI secrets, audit redaction, Rust token auth。
- Exclusions / limits: 未做动态攻击验证、SCA 或真实 secret 扫描工具。

安全首要问题是“浏览器可见的安全边界”：签名 secret、Bearer token 日志和 LogShare 原文日志都应优先处理。正向证据包括 `src/config/config.ts:196-209` 在生产要求 `JWT_SECRET`/`ADMIN_PASSWORD`，`src/middleware/auditLog.ts:30-40` 与 `src/services/auditLogService.ts:48-58` 有敏感字段脱敏列表，Rust worker 对内部 token 和输入大小有校验。

## 7. Stability Concerns

- Coverage: Medium
- Inspected evidence: TTS provider timeout/retry/circuit、Mongo connection、startup diagnostics、health routes、Rust config。
- Exclusions / limits: 未做 fault injection、长跑测试、真实容器启动。

TTS 路径有 45s OpenAI timeout、有限重试和 circuit breaker；Rust worker 对空 token、payload 大小、私网 network target 有 fail-fast。主要稳定性风险是 Compose sidecar token 默认与代码/文档不一致，以及测试 `forceExit` 可能隐藏资源泄漏。

## 8. Performance Concerns

- Coverage: Medium
- Inspected evidence: TTS queue/quota、Rust max bytes/concurrency、dependency manifests、line count。
- Exclusions / limits: 未做 bundle analyzer、CPU/DB profiling。

性能不是最危险维度。正向点：TTS submission 有限流和 quota，Rust worker 有 `max_bytes`/`max_concurrency`，历史查询有 limit。风险集中在依赖重量、超大前端组件和潜在 bundle/install 成本。

## 9. Testing Gaps

- Coverage: Medium
- Inspected evidence: Jest config/scripts、代表性 tests、Rust contract tests。
- Exclusions / limits: 未运行测试；未查看覆盖率报告。

测试数量可观，但真实性不均。`forceExit`、串行 maxWorkers 和全局 mock 说明现有测试对资源生命周期和真实集成路径的信号偏弱。Rust contract tests 和若干 service tests 是正向资产，应保留并扩展。

## 10. Maintainability Concerns

- Coverage: High
- Inspected evidence: 全量文件 inventory、大文件 line count、核心组件/服务抽样。
- Exclusions / limits: 未计算 cyclomatic complexity。

维护性最低分来自文件规模和职责混合。多个 1500 行以上文件说明局部修复已经开始承载过多上下文。建议先从高变更频率、高安全权重的 `EnvManager`、`UserManagement`、`adminController` 拆分。

## 11. Design / Principles Concerns

- Coverage: Medium-High
- Inspected evidence: principles rubric 对照、TTS/Rust/route/config/type 边界。
- Exclusions / limits: 未逐函数检查所有原则。

违反最明显的原则：SRP 1.1、File Size Limit 1.2、Configuration over hardcoding 9.1、Fail on missing configuration 9.2、Boundary contracts 7。遵守较好的原则：TTS provider timeout、Rust fail-fast input validation、route limiter registry、audit log redaction。

## 12. Release Concerns

- Coverage: High
- Inspected evidence: `.github/workflows/*`, Dockerfile, docker-compose, Vercel config, package manifests。
- Exclusions / limits: 未实际构建或发布。

发布链路有两类问题：CI 权限/供应链完整性和构建可复现性。修复顺序应先 pin actions/移除 PAT 直写，再统一 lockfile/toolchain 策略。

## 13. Documentation Analysis

- Coverage: Medium
- Inspected evidence: `docs/rust-node-hybrid-deployment.md`, `docs/backend-mongo-persistence-detail.md`, generated route docs。
- Exclusions / limits: 未全量校验所有文档。

文档总体丰富，尤其 Rust/Node hybrid、Mongo 持久化和 route governance。有一处可执行配置不匹配：文档要求外置 sidecar 显式 token，但 Compose 默认空 token。生成类 route docs 的准确性依赖 registry，当前存在 metadata mismatch。

## 14. Configuration Safety Analysis

- Coverage: Medium-High
- Inspected evidence: `src/config/config.ts`, `src/config/env.ts`, Docker/Vercel/Compose。
- Exclusions / limits: 未覆盖所有 env permutation。

`src/config/config.ts` 使用 Zod 并在生产要求关键密钥，这是强项。主要问题是 signing secret 默认、Compose token 默认和 `src/config/env.ts` 中仍有一些直接默认值/环境读取模式。

## 15. Observability / Operability Analysis

- Coverage: Medium
- Inspected evidence: requestId、requestProfiling、startupDiagnostics、healthRoutes、auditLogService、routeLimiter metrics。
- Exclusions / limits: 未验证外部 APM/alerting/metrics scraping。

已有 request ID、健康检查、启动依赖诊断、审计日志脱敏和限流 metrics registry。缺口是 LogShare 仍绕过统一 logger 直接 `console.log`，且没有看到 Prometheus/告警/runbook 级别的生产运营闭环。

## 16. Data Integrity Analysis

- Coverage: Medium
- Inspected evidence: TTS quota ledger、job storage、history/audio asset、Mongo docs。
- Exclusions / limits: 未并发验证；未审计所有业务集合。

TTS quota 使用 reserve/confirm/release，job claim 有 lease 和 stale recovery，音频持久化失败时 fallback 到 file-only metadata，设计上有一定韧性。主要数据完整性风险来自类型边界 `any` 和超大管理 UI 可能覆盖敏感用户字段。

## 17. Privacy / Data Governance Analysis

- Coverage: Medium
- Inspected evidence: LogShare、auth token、audit log redaction、fingerprint logging。
- Exclusions / limits: 未完整绘制数据保留/删除地图。

隐私风险主要是 LogShare 原文日志、Bearer token 日志和指纹/设备信号日志。正向点是审计日志服务已有敏感字段脱敏列表和文本 sanitization。

## 18. Accessibility / UX Correctness Analysis

- Coverage: Low-Medium
- Inspected evidence: `frontend/src/App.tsx` status roles/focus trap、LogShare/UserManagement 表单和 aria-label 抽样。
- Exclusions / limits: 未使用浏览器、键盘遍历、screen reader 或 axe。

没有确认可作为高置信 finding 的可访问性缺陷。正向证据：App 有 `role="status"`、`aria-live`、dialog `aria-modal`、focus restore/trap，LogShare 多处 icon button 有 `aria-label`。建议后续用 Playwright/axe 覆盖登录、TTS、管理员管理、LogShare 四个关键流。

## 19. Supply Chain / Reproducibility Analysis

- Coverage: High
- Inspected evidence: CI workflow refs、PAT、Vercel install、Docker global install、package manifests。
- Exclusions / limits: 未跑 SCA/CVE 扫描。

核心问题是 mutable CI 和不可复现构建。优先修复 F4/F5/F11。

## 20. Cost / Resource Economics Analysis

- Coverage: Medium
- Inspected evidence: TTS rate limits, quota ledger, OpenAI timeout, queue concurrency, dependency weight。
- Exclusions / limits: 未看真实 API 用量/账单。

TTS 成本控制有基础：submission limiter、API key auth、daily quota、队列并发和 duplicate reuse。风险来自未限流 ticket 写入、LogShare 日志膨胀、前端依赖重量和潜在重复 CI 安装成本。

## 21. AI Safety Analysis

- Coverage: Low applicability
- Inspected evidence: OpenAI TTS provider、TTS pipeline、无 RAG/agent/tool execution 结构。
- Exclusions / limits: 项目不是 LLM agent/RAG 系统；未做 prompt injection 维度。

AI/LLM 安全面主要不适用：当前核心模型面是 TTS speech generation，不是会执行工具或检索私有文档的 LLM agent。应保留 TTS 内容过滤、配额、timeout、审核和成本监控。

## 22. Fallback / Defensive Code Analysis

- Coverage: Medium
- Inspected evidence: TTS audio postprocess fallback、Rust fallback docs、startup continue-on-warning、config fail-fast。
- Exclusions / limits: 未运行失败场景。

TTS/Rust fallback 基本有显式日志和配置。应避免的模式集中在 LogShare `console.log`、测试 `forceExit` 和 sidecar token 空默认，这些会让失败晚暴露或误导。

## 23. Testing Authenticity Analysis

- Coverage: Medium
- Inspected evidence: Jest setup、authRoutes mocked test、auditLog/Mongoose mocks、Rust contract tests。
- Exclusions / limits: 未做 mutation testing 或覆盖率真实性分析。

| Test Area | Real Confidence | Risk | Action |
|-----------|-----------------|------|--------|
| Rust contract tests | Medium-High | 能覆盖 worker 输入边界 | Keep and expand |
| Auth route noop-mock test | Low | 不验证真实 auth/controller wiring | Keep helper test but add integration |
| Global Jest setup mocks | Medium risk | 真实 DB/rate limiter/lifecycle 问题逃逸 | Split unit and integration setup |
| Jest forceExit runner | Low confidence for cleanup | 资源泄漏被隐藏 | Remove gradually |

## 24. Type Safety Analysis

- Coverage: Medium
- Inspected evidence: `any` 搜索、storage provider、generation storage、frontend admin/profile。
- Exclusions / limits: 未运行 `tsc --noEmit`。

类型风险集中在外部/持久化/API 边界，详见 F12。建议将 `any` 预算机制纳入 CI，并优先处理用户、权限、Passkey、TTS generation DTO。

## 25. Frontend State Analysis

- Coverage: High
- Inspected evidence: `frontend/src/App.tsx`, `useAuth`, `EnvManager`, `UserManagement`, `UserProfile`, `LogShare`。
- Exclusions / limits: 未运行 React profiler。

前端核心问题是单组件承载过多 UI 状态、API 调用、权限逻辑和表单转换。`useAuth` 同时管理 axios、localStorage、多账号、导航和登录注册状态，也是安全与状态耦合热点。

## 26. Backend API Analysis

- Coverage: Medium
- Inspected evidence: route registry、TTS routes、ticket routes、route limiters、health routes。
- Exclusions / limits: 未逐 API 手工调用。

API 结构整体有中间件治理和路由元数据。TTS endpoints 有 route-specific limiter、API key auth 和 admin limiter；ticket routes 是明确缺口。route governance 双写不一致需要修复。

## 27. Dependency Weight Analysis

- Coverage: Medium-High
- Inspected evidence: root/frontend package manifests、Vite config、Dockerfile。
- Exclusions / limits: 未跑 bundle analyzer 或 dependency graph size。

前端依赖混入 server/build 包是主要问题。根 package 还有 `"synapse": "file:"` 自引用，建议人工确认是否必要，避免 workspace/package manager 行为混乱。

## 28. Code Consistency Analysis

- Coverage: Medium
- Inspected evidence: config/env access、logger/console、route metadata、test patterns。
- Exclusions / limits: 未运行 linter。

一致性问题集中在三处：统一 logger vs 直接 `console.log`；Zod config vs 分散 `process.env`；route governance metadata vs router 实际 middleware。建议用 lint/rule 而不是人工 review 维持一致。

## 29. Comment Coverage Analysis

- Coverage: Low-Medium
- Inspected evidence: Rust/Node deployment docs、TTS/Rust 注释、SmartHumanCheck 注释抽样。
- Exclusions / limits: 未做全量注释审查。

文档覆盖优于常见项目；问题不在缺少注释，而在某些文档/配置行为不一致。后续应给危险配置和安全边界添加“为什么这样做”的短注释，并清理长期 TODO 文档。

---

## 30. Principles Compliance

总体原则遵守情况中等。TTS/Rust 子系统相对遵守 fail-fast、边界收口和资源上限；前端管理区、签名配置和测试基础设施违反更明显。

### Principles Violated

| Principle | Violations | Severity | Affected Areas |
|-----------|------------|----------|----------------|
| Configuration over hardcoding 9.1 | 1 | Critical | signing/replay secrets |
| Fail on missing configuration 9.2 | 2 | Critical/Medium | signing secret, Compose token |
| Single Responsibility 1.1 | 1 systemic | Medium | EnvManager, UserManagement, adminController |
| File Size Limit 1.2 | 10+ | Medium | frontend/backend hotspots |
| Boundary Contracts 7 | 2 | Medium | route governance, `any` DTOs |
| Test Behavior Not Implementation 8.1 | 1 systemic | Medium | mock-heavy route tests |
| Least Privilege 4.6 | 1 | High | CI PAT writeback |

### Principles Respected

TTS provider 有显式 timeout、bounded retry 和 circuit breaker；Rust worker 在 config 和 payload validation 上 fail-fast；审计日志服务有敏感字段脱敏；生产配置对 `JWT_SECRET`/`ADMIN_PASSWORD` 有启动期校验；路由治理框架本身是有价值的控制面。

---

## 31. Recommended Fix Order

### Fix Immediately

1. 移除前端/后端共享签名 secret 默认值，轮换相关 secret。
2. 删除前端完整 Bearer token 日志，并审查 console 输出敏感信息。
3. 删除 LogShare `contentPreview` 日志，替换弱加密为 AEAD。
4. Pin GitHub Actions refs，取消 PAT 直接写回主分支。

### Fix Before Stable Release

1. Vercel/Docker/CI 改为 frozen lockfile 和固定 Node/tool 版本。
2. Compose sidecar token 改为必填 fail-fast。
3. 为 ticket routes 增加 read/write/admin 限流。
4. 修复 route governance metadata 与实际 router 不一致。
5. 建立不带 `forceExit` 的关键集成测试 job。

### Schedule Later

1. 拆分 EnvManager/UserManagement/UserProfile/adminController。
2. 清理 frontend server-only dependencies。
3. 收紧 `any` 类型边界和 DTO/schema。
4. 增加 accessibility/browser smoke tests。

### Ignore for Now

没有建议忽略的已确认风险；低适用性的 AI Safety 不需要单独工程投入，保持 TTS 配额/审核/内容过滤即可。

## 32. Quick Wins

| Win | Effort | Value |
|-----|--------|-------|
| 删除 `useAuth` token console logs | 30-60 分钟 | 立即减少凭证泄漏 |
| 删除 LogShare `contentPreview` | 15-30 分钟 | 立即减少日志隐私风险 |
| Compose token 使用 `${VAR:?message}` | 15 分钟 | sidecar misconfig 早失败 |
| Vercel 改 `--frozen-lockfile` | 15 分钟 | 提升部署复现性 |
| Pin `actions/checkout`/`setup-node` 到稳定版本 | 30-60 分钟 | 降低 CI 供应链风险 |
| 给 ticket router 加 `ticketLimiter` | 1-2 小时 | 关闭可滥用写入面 |
| route registry 更新 rateLimitPolicy | 2-4 小时 | 治理报告恢复可信 |
| 添加静态检查禁止输出 token | 1-2 小时 | 防止回归 |

## 33. Long-term Refactor Plan

1. Admin/config 前端模块化：先抽 API hooks 和 form schemas，再拆配置域组件。风险是 UI 回归；测试策略是每个域的 load/save/delete smoke test。
2. 认证/session 重构：从 `localStorage` 全局 token 和 console 调试迁移到短期 token、HttpOnly cookie 或严格脱敏的 session store。风险是登录/2FA/passkey 流程回归；测试策略是 auth integration + browser flow。
3. Route governance 单一事实源：用 declarative route builder 或自动 introspection 替代 registry/router 双写。风险是迁移期间文档缺失；测试策略是 governance snapshot 和 route smoke。
4. Test infrastructure 分层：去掉全局 mock 对集成测试的影响，逐步移除 `forceExit`。风险是短期暴露历史泄漏导致 CI 变红；测试策略是先开 non-blocking job，再转 required。
5. Dependency hygiene：拆分 frontend runtime deps、tooling deps 和 backend deps。风险是构建脚本需要同步调整；测试策略是 Vite build workflow 和 Docker build workflow 验证。
