# Synapse Frontend Code Audit Report

## 严重度计数

| Severity | Count | Confirmed | Suspected |
|----------|-------|-----------|-----------|
| High | 14 | 13 | 1 |
| Medium | 33 | 30 | 3 |
| Low | 30 | 28 | 2 |
| Info | 2 | 2 | 0 |
| **Total** | **79** | **73** | **6** |

## 评分

### Maintainability: 2/10

**Negative evidence**:
- 8 components each exceed 1,500 lines (EnvManager 2956, UserProfile 1897, CDKStoreManager 1987, LibreChatPage 1856, LogShare 1800, CommandManager 1612, EmailSender 1609, CaseConverter 1568)
- 3 more exceed 900 lines (AuthForm 976, TTSForm 961, App.tsx main render 1086)
- 730-line sidebar.tsx with 31 exported components in one file
- 568-line navConfig.ts with 34 icon imports and 37-entry ADMIN_TAB_TO_PATH
- 650-line anti-scraping system mixed with React bootstrap in main.tsx
- Pervasive `any` types across 30+ files defeat TypeScript benefits
- ~400 lines of duplicated modal code in CDKStoreManager
- 100+ console.log statements in production code
- 10+ components with empty catch blocks silently swallowing errors
- No i18n framework -- every string hardcoded in Chinese
- 4 duplicate implementations of tooltip position logic in CaseConverter
- Dead code: commented-out functions, unused refs, unused state variables, no-op debug functions

**Positive evidence** (prevents from being 1/10):
- Route-based code splitting is implemented
- shadcn/ui component library is well-structured
- `cn()` utility is available and used in most UI components

### Design: 3/10

**Negative evidence**:
- God components with 30-40 state variables and 20+ handlers mixing multiple concerns
- App.tsx: route definition, auth logic, UI state, theme, and layout all in one ~1086-line render function
- AuthForm handles 6+ distinct concerns (login, register, TOTP, Passkey, email verification, Turnstile)
- EnvManager passes 15+ individual props to 20+ section children via prop drilling
- Zero ErrorBoundary usage anywhere in the application
- Zustand stores with side effects in synchronous initializers (authProviderStore)
- 165-line inline CSS string in EnvManager injected via `<style>` tag
- Inline styles mixed with Tailwind inconsistently across all large components
- Hooks naming convention violated: useAntiCounterfeit exports plain functions with `use` prefix
- No centralized API layer: mix of `getApiBaseUrl()`, raw `fetch()`, `axios.get()`, and hardcoded paths
- Global `document.body.style.overflow` side effect in CaseConverter
- Inconsistent i18n approach (CaseConverter has pseudo-i18n, others have nothing)
- `setInterval` without cleanup on unmount, SSE auto-reconnect without backoff
- `window.location.reload()` destroys SPA state on login

**Positive evidence** (prevents from being 1/10):
- Tailwind CSS is used consistently for most styling
- Framer Motion animations are well-integrated
- TypeScript is used (despite `any` overuse)
- Some components have proper loading/error states
- No `dangerouslySetInnerHTML` in UI library components
- DOMPurify is used where `dangerouslySetInnerHTML` is necessary
- Route-based code splitting is implemented

## 发现项列表

### High

