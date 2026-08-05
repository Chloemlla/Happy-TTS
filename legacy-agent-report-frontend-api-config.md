# Frontend API & Config & Tests & Build Scan Report

Date: 2026-08-05
Scope: frontend/src/api/, frontend/src/config/, frontend/src/tests/, frontend/src/utils/, frontend/package.json, frontend/vite.config.ts, frontend/tailwind.config.js, frontend/tsconfig.json, package.json (root), jest.config.js, src/tests/

---

## Severity Count

| Severity | Count | Confirmed | Suspected |
|----------|-------|-----------|-----------|
| Critical | 0 | 0 | 0 |
| High | 3 | 3 | 0 |
| Medium | 12 | 12 | 0 |
| Low | 9 | 9 | 0 |
| Info | 4 | 4 | 0 |
| **Total** | **28** | **28** | **0** |

---

## Findings List

F-001 | High | Confirmed | 混合 API 模式：turnstile.ts/fbi.ts/lottery.ts 使用原始 fetch 绕过 axios 拦截器 | frontend/src/api/turnstile.ts:234, fbi.ts:55, lottery.ts:30 | 拦截器链完全失效，重试/指纹/IP验证头缺失
F-002 | High | Confirmed | 前端组件测试覆盖率极低：100+ 组件中仅 1 个测试文件 | frontend/src/components/user-profile/DeviceSessionsPanel.test.tsx | 无回归保护
F-003 | Medium | Confirmed | 测试覆盖率阈值过低：语句 8%，函数 7%，分支 5%，行 8% | jest.config.js:66-71 | 92% 代码无测试
F-004 | High | Confirmed | 双重混淆：Vite 转换插件 + closeBundle 均对 JS 混淆 | frontend/vite.config.ts:299-341, 523-533 | 构建时间翻倍
F-005 | Medium | Confirmed | 多个 API 文件缺少响应类型定义，返回 any | frontend/src/api/cdks.ts:73, resources.ts:36, imageData.ts:28-29 | 类型安全缺失
F-006 | Medium | Confirmed | localStorage 中读取 userRole 用于认证决策 | frontend/src/api/lottery.ts:81 | 可篡改绕过 cfToken
F-007 | Medium | Confirmed | 生产代码中包含调试 console.log | frontend/src/api/lottery.ts:27, api.ts:188-231 | 配置变更可能泄露信息
F-008 | Low | Confirmed | 缺少 AbortController 支持，仅 deeplx.ts 支持 signal | 所有 API 文件 | 组件卸载后更新状态
F-009 | Medium | Confirmed | 重复的 Blob 下载逻辑 | frontend/src/api/auditLog.ts:92-102, cdks.ts:185-193 | 违反 DRY
F-010 | Low | Confirmed | cdks.ts 冗余调用 getApiBaseUrl() | frontend/src/api/cdks.ts:73-170 | axios 已配 baseURL
F-011 | Low | Confirmed | passkeyConfig.ts 中 ALLOWED_FRONTEND_DOMAINS 重复条目 | frontend/src/config/passkeyConfig.ts:40,42 | 重复域名
F-012 | Low | Confirmed | getPasskeyOrigin() 硬编码生产 origin | frontend/src/config/passkeyConfig.ts:60 | 无法本地调试
F-013 | Medium | Confirmed | 测试内联复制评分算法，非从生产模块导入 | frontend/src/tests/scoringAlgorithm.test.ts:33-117 | 算法变更测试不失败
F-014 | Low | Confirmed | 测试使用脆弱 CSS 类名选择器 | frontend/src/tests/VerificationMethodSelector.test.tsx:191 | CSS 重构即失败
F-015 | Medium | Confirmed | 测试硬编码 http://localhost:3000 | frontend/src/tests/LinuxDoAuthCallbackPage.test.tsx:58 | 环境变更需手动更新
F-016 | Info | Confirmed | 后端测试需要 MongoDB 实例 | src/tests/setup.ts:12 | CI 复杂度增加
F-017 | Low | Confirmed | 后端测试 setup.ts 明文存储密码 | src/tests/setup.ts:48-63 | 反模式
F-018 | Medium | Confirmed | 前端包含未使用的 @types/jest 和 jest-environment-jsdom | frontend/package.json:102,114 | 项目用 vitest
F-019 | Medium | Confirmed | 根 package.json 包含前端专用依赖 | package.json:82-83 | 后端安装时下载无用包
F-020 | Low | Confirmed | Tailwind CSS v4 用 JS 配置格式 | frontend/tailwind.config.js | v4 用 CSS 原生配置
F-021 | Low | Confirmed | esbuild keepNames:true 与 minifyIdentifiers:true 冲突 | frontend/vite.config.ts:404,406 | 行为不确定
F-022 | Info | Confirmed | 前端运行时依赖 62 个，含 chart.js/mermaid/jspdf | frontend/package.json:34-92 | 影响初始加载
F-023 | Medium | Confirmed | 开发模式 Vite 代理配置被注释 | frontend/vite.config.ts:349-377 | 跨域 API 请求
F-024 | Medium | Confirmed | 后端 testConfig 端口 3001 与前端冲突 | src/tests/setup.ts:79 | 端口冲突风险
F-025 | Medium | Confirmed | 前端无 API 服务直接测试 | 所有 API 文件 | 拦截器逻辑无测试
F-026 | Low | Confirmed | src/test/ 目录为空 | src/test/ | 遗留目录
F-027 | Low | Confirmed | 前端测试分布在 3 个目录，无统一命名 | 整个 frontend 目录 | 不一致
F-028 | Info | Confirmed | 前端仅 8 个测试文件，104K 行项目约 400 行测试 | 整个 frontend 目录 | 严重不足