```
F-001 | High | Confirmed | EnvManager.tsx is 2956 lines -- extreme component size | frontend/src/components/EnvManager.tsx:1
F-002 | High | Confirmed | CDKStoreManager.tsx is 1987 lines -- extreme component size | frontend/src/components/CDKStoreManager.tsx:1
F-003 | High | Confirmed | UserProfile.tsx is 1897 lines -- extreme component size | frontend/src/components/UserProfile.tsx:1
F-004 | High | Confirmed | LibreChatPage.tsx is 1856 lines -- extreme component size | frontend/src/components/LibreChatPage.tsx:1
F-005 | High | Confirmed | LogShare.tsx is 1800 lines -- extreme component size | frontend/src/components/LogShare.tsx:1
F-006 | High | Confirmed | CommandManager.tsx is 1612 lines -- extreme component size | frontend/src/components/CommandManager.tsx:1
F-007 | High | Confirmed | EmailSender.tsx is 1609 lines -- extreme component size | frontend/src/components/EmailSender.tsx:1
F-008 | High | Confirmed | CaseConverter.tsx is 1568 lines -- extreme component size | frontend/src/components/CaseConverter.tsx:1
F-009 | High | Confirmed | AuthForm.tsx is 976 lines -- excessive component size | frontend/src/components/AuthForm.tsx:1
F-010 | High | Confirmed | TTSForm.tsx is 961 lines -- excessive component size | frontend/src/components/TTSForm.tsx:1
F-011 | High | Confirmed | App.tsx main render component is ~1086 lines -- god component mixing routes, auth, UI state, theme, layout | frontend/src/App.tsx:547-1633
F-012 | High | Confirmed | No i18n framework -- all 100+ components hardcode Chinese UI strings | ALL files
F-013 | High | Confirmed | useTwoFactorStatus hardcodes /api/totp/status without getApiBaseUrl() -- breaks in cross-origin deployments | frontend/src/hooks/useTwoFactorStatus.ts:13
F-014 | High | Confirmed | useAuth.getUserById ignores its userId parameter, always fetches current user | frontend/src/hooks/useAuth.ts:120-127
F-015 | High | Confirmed | useFingerprintRequest.isUserLoggedIn always returns true -- auth gating disabled | frontend/src/hooks/useFingerprintRequest.ts:24-26
F-016 | High | Suspected | useHCaptchaConfig calls Turnstile endpoints, not hCaptcha -- copy-paste bug | frontend/src/hooks/useHCaptchaConfig.ts:28-29
F-017 | High | Confirmed | window.location.reload() on every successful login destroys SPA state | frontend/src/components/AuthForm.tsx:336,468
F-018 | High | Confirmed | window.location.reload() as fallback in completeLogin destroys SPA state | frontend/src/components/LoginPage.tsx:178
F-019 | High | Confirmed | AdminLogin calls navigate() during render phase -- React anti-pattern | frontend/src/components/AdminLogin.tsx:13-16
F-020 | High | Confirmed | No ErrorBoundary wrapping root App in main.tsx -- any render crash = blank page | frontend/src/main.tsx:687-691
F-021 | High | Confirmed | No ErrorBoundary wrapping any lazy-loaded route in App.tsx | frontend/src/App.tsx:374-419
F-022 | High | Confirmed | 730-line sidebar.tsx with 31 exported components in one file | frontend/src/components/ui/sidebar.tsx:1
F-023 | High | Confirmed | 568-line navConfig.ts with 34 icon imports and 37-entry ADMIN_TAB_TO_PATH | frontend/src/navigation/navConfig.ts:1
F-024 | High | Confirmed | useAuth writes side effects (ref.current) during render phase | frontend/src/hooks/useAuth.ts:86-87
```

### Medium

```
F-025 | Medium | Confirmed | authStore persists user object potentially including totpSecret/backupCodes to localStorage | frontend/src/stores/authStore.ts:128
F-026 | Medium | Confirmed | authProviderStore fires fetch side effect in synchronous store creator | frontend/src/stores/authProviderStore.ts:72
F-027 | Medium | Confirmed | Empty catch blocks silently swallow errors in App.tsx | frontend/src/App.tsx:28,433
F-028 | Medium | Confirmed | Empty catch block silently swallows errors in TTSForm.tsx | frontend/src/components/TTSForm.tsx:387
F-029 | Medium | Confirmed | Empty catch block silently swallows errors in AdminDashboard.tsx | frontend/src/components/AdminDashboard.tsx:58
F-030 | Medium | Confirmed | Empty catch block silently swallows clipboard errors in CredentialIdModal.tsx | frontend/src/components/ui/CredentialIdModal.tsx:12
F-031 | Medium | Confirmed | any types used extensively -- AuthForm: pendingVerificationData:any, requestBody:any, catch(err:any) | frontend/src/components/AuthForm.tsx:33,66,71,352,384,476
F-032 | Medium | Confirmed | any types used extensively -- CDKStoreManager: 24+ catch(error:any) sites | frontend/src/components/CDKStoreManager.tsx:68,279,280,297,313,355,393,509,510,887,888,933,934,981,982,1003,1004,1023,1024,1043,1044
F-033 | Medium | Confirmed | any types used -- LoginPage: pendingVerificationData:any, catch(err:any), catch(e:any) | frontend/src/components/LoginPage.tsx:125,235,259
F-034 | Medium | Confirmed | any types used -- CommandManager: resolveCommandPayload(data:any), maybeDecryptCommandResponse(data:any), analyzeMemoryUsage(memoryUsage:any) | frontend/src/components/CommandManager.tsx:35,36,42,43,451
F-035 | Medium | Confirmed | any types used -- LogShare: catch(e:any) across 13+ sites | frontend/src/components/LogShare.tsx:279,297,313,323,355,373,401,543,603,622,657,671,685
F-036 | Medium | Confirmed | any types used -- EmailSender: catch(error:any) across 10+ sites | frontend/src/components/EmailSender.tsx:297,452,480,489,522,527,552,557,573,578
F-037 | Medium | Confirmed | any types used -- usePasskey, useAuth, useAntiCounterfeit, useTts, useWebSocket | frontend/src/hooks/usePasskey.ts:6,8,40,43,68,91,93,129, frontend/src/hooks/useAuth.ts:124,175,259,333, frontend/src/hooks/useAntiCounterfeit.ts:269, frontend/src/hooks/useTts.ts:269, frontend/src/hooks/useWebSocket.ts:122
F-038 | Medium | Confirmed | console.log debugging in production -- AuthForm lines 92-99,103-110 | frontend/src/components/AuthForm.tsx:92-99,103-110
F-039 | Medium | Confirmed | console.log in production -- CDKStoreManager lines 224,245-249,317-318,325-326,704,726 | frontend/src/components/CDKStoreManager.tsx:224,245-249,317-318,325-326,704,726
F-040 | Medium | Confirmed | console.log with emoji in production -- CommandManager lines 366,370 | frontend/src/components/CommandManager.tsx:366,370
F-041 | Medium | Confirmed | console.log in production -- LogShare lines 461,574,646 | frontend/src/components/LogShare.tsx:461,574,646
F-042 | Medium | Confirmed | console.log in production -- EmailSender lines 223,238,250,267,284,331,332 | frontend/src/components/EmailSender.tsx:223,238,250,267,284,331,332
F-043 | Medium | Confirmed | console.log/console.error in production hooks -- useAntiCounterfeit, useSecureCaptchaSelection, usePasskey, useAuth, useLottery, useFingerprintRequest, useHCaptchaConfig, useTts | frontend/src/hooks/ (multiple files)
F-044 | Medium | Confirmed | 165-line inline CSS template literal injected via <style> tags in EnvManager | frontend/src/components/EnvManager.tsx:95-260
F-045 | Medium | Confirmed | sidebar.tsx: useState with Math.random() for skeleton width -- hydration mismatch risk in SSR | frontend/src/components/ui/sidebar.tsx:615-617
F-046 | Medium | Confirmed | CredentialIdModal missing role="dialog" and aria-modal | frontend/src/components/ui/CredentialIdModal.tsx:17
F-047 | Medium | Confirmed | TTSForm fish modal missing Escape key handler for keyboard dismissal | frontend/src/components/TTSForm.tsx:886
F-048 | Medium | Confirmed | SidebarGroupAction icon-only button has no accessible label | frontend/src/components/ui/sidebar.tsx:422-444
F-049 | Medium | Confirmed | AudioPreview play/pause button missing aria-label | frontend/src/components/AudioPreview.tsx:145-159
F-050 | Medium | Confirmed | AudioPreview range input missing aria-label | frontend/src/components/AudioPreview.tsx:163-174
F-051 | Medium | Confirmed | Notification container missing role="alert" or aria-live region | frontend/src/components/Notification.tsx:254
F-052 | Medium | Confirmed | AdminLogin has no CAPTCHA/Turnstile -- weaker security than regular login | frontend/src/components/AdminLogin.tsx:1-95
F-053 | Medium | Confirmed | AdminLogin error message "password wrong" enables user enumeration | frontend/src/components/AdminLogin.tsx:33
F-054 | Medium | Confirmed | LibreChatPage SSE onerror auto-reconnects with no backoff or max-retry limit | frontend/src/components/LibreChatPage.tsx:1261-1269
F-055 | Medium | Confirmed | LibreChatPage setInterval interval ID lost in local variable -- no cleanup on unmount | frontend/src/components/LibreChatPage.tsx:812-870
F-056 | Medium | Confirmed | dangerouslySetInnerHTML in EmailSender with DOMPurify -- XSS bypass risk | frontend/src/components/EmailSender.tsx:1177-1179,1558-1560
F-057 | Medium | Confirmed | dangerouslySetInnerHTML in CaseConverter with DOMPurify -- XSS bypass risk | frontend/src/components/CaseConverter.tsx:537,1477,1490,1503
F-058 | Medium | Confirmed | CaseConverter overrides Ctrl+A and Ctrl+F browser defaults | frontend/src/components/CaseConverter.tsx:1117-1130
F-059 | Medium | Confirmed | LogShare uses blocking window.confirm() for destructive actions | frontend/src/components/LogShare.tsx:273,290,307,363,693
F-060 | Medium | Confirmed | ~400 lines duplicated modal backdrop/motion code across CDKStoreManager | frontend/src/components/CDKStoreManager.tsx:80-92,280-292,545-557,1828-1985
F-061 | Medium | Confirmed | useSecureCaptchaSelection has loading in both useEffect and useCallback deps -- re-trigger loop risk | frontend/src/hooks/useSecureCaptchaSelection.ts:102,134
F-062 | Medium | Confirmed | useAntiCounterfeit exports useErrorMessage and useHasCachedResult as hooks but they are plain functions | frontend/src/hooks/useAntiCounterfeit.ts:345-355
F-063 | Medium | Confirmed | useTurnstileConfig has no-op debugTurnstileConfig function with dead calls | frontend/src/hooks/useTurnstileConfig.ts:26,41,65-68
F-064 | Medium | Confirmed | useLottery.fetchAllRounds uses raw fetch() while other methods use lotteryApi module | frontend/src/hooks/useLottery.ts:53
F-065 | Medium | Confirmed | crypto-js.d.ts is bare declare module -- crypto-js imports resolve to any | frontend/src/types/crypto-js.d.ts:1
F-066 | Medium | Confirmed | react-syntax-highlighter.d.ts declares all exports as any | frontend/src/types/react-syntax-highlighter.d.ts:3,9,14,19,24,29,34,39,44
F-067 | Medium | Confirmed | katex-fonts.css loading animation uses hardcoded light colors (#f0f0f0/#e0e0e0) -- broken in dark mode | frontend/src/styles/katex-fonts.css:86-87
F-068 | Medium | Confirmed | TOTPErrorResponse type exposes expectedToken/prevToken/nextToken debug fields | frontend/src/types/auth.ts:39-44
F-069 | Medium | Confirmed | UserProfile defines Avatar component inside useMemo -- remounts on every dep change | frontend/src/components/UserProfile.tsx:562-599
F-070 | Medium | Confirmed | CaseConverter tooltip position calculation duplicated 4 times (~150 lines) | frontend/src/components/CaseConverter.tsx:902-1092
F-071 | Medium | Confirmed | CaseConverter document.body.style.overflow side effect conflicts with other components | frontend/src/components/CaseConverter.tsx:209,218
F-072 | Medium | Confirmed | UserProfile repeats inline style={fontFamily} 10+ times | frontend/src/components/UserProfile.tsx:1183,1186,1199,1202,1225,1228,1256,1276,1642,1763
F-073 | Medium | Confirmed | main.tsx mixes 650-line client integrity check system with React bootstrap | frontend/src/main.tsx:1-686
F-074 | Medium | Confirmed | Inline styles mixed with Tailwind classes across all large components | Multiple files
F-075 | Medium | Confirmed | TTSForm has 31 useState variables and 4 useRef -- excessive state in one component | frontend/src/components/TTSForm.tsx:78-108
F-076 | Medium | Confirmed | LibreChatPage has 30+ state variables with complex streaming logic and SSE management | frontend/src/components/LibreChatPage.tsx:245-306
F-077 | Medium | Confirmed | EnvManager passes 15+ individual props to 20+ section children via prop drilling | frontend/src/components/EnvManager.tsx:2577-2911
F-078 | Medium | Confirmed | Input.tsx uses React.FC arrow function and no cn() merging -- inconsistent with all sibling UI components | frontend/src/components/ui/Input.tsx:3
```