---

## Scoring

### Testing: 2/10

| Dimension | Score | Evidence |
|-----------|-------|----------|
| 前端组件测试覆盖率 | 1 | 100+ 组件中仅 1 个组件测试文件 |
| 前端 API 测试 | 0 | 无 API 服务直接测试 |
| 前端测试总数 | 1 | 8 个测试文件，约 400 行（104K 行项目中） |
| 后端测试覆盖率 | 4 | 110 个测试文件，14.6K 行，但覆盖率阈值仅 8% |
| 后端测试质量 | 6 | 测试策略良好（隔离、mock、性能测试），但覆盖率低 |
| 测试一致性 | 3 | 前端测试分布在 3 个不同目录，命名约定不一致 |
| 测试隔离 | 5 | 后端测试需要 MongoDB 实例 |

### Release: 5/10

| Dimension | Score | Evidence |
|-----------|-------|----------|
| 构建配置完整性 | 7 | 精细的 Vite 配置，手动分块，terser 压缩，sitemap 生成 |
| 构建问题 | 4 | 双重混淆，esbuild 配置冲突，未使用依赖 |
| 依赖管理 | 4 | 62 个运行时依赖，前端包出现在根 package.json |
| 代码质量 | 6 | 类型定义良好，但混合 fetch/axios、重复代码、类型安全缺失 |
| 安全性 | 7 | HttpOnly Cookie 认证模式好，但 localStorage 存储角色，API 调用模式不一致 |
| 监控与可观测性 | 5 | 生产构建删除所有 console 输出，无结构化日志 |

---

## Detailed Analysis (Medium+)

### F-001 [High] 混合 API 模式：三个文件使用原始 fetch

**Files**: `frontend/src/api/turnstile.ts:234`, `frontend/src/api/fbi.ts:55`, `frontend/src/api/lottery.ts:30`

Three API modules use raw `fetch()` instead of the shared `api` (axios) instance. This means:
- Request interceptor (IP verification header injection) is not executed
- Response interceptor (fingerprint reporting, retry logic, 401/403 handling) is not executed
- Credential cookie (`withCredentials`) is not automatically attached
- `canonicalizeBackendApiUrl` rewriting logic is not applied

`fbi.ts` uses `credentials: 'omit'` for public methods (acceptable) but `credentials: 'include'` for admin methods via raw fetch, bypassing the interceptor.

**Recommendation**: Refactor these three modules to use the shared `api` instance, or create a generic fetch wrapper that includes the same interceptor logic.

---

### F-002 [High] Frontend Component Test Coverage Critically Low

**File**: `frontend/src/components/user-profile/DeviceSessionsPanel.test.tsx` (only component test file)

Out of 100+ components, only 1 component test file was found. 104K lines of TypeScript with approximately 400 lines of test code (0.4% test-to-code ratio).

**Recommendation**: Prioritize adding tests for critical components (auth forms, admin panels, TTS controls).

---

### F-003 [Medium] Test Coverage Threshold Too Low

**File**: `jest.config.js:66-71`
```javascript
coverageThreshold: {
  global: { statements: 8, functions: 7, branches: 5, lines: 8 }
}
```

Over 92% of backend code has no test coverage. Thresholds are not enforced in CI (opt-in via --coverage).

**Recommendation**: Gradually raise thresholds to 30-40% and enforce `--coverage` in CI.

---

### F-004 [High] Double Obfuscation

**Files**: `frontend/vite.config.ts:299-341` (Vite transform plugin), `frontend/vite.config.ts:523-533` (closeBundle hook calling `obfuscateDistJs()`)

During production builds, JS files are obfuscated twice:
1. By the JavaScriptObfuscator transform plugin during the build process (lines 299-341)
2. By `obfuscateDistJs()` in the closeBundle hook after the build (lines 523-533)

`obfuscateDistJs()` reads `dist/assets/*.js` files and obfuscates them all again, including ones already processed.

**Recommendation**: Remove one of the two obfuscation mechanisms.