### Low

```
F-079 | Low | Confirmed | App.tsx: as any on CSS properties and meta elements | frontend/src/App.tsx:224,225,286,296,311,866,869
F-080 | Low | Confirmed | App.tsx: raw <style> tags injected in JSX | frontend/src/App.tsx:205,317
F-081 | Low | Confirmed | App.tsx: hardcoded Chinese strings in ErrorBoundary fallback | frontend/src/App.tsx:1656-1680
F-082 | Low | Confirmed | TTSForm: nested function stringArray defined inside normalizeFishCatalogItems | frontend/src/components/TTSForm.tsx:42
F-083 | Low | Confirmed | TTSForm: pagination tracked via both refs and useState -- dual truth of source | frontend/src/components/TTSForm.tsx:376,381
F-084 | Low | Confirmed | TtsPage: Audio object created on play not cleaned up on unmount | frontend/src/components/TtsPage.tsx:86-90,103-126
F-085 | Low | Confirmed | TtsPage: download uses fragile temp <a> element append/click/remove pattern | frontend/src/components/TtsPage.tsx:128-138
F-086 | Low | Confirmed | AuthForm: allowedDomains hardcoded list of 10 email domains | frontend/src/components/AuthForm.tsx:114-116
F-087 | Low | Confirmed | CDKStoreManager: ImportCDKModalProps interface defined twice identically | frontend/src/components/CDKStoreManager.tsx:12-16,198-202
F-088 | Low | Confirmed | CommandManager: analyzeMemoryUsage/analyzeCPUUsage called 10+ times per render without memoization | frontend/src/components/CommandManager.tsx:1262-1438
F-089 | Low | Confirmed | CommandManager: emoji used as status indicators (inconsistent cross-platform) | frontend/src/components/CommandManager.tsx:580-591
F-090 | Low | Suspected | AdminDashboard: no NaN guard on quotaPercent computation | frontend/src/components/AdminDashboard.tsx:72
F-091 | Low | Confirmed | LoginPage: useMemo overkill for simple ternary expressions | frontend/src/components/LoginPage.tsx:132-135
F-092 | Low | Confirmed | LoginPage: redirectUri validation could be open redirect if custom scheme check fails | frontend/src/components/LoginPage.tsx:143-160
F-093 | Low | Confirmed | usePasskey: debugInfo array grows unboundedly with no limit | frontend/src/hooks/usePasskey.ts:40,43-45
F-094 | Low | Confirmed | useWebSocket: empty onerror and connect catch blocks | frontend/src/hooks/useWebSocket.ts:104-109
F-095 | Low | Confirmed | useFirstVisitDetection: returns isIpBanned: false as constant -- dead interface field | frontend/src/hooks/useFirstVisitDetection.ts:158-160
F-096 | Low | Confirmed | useDomProtection: never assigns ref to any DOM element -- protection silently does nothing | frontend/src/hooks/useDomProtection.ts:5,20
F-097 | Low | Confirmed | usePasskey: dead code branches (registerErrorInfo, registerSuccessInfo, registerExceptionInfo never read) | frontend/src/hooks/usePasskey.ts:98-103,113-119,143-148
F-098 | Low | Confirmed | useAuth: duplicated throttling state (refs + state for same concern) | frontend/src/hooks/useAuth.ts:72-84
F-099 | Low | Confirmed | useFingerprintRequest: 30s polling interval + full localStorage iteration on dismiss | frontend/src/hooks/useFingerprintRequest.ts:103-110,198
F-100 | Low | Confirmed | Notification: unused refs updateIntervalRef and lastUpdateTimeRef | frontend/src/components/Notification.tsx:302-303
F-101 | Low | Confirmed | AudioPreview: isSeeking state assigned but never read | frontend/src/components/AudioPreview.tsx:89
F-102 | Low | Confirmed | AudioPreview: commented-out alert() call left in code | frontend/src/components/AudioPreview.tsx:56
F-103 | Low | Confirmed | CaseConverter: commented-out normalizeAiOutput function | frontend/src/components/CaseConverter.tsx:114-126
F-104 | Low | Confirmed | CaseConverter: DOMPurify.sanitize called on hardcoded strings (unnecessary overhead) | frontend/src/components/CaseConverter.tsx:537,1477,1490,1503
F-105 | Low | Confirmed | main.tsx: document.body.innerHTML read for string matching (expensive, false positive risk) | frontend/src/main.tsx:251,418
F-106 | Low | Confirmed | main.tsx: integrityChecker import result never read/compared | frontend/src/main.tsx:670-685
F-107 | Low | Confirmed | usePasskey: undocumented restriction to one authenticator per account | frontend/src/hooks/usePasskey.ts:60
F-108 | Low | Confirmed | TtsPage: inline style={{ fontFamily }} on 2 elements | frontend/src/components/TtsPage.tsx:204,223
F-109 | Low | Confirmed | AuthForm: ErrorBoundary class component renders hardcoded Chinese fallback | frontend/src/components/AuthForm.tsx:28-42
F-110 | Low | Confirmed | AuthForm: checkPasswordStrength captures username from closure -- stale closure risk | frontend/src/components/AuthForm.tsx:145-200
F-111 | Low | Suspected | AdminDashboard: style={{ width: quotaPercent }} inline style | frontend/src/components/AdminDashboard.tsx:129
F-112 | Low | Confirmed | EmailSender: useEffect on mount fetches 6 APIs with no Promise.allSettled or error isolation | frontend/src/components/EmailSender.tsx:310-317
F-113 | Low | Confirmed | CaseConverter: giant 300-line useMemo for localization data (hand-rolled i18n) | frontend/src/components/CaseConverter.tsx:224-524
F-114 | Low | Confirmed | LogShare: 3 separate createPortal calls with no portal manager or focus trapping | frontend/src/components/LogShare.tsx:776,1609,1721
F-115 | Low | Confirmed | LibreChatPage: useEffect missing history in dependency array | frontend/src/components/LibreChatPage.tsx:946-948
F-116 | Low | Confirmed | CDKStoreManager: console.log logs sensitive data (resource IDs, CDK parameters) | frontend/src/components/CDKStoreManager.tsx:224,245-249
F-117 | Low | Confirmed | EnvManager: unused startTransition import | frontend/src/components/EnvManager.tsx:1-3
F-118 | Low | Confirmed | CaseConverter: functionColors useMemo could be module-level constant | frontend/src/components/CaseConverter.tsx:131-175
F-119 | Low | Confirmed | EnvManager: any type for request body (const body: any = { baseUrl, apiKey }) | frontend/src/components/EnvManager.tsx:1594
F-120 | Low | Confirmed | EnvManager: inline style on motion elements (gradient, progress bar width) | frontend/src/components/EnvManager.tsx:219,733-734,2164-2165
F-121 | Low | Confirmed | CDKStoreManager: inline styles for virtual scrolling implementation | frontend/src/components/CDKStoreManager.tsx:1442,1445-1446,1575,1578-1579,1596
F-122 | Low | Confirmed | LibreChatPage: complex modal state objects with inline onConfirm callbacks recreated every render | frontend/src/components/LibreChatPage.tsx:306-308
F-123 | Low | Confirmed | LogShare: useEffect with setNotification in dependency array -- redundant clipboard writes | frontend/src/components/LogShare.tsx:465
```

### Info

```
F-124 | Info | Confirmed | lib/utils.ts is clean and well-structured (13 lines, single cn() export) | frontend/src/lib/utils.ts:1-13
F-125 | Info | Confirmed | No dangerouslySetInnerHTML in UI library components (positive finding) | frontend/src/components/ui/ (all files)
```

## 详细分析 (Medium+ 发现项)

### 1. 组件大小危机 (F-001 to F-011, F-022, F-023)

**影响**: 8个组件超过1500行，最大的是 EnvManager.tsx 2956行，包含约40个状态变量、25个 useCallback 处理函数、165行内联 CSS 字符串，以及通过 prop drilling 渲染的20+子组件。AuthForm.tsx 976行用30个 useState 处理6种不同功能（登录、注册、TOTP、Passkey、邮箱验证、Turnstile）。这些组件违反单一职责原则，无法有效测试和审查。730行 sidebar.tsx 包含31个导出组件，568行 navConfig.ts 包含34个图标导入和37个路径映射条目。

**建议**: 每个500行以上的组件至少拆分为3-5个子组件/自定义 hook。将 sidebar.tsx 拆分为每个主要组件一个文件。将 navConfig.ts 中的纯数据提取到单独的文件。

### 2. 缺少 i18n 框架 (F-012)

**影响**: 所有检查过的组件都将中文用户界面字符串硬编码。没有使用任何 i18n 库 (react-intl、i18next 等)。只有 CaseConverter.tsx 通过 useMemo 做了伪 i18n，但也不一致且仍有硬编码字符串。国际化需要对每个组件进行重写。