---

### F-005 [Medium] Missing Response Type Definitions

**Files**: `cdks.ts:73`, `resources.ts:36`, `imageData.ts:28-29`, `markdownArticles.ts:30`

These methods return `any`, breaking TypeScript type safety. API response format changes won't trigger compile errors.

**Recommendation**: Define interfaces for all API responses and use generics `api.get<T>()`.

---

### F-006 [Medium] Reading Role from localStorage for Auth Decisions

**File**: `frontend/src/api/lottery.ts:81`
```typescript
const userRole = localStorage.getItem('userRole');
const isAdmin = userRole === 'admin' || userRole === 'administrator';
if (!isAdmin && cfToken) { body.cfToken = cfToken; ... }
```

Users can modify `userRole` in localStorage to bypass cfToken verification. Although the backend still validates the role, the frontend's cfToken collection logic is bypassed.

**Recommendation**: Read role from secure state management (zustand/React Context) populated from auth API response.

---

### F-007 [Medium] Debug console.log in Production Code

**Files**: `lottery.ts:27`, `api.ts:188-231`

`lottery.ts` logs `console.log('[lottery-api] fetch', url, options)` for every API call. Relies on Terser's `drop_console: true` to remove in build. If the config changes, API call details would leak.

**Recommendation**: Use `console.debug` or remove entirely.

---

### F-009 [Medium] Duplicate Blob Download Logic

**Files**: `auditLog.ts:92-102`, `cdks.ts:185-193`

`auditLog.ts` wraps it as a `downloadBlob` function, `cdks.ts` inlines the identical code.

**Recommendation**: Extract to shared utility `frontend/src/utils/download.ts`.

---

### F-013 [Medium] Test Inlines Copied Algorithm

**File**: `frontend/src/tests/scoringAlgorithm.test.ts:33-117`

`calculateBehaviorScore` is fully copied into the test file instead of being imported from the production module. Production code changes won't cause test failures.

**Recommendation**: Export the function and import it in the test.

---

### F-015 [Medium] Test Hardcodes API Base URL

**File**: `frontend/src/tests/LinuxDoAuthCallbackPage.test.tsx:58`

Test expects fetch to `"http://localhost:3000/api/auth/linuxdo/exchange"`, hardcoded instead of reading from `getApiBaseUrl()`.

**Recommendation**: Mock `getApiBaseUrl()` or read from shared config.

---

### F-018 [Medium] Unused Dev Dependencies

**File**: `frontend/package.json:102,114`

`@types/jest` and `jest-environment-jsdom` listed as devDependencies, but project uses vitest. These packages are never used but downloaded on every `pnpm install`.

**Recommendation**: Remove both packages.

---

### F-019 [Medium] Root package.json Contains Frontend-Only Dependencies

**File**: `package.json:82-83`

`@simplewebauthn/browser` and `@fingerprintjs/fingerprintjs` are browser-side packages listed in the root dependencies. Backend builds download these frontend packages.

**Recommendation**: Move to `frontend/package.json`.

---

### F-023 [Medium] Vite Proxy Configuration Commented Out in Dev Mode

**File**: `frontend/vite.config.ts:349-377`

All Vite proxy rules (`/api`, `/static`, `/collect_data`) are commented out. In development, the frontend calls the backend directly on port 3000, making all requests cross-origin.

**Recommendation**: Restore proxy configuration or confirm backend CORS handling is robust enough.

---

### F-024 [Medium] Backend Test Port 3001 Conflicts with Frontend

**File**: `src/tests/setup.ts:79`

`testConfig.port: 3001` is the same as the frontend dev server's default port.

**Recommendation**: Remove or change to `0` (OS-assigned).

---

### F-025 [Medium] No Direct Tests for Frontend API Services

**Files**: All `frontend/src/api/*.ts`

No API module has direct tests. Interceptor logic (retry, fingerprint detection, IP verification headers) is untested.

**Recommendation**: Add unit tests for each API module with mocked HTTP layer. Centrally test interceptor behavior.

---

## Summary

1. **Highest Priority**: Mixed API patterns (F-001) and double obfuscation (F-004). Three API modules use raw fetch bypassing axios interceptors; production JS gets obfuscated twice.

2. **Testing is critically lacking**: Frontend test coverage near zero (F-002, F-025, F-028). Backend has decent test count but 8% coverage threshold (F-003). `scoringAlgorithm.test.ts` tests inline copy not real code (F-013).

3. **Dependency issues**: Frontend-only packages in root package.json (F-019), unused jest packages (F-018), 62 runtime dependencies (F-022).

4. **Build configuration issues**: Double obfuscation (F-004), conflicting esbuild config (F-021), commented-out proxy (F-023), Tailwind CSS v4 with JS config format (F-020).

5. **Security issues**: localStorage role storage (F-006) and debug logging (F-007) pose medium risk.