**建议**: 引入 i18next 或 react-intl，将所有字符串提取到翻译文件中。

### 3. 类型安全被破坏 (F-013 to F-016, F-031 to F-037)

**影响**:
- `useTwoFactorStatus` 硬编码 `/api/totp/status` 路径，没有使用 `getApiBaseUrl()` -- 在跨域部署时会失败
- `useAuth.getUserById` 忽略其 `userId` 参数，始终返回当前用户 -- 调用者会得到错误数据
- `useFingerprintRequest.isUserLoggedIn` 始终返回 `true` -- 认证门控被禁用
- `useHCaptchaConfig` 调用的是 Turnstile 端点，不是 hCaptcha -- 可能是复制粘贴错误
- `any` 类型在 30+ 文件的 catch 块和函数参数中广泛使用

**建议**: 修复4个错误钩子函数，替换所有 `any` 为具体类型，为 API 响应创建全面的接口定义。

### 4. 缺少错误边界 (F-020, F-021)

**影响**: `main.tsx` 中没有 ErrorBoundary 包裹 `<App />`，`App.tsx` 中也没有 ErrorBoundary 包裹任何懒加载路由。任何渲染错误都会导致空白页面 -- 零弹性。

**建议**: 在所有路由 Suspense 边界外包裹 ErrorBoundary，并在根组件添加全局 ErrorBoundary。

### 5. 生产环境调试日志 (F-038 to F-043)

**影响**: 15+ 个文件中留有 console.log/console.error 语句。AuthForm 在页面加载时记录内部状态。CDKStoreManager 记录敏感数据（资源 ID、CDK 参数）。CommandManager 使用带 emoji 的 console.log。

**建议**: 移除所有 console.log，或使用全局 DEBUG 标志控制，或使用专门的日志服务。

### 6. SPA 状态被破坏 (F-017, F-018)

**影响**: AuthForm.tsx 和 LoginPage.tsx 中每次成功登录都调用 `window.location.reload()`。这销毁了所有内存中状态，导致 UI 闪烁，否定 SPA 的优势。

**建议**: 使用 React Router 的 `navigate()` 或状态重置替代 `window.location.reload()`。

### 7. React 反模式 (F-019, F-024, F-061, F-069)

**影响**: 
- AdminLogin.tsx 在渲染阶段调用 `navigate()` -- 违反 React 规则，可能引起状态更新冲突
- useAuth.ts 在渲染期间写入 refs -- 违反 React 规则
- UserProfile.tsx 在 useMemo 中定义组件 -- 每次依赖变化都会导致组件重挂载，丢失内部状态
- useSecureCaptchaSelection 在 useEffect 和 useCallback 之间形成循环依赖风险（loading 在双方依赖数组中）

**建议**: 将 navigate 调用移到 useEffect 中，将组件定义移到外部，重构有问题的钩子以避免循环依赖。

### 8. 无障碍问题 (F-046 to F-051, F-059)

**影响**: 模态框缺少 `role="dialog"` 和 `aria-modal`。TTSForm 模态框缺少 Escape 键处理。纯图标按钮缺少 `aria-label`。通知容器缺少 `aria-live` 区域。AudioPreview 缺少 aria-label。使用 `window.confirm()` 阻塞主线程。

**建议**: 添加缺失的 ARIA 属性，实现模态框焦点陷阱和 Escape 键关闭，用自定义模态框替换 `window.confirm()`。

### 9. 安全问题 (F-025, F-052, F-053, F-056, F-057, F-068)

**影响**:
- authStore 将用户对象（包含 totpSecret/backupCodes）持久化到 localStorage
- AdminLogin 没有 CAPTCHA -- 管理员登录保护弱于普通登录
- AdminLogin 错误消息"密码错误"允许用户枚举
- dangerouslySetInnerHTML 与 DOMPurify 一起使用 -- 存在绕过风险
- TOTPErrorResponse 类型暴露了 expectedToken/prevToken/nextToken 调试字段

**建议**: 从持久化中排除敏感字段，为管理员登录添加 CAPTCHA，使用通用错误消息，定期审查 DOMPurify 配置。

### 10. 代码重复 (F-060, F-070, F-078)

**影响**: CDKStoreManager 有约400行重复的模态框背景/动画代码分布在5个模态框中。CaseConverter 4次重复工具提示位置逻辑（约150行）。Input.tsx 使用不同的组件模式（React.FC 箭头函数）且没有 cn() 类合并，与所有其他 UI 组件不一致。

**建议**: 提取可复用的 Modal 或 Dialog 组件，将工具提示位置逻辑提取到共享工具函数中，使 Input.tsx 与其他 UI 组件保持一致。

### 11. 存储和状态管理问题 (F-025, F-026, F-098)

**影响**: authStore 将整个用户对象（包括潜在的 totpSecret/backupCodes）持久化到 localStorage。authProviderStore 在同步的 store 初始化器中触发网络请求。useAuth 使用 refs 和 state 双重跟踪相同的节流逻辑，可能导致状态漂移。

**建议**: 在持久化前使用 partialize 排除敏感字段，将 store 初始化器中的副作用移到组件挂载时，统一使用单一的跟踪机制。

### 12. 不一致的 API 调用模式 (F-064, F-013)

**影响**: useLottery.fetchAllRounds 使用原始 fetch() 和硬编码路径，而同一钩子中的其他方法使用 lotteryApi 模块（可能包含拦截器、错误处理、基础 URL 规范化）。useTwoFactorStatus 硬编码 API 路径而不使用 getApiBaseUrl()。

**建议**: 统一所有 API 调用使用相同的 API 模块或工具函数。

### 13. 类型定义问题 (F-065, F-066, F-067, F-068)

**影响**: crypto-js.d.ts 是空的 `declare module 'crypto-js'` 声明，没有任何类型导出，导致所有 crypto-js 导入解析为 `any`。react-syntax-highlighter.d.ts 将所有导出声明为 `any`。katex-fonts.css 加载动画使用硬编码的浅色模式颜色，在深色模式下显示异常。TOTPErrorResponse 类型暴露了调试 TOTP 值。

**建议**: 使用包的官方类型定义（@types/ 或内置类型），使用 CSS 变量替代硬编码颜色，从类型定义中移除调试字段。

### 14. 内联样式与 CSS 问题 (F-044, F-072, F-073, F-074)

**影响**: EnvManager.tsx 包含165行内联 CSS 模板字符串通过 `<style>` 标签注入，绕过 CSS 构建管道。UserProfile 重复使用 `style={{ fontFamily }}` 10+ 次。main.tsx 将650行客户端完整性检查与 React 启动混合在一起。所有大组件都混合使用内联样式和 Tailwind 类。

**建议**: 使用 Tailwind 类或 CSS 模块替代内联样式，将 main.tsx 中的完整性检查提取到单独的文件中。

### 15. 组件状态管理问题 (F-075, F-076, F-077, F-122)

**影响**: TTSForm 有31个 useState 变量和4个 useRef -- 单个组件中状态过多。LibreChatPage 有30+ 状态变量，包含复杂的流式逻辑和 SSE 管理。EnvManager 通过 prop drilling 将15+ 独立 props 传递给20+ 子组件。LibreChatPage 复杂的模态状态对象包含内联 onConfirm 回调，每次渲染都会重新创建。

**建议**: 将逻辑提取到自定义 hooks 中，使用 context 或状态管理库替代深层 prop drilling，将模态状态管理提取到专用的 hooks 或 reducer 中。

### 16. 流式处理和 SSE 问题 (F-054, F-055, F-115)

**影响**: LibreChatPage SSE onerror 自动重连没有 backoff 或最大重试限制 -- 可能导致无限重连循环。setInterval 的 interval ID 存储在局部变量中，没有存储在 ref 中 -- 组件卸载时无法清理。useEffect 缺少 `history` 依赖数组项。

**建议**: 为 SSE 重连实现指数退避和最大重试限制，将 interval ID 存储在 ref 中以确保卸载时清理，修复缺失的 useEffect 依赖项。

### 17. 键盘快捷键和全局副作用 (F-058, F-071, F-114)

**影响**: CaseConverter 覆盖了 Ctrl+A 和 Ctrl+F 浏览器默认行为，导致用户沮丧和无障碍违规。CaseConverter 修改 `document.body.style.overflow` 作为全局副作用，可能与其他组件冲突。LogShare 使用3个独立的 createPortal 调用，没有门户管理器或焦点捕获。

**建议**: 使用不太常见的快捷键组合，避免覆盖标准的浏览器快捷键。使用 CSS 类或属性切换替代全局 body 样式修改。为所有模态框实现焦点捕获系统和门户管理器。