# Synapse 架构改进方案

> 基于 `docs/architecture-review-2026-08-01.md` 的审查结论，制定可执行的改进计划  
> 日期：2026-08-01  

---

## 目录

1. [总体策略](#1-总体策略)
2. [P0 紧急改进](#2-p0-紧急改进)
3. [P1 核心改进](#3-p1-核心改进)
4. [P2 重要改进](#4-p2-重要改进)
5. [P3 优化改进](#5-p3-优化改进)
6. [领域重构路线图](#6-领域重构路线图)
7. [治理增强方案](#7-治理增强方案)
8. [执行时序](#8-执行时序)

---

## 1. 总体策略

### 1.1 改进原则

按照 Trellis 架构思维指南，每项改进遵循以下原则：

1. **提供选项，而非指令** — 关键决策给出 2-3 种方案并比较权衡
2. **解释原理，而非仅给出规则** — 说明"为什么"这样改
3. **主动捕获 7 种代码坏味** — 出现时立即命名并修复
4. **量体裁衣** — 解决方案匹配问题规模

### 1.2 改进路线总览

```
阶段 1（紧急修复）    阶段 2（核心重构）    阶段 3（体系优化）
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ App.tsx 拆分  │────→│ 领域模块化    │────→│ 跨层治理     │
│ 安全绕过合并   │     │ 状态管理引入   │     │ 设计系统     │
│ 全局变量消除   │     │ 配置系统重构   │     │ 类型同步     │
│ 服务层治理     │     │ 后端领域边界   │     │ 测试覆盖     │
└─────────────┘     └─────────────┘     └─────────────┘
  第 1-2 周           第 3-8 周           第 9-16 周
```

---

## 2. P0 紧急改进

### IMP-001: App.tsx 拆分（P0 · 2-3 天）

#### 问题

`frontend/src/App.tsx` 约 72KB，混合了路由定义、懒加载导入、首次访问验证逻辑、页面标题映射、导航配置等多项职责。每次添加页面都需修改此文件，造成合并冲突热点。

#### 方案 A（推荐）：路由配置 + 布局分离

```
frontend/src/
├── App.tsx                    ← 精简壳层（仅 Provider 包裹 + 布局选择）
├── router/
│   ├── index.tsx              ← <Routes> 定义，引入各页面路由组
│   ├── lazyImports.ts         ← 所有 React.lazy() 集中管理
│   ├── routeConfig.ts         ← 路径/标题/权限映射（纯数据）
│   └── guards.tsx             ← AdminGuard、AuthGuard 等路由守卫
├── layout/
│   ├── AppShell.tsx           ← 登录态布局选择器
│   ├── AuthenticatedLayout.tsx ← 登录后布局（DesktopShell + Outlet）
│   └── AnonymousLayout.tsx    ← 匿名布局（MobileNav + Outlet）
└── components/
    ├── FirstVisitVerification/
    │   ├── index.tsx
    │   └── verificationLogic.ts  ← 首次访问验证逻辑
    └── ...
```

**权衡**：

| 维度 | 方案 A（路由配置分离） | 方案 B（按页面目录拆分） | 方案 C（维持现状） |
|------|----------------------|----------------------|------------------|
| 迁移成本 | 中（2-3 天） | 高（1 周） | 0 |
| 可维护性 | ✅ 大幅提升 | ✅ 最佳 | ❌ 持续恶化 |
| 增量迁移 | ✅ 支持 | ❌ 需一次性完成 | N/A |
| 新页面添加 | 只需修改 `routeConfig.ts` | 添加目录即可 | 修改 App.tsx |

#### 执行步骤

1. 创建 `frontend/src/router/` 目录
2. 将 `React.lazy()` 导入抽取到 `lazyImports.ts`
3. 将路径/标题/权限映射抽取到 `routeConfig.ts`
4. 将路由守卫逻辑抽取到 `guards.tsx`
5. 将首次访问验证逻辑抽取到独立组件
6. `App.tsx` 精简为：

```typescript
function App() {
  return (
    <NotificationProvider>
      <BroadcastModalProvider>
        <Router>
          <FirstVisitGate>
            <AppRoutes />
          </FirstVisitGate>
        </Router>
      </BroadcastModalProvider>
    </NotificationProvider>
  );
}
```

### IMP-002: 安全绕过策略单一来源（P0 · 1 天）

#### 问题

安全绕过逻辑同时在 `src/security/securityPolicy.ts`（静态规则）和 `src/routes/index.ts`（RouteModule.securityBypass）定义，两处需同步维护。

#### 方案

**以 RouteModule 声明为权威来源，废弃静态规则**。

- `securityPolicy.ts` 中的 `securityBypassPolicy` 标记为 `@deprecated`
- 所有路由绕过理由已在 RouteModule 中声明（抽查确认已覆盖全部）
- 新增 `securityPolicy.getRouteBypassPriority()` 当两处冲突时以 RouteModule 为准
- 在 `assertRouteGovernance()` 中增加告警：当静态规则与 RouteModule 声明不一致时打印警告

#### 执行步骤

1. 审计 `securityPolicy.ts` 中所有绕过规则是否已被 RouteModule 声明覆盖
   - ipBan: `/health`, `/api/health`, `/status`, `/api/status` → 已覆盖（health-routes, status-routes）
   - waf: `/api/auth/login`, `/api/auth/register` → 已覆盖（auth-routes 声明 `"mixed"`）
   - waf: `/api/webhooks`, `/api/ecoenchants/v1/webhooks`, `/api/data-collection` → 已覆盖
   - ipVerification: 所有路径 → 已覆盖
2. 确认 RouteModule 中未遗漏的绕过路径
3. 将 `securityPolicy.shouldBypassSecurityComponent()` 改为优先查 RouteModule 声明
4. 添加 CI 检查：新路由模块必须声明 `securityBypass` 或显式声明 `"not-needed"`

---

## 3. P1 核心改进

### IMP-003: 消除全局变量（P1 · 半天）

#### 问题

`src/app/startup.ts` 使用 `var` 声明全局变量并通过 `globalThis` 存取邮件服务状态，破坏可测试性和类型安全。

#### 方案

**引入 ServiceRegistry 模式**（替代 `globalThis`）：

```typescript
// src/services/serviceRegistry.ts
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  private services = new Map<string, unknown>();

  static getInstance(): ServiceRegistry {
    if (!ServiceRegistry.instance) {
      ServiceRegistry.instance = new ServiceRegistry();
    }
    return ServiceRegistry.instance;
  }

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  get<T>(name: string): T | undefined {
    return this.services.get(name) as T | undefined;
  }
}
```

**修改点**：
- `startup.ts` 中的 `var _EMAIL_ENABLED` 等改为 `ServiceRegistry.getInstance().register("emailService", { enabled: true })`
- 引用方改为 `ServiceRegistry.getInstance().get<EmailServiceStatus>("emailService")`

#### 执行步骤

1. 创建 `src/services/serviceRegistry.ts`
2. 替换 `startup.ts` 中的 3 个 `var` 声明
3. 搜索所有引用 `globalThis.EMAIL_ENABLED`、`globalThis.EMAIL_SERVICE_STATUS`、`globalThis.OUTEMAIL_SERVICE_STATUS` 的地方并替换
4. 删除 `startup.ts` 中的 `var` 声明

### IMP-004: 配置系统拆分（P1 · 2-3 天）

#### 问题

`src/config/config.ts` 约 630 行，包含 env 解析、默认值构建、运行时配置存取器，职责过重。

#### 方案

```
src/config/
├── index.ts              ← 重新导出（兼容旧引用）
├── envSchema.ts          ← Zod Schema 定义（纯声明）
├── envParser.ts          ← process.env 解析 → 原始配置对象
├── startupConfig.ts      ← 编译时配置（env 解析结果 + 不可变默认值）
├── runtimeConfig.ts      ← 运行时配置存取器（代理 RuntimeConfigService）
├── compileTimeConfig.ts  ← 文件路径等常量
└── defaults/
    ├── index.ts          ← 默认值构建函数
    ├── email.ts          ← 邮件默认值
    ├── rust.ts           ← Rust 服务默认值
    └── tts.ts            ← TTS 默认值
```

**权衡**：

| 维度 | 拆分方案 | 维持现状 |
|------|---------|---------|
| 迁移成本 | 2-3 天 | 0 |
| 可读性 | ✅ 每个文件小于 150 行 | ❌ 630 行单文件 |
| 增量迁移 | ✅ 向后兼容导出 | N/A |
| 测试性 | ✅ 可独立测试各模块 | ❌ 需启动整个配置链 |

#### 执行步骤

1. 创建 `src/config/envSchema.ts` — 迁移 Zod Schema
2. 创建 `src/config/compileTimeConfig.ts` — 迁移文件路径常量
3. 创建 `src/config/defaults/` 目录 — 迁移默认值构建
4. 创建 `src/config/runtimeConfig.ts` — 迁移运行时配置存取器
5. `src/config/config.ts` 精简为 re-export 入口
6. 更新所有引用 `import { config } from "../config/config"` 为 `import { config } from "../config"`

### IMP-005: 引入前端状态管理（P1 · 1 周）

#### 问题

前端全凭 React Context + Hooks 管理状态，Context 嵌套层级持续增长，无法追踪状态变更。

#### 方案

**引入 Zustand**（轻量级，< 2KB，无 Provider 包裹）：

```typescript
// frontend/src/stores/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (token, user) => set({ token, user, isAuthenticated: true }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    { name: "auth-storage" },
  ),
);
```

**迁移计划**：

| Store | 优先级 | 替换的 Hook/Context | 迁移难度 |
|-------|--------|-------------------|---------|
| `authStore` | P1 | `useAuth` | 中（多方引用） |
| `ttsStore` | P2 | `useTts` | 低（局部使用） |
| `sidebarStore` | P2 | `useSidebarView` | 低 |
| `notificationStore` | P2 | Notification Context | 中 |

#### 执行步骤

1. 安装 `zustand`
2. 创建 `frontend/src/stores/` 目录
3. 实现 `authStore.ts`（替换 `useAuth`）
4. 更新现有组件逐步迁移
5. `useAuth` hook 保留为 Zustand store 的包装器（向后兼容）

### IMP-006: 后端服务层领域重构 — 认证模块（P1 · 1 周）

#### 问题

认证逻辑分散在 `authenticateToken.ts`、`authMiddleware.ts`、`auth.ts`、`authValidation.ts`、`turnstileAuth.ts` 等多个中间件文件，以及 `authController.ts` 和多个服务文件中。

#### 方案

**以 TTS 模块为样板，重构认证领域为独立模块**：

```
src/auth/
├── auth.ports.ts          ← 接口定义（TokenVerifier, AuthProvider, SessionStore）
├── auth.service.ts        ← 核心认证逻辑
├── auth.pipeline.ts       ← 认证请求处理管道
├── auth.controller.ts     ← HTTP 适配器
├── auth.errors.ts         ← 认证错误类型
├── auth.providers/        ← 各认证提供者
│   ├── password.provider.ts
│   ├── totp.provider.ts
│   ├── passkey.provider.ts
│   ├── oauth.provider.ts
│   └── google.provider.ts
├── middleware/
│   ├── authenticateToken.ts  ← 精简为适配器（调用 AuthService）
│   ├── authMiddleware.ts
│   └── authValidation.ts
└── auth.session.ts        ← Session 管理
```

**与 TTS 模块的一致性**：

| TTS 模块 | 认证模块（目标） | 职责 |
|----------|----------------|------|
| `tts.ports.ts` | `auth.ports.ts` | 接口定义 |
| `tts.service.ts` | `auth.service.ts` | 核心业务逻辑 |
| `tts.pipeline.ts` | `auth.pipeline.ts` | 处理管道 |
| `tts.controller.ts` | `auth.controller.ts` | HTTP 适配器 |
| `tts.errors.ts` | `auth.errors.ts` | 错误类型 |
| `tts.provider.ts` | `auth.providers/` | 外部提供者 |

#### 执行步骤

1. 创建 `src/auth/` 目录
2. 定义 `auth.ports.ts`（TokenVerifier, AuthProvider, SessionStore 接口）
3. 实现 `auth.service.ts`（核心逻辑：密码验证、Token 签发/验证、MFA 协调）
4. 逐个迁移中间件（保持向后兼容，逐步替换实现）
5. 迁移 `authController.ts` 中的路由处理逻辑
6. 删除冗余的中间件文件

---

## 4. P2 重要改进

### IMP-007: 领域边界文档化（P2 · 1 天）

为每个存在的领域编写 `CONTEXT.md`，明确边界、依赖、职责。这本身不修改代码，但为后续重构提供契约参考。

```
src/contexts/
├── auth/CONTEXT.md        ← 认证领域边界
├── tts/CONTEXT.md         ← TTS 领域边界（已存在）
├── admin/CONTEXT.md       ← 管理领域边界
├── nexai/CONTEXT.md       ← NexAI 领域边界
├── ecoenchants/CONTEXT.md ← EcoEnchants 领域边界
└── shared/CONTEXT.md      ← 共享基础设施边界
```

每个 `CONTEXT.md` 包含：
- 领域所有者
- 公开接口（Ports/API）
- 依赖的领域
- 禁止的跨领域引用
- 数据模型

### IMP-008: 引入前端设计 Token 系统（P2 · 2-3 周）

#### 问题

如 `docs/frontend-design-audit-2026-07-22.md` 所述，前端缺少统一设计系统，主题、圆角、阴影、字号不一致。

#### 方案

**在 Tailwind 基础上添加设计 Token 层**（无需更换 UI 框架）：

```typescript
// frontend/src/design-tokens/tokens.ts
export const tokens = {
  color: {
    primary: "var(--color-primary)",
    surface: "var(--color-surface)",
    text: "var(--color-text)",
    muted: "var(--color-muted)",
    border: "var(--color-border)",
  },
  radius: {
    sm: "0.375rem",   // 6px
    md: "0.5rem",     // 8px
    lg: "0.75rem",    // 12px
    xl: "1rem",       // 16px
  },
  shadow: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
  },
  animation: {
    fast: "150ms",
    normal: "200ms",
    slow: "300ms",
  },
};
```

```css
/* frontend/src/styles/tokens.css */
:root {
  --color-primary: #3b82f6;
  --color-surface: #ffffff;
  --color-text: #1f2937;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
}

[data-theme="dark"] {
  --color-primary: #60a5fa;
  --color-surface: #1f2937;
  --color-text: #f9fafb;
  --color-muted: #9ca3af;
  --color-border: #374151;
}
```

#### 执行步骤

1. 创建 `frontend/src/design-tokens/` 目录
2. 定义核心 Token（颜色、间距、圆角、阴影、动画）
3. 创建 CSS 变量文件，支持亮/暗模式
4. 创建基础 UI 组件库（Button, Input, Card, Modal, Toast）
5. 逐步替换现有组件中的硬编码样式值
6. 更新 `index.css` 中的 Tailwind 配置以使用 Token 变量

### IMP-009: 前后端类型同步（P2 · 1 周）

#### 问题

前后端类型定义不同步，API 响应类型定义不完整或过时，无 API 契约检查。

#### 方案

**建立 OpenAPI 类型生成管道**：

```
src/routes/*.ts (JSDoc/装饰器)
    ↓ `npm run generate:openapi`
openapi.json
    ↓ openapi-typescript
frontend/src/api/generated/
    ├── api.ts              ← 生成的 API 客户端
    └── types.ts            ← 生成的请求/响应类型
```

**执行步骤**：

1. 验证 `npm run generate:openapi` 正确生成 `openapi.json`
2. 安装 `openapi-typescript` 或 `@hey-api/openapi-ts`
3. 配置生成脚本，输出到 `frontend/src/api/generated/`
4. 将生成脚本加入 `build:frontend` 流程
5. 逐步将现有 API 调用迁移到生成类型

### IMP-010: 跨层治理增强（P2 · 3-5 天）

#### 问题

治理系统仅覆盖路由注册层，不验证路由声明与实际中间件执行的一致性。

#### 方案

**在路由治理中增加跨层验证**：

```typescript
// 在 validateRouteGovernance() 中添加
function validateAuthMiddlewarePresence(record: RouteAuditRecord): void {
  if (record.requiresAuth === true && record.authPolicy?.mode === "router") {
    // 验证路由模块的 router 中确实使用了声明的认证处理器
    const router = findRouteModule(record.name);
    // 检查 router 配置中是否包含 authenticateToken 等
    // 无侵入式检查：通过 router.stack 或静态分析
  }
}
```

**新增治理规则**：

| 规则 | 校验内容 | 验证方式 |
|------|---------|---------|
| `auth-middleware-presence` | Route 声明 `requiresAuth: true`，其 router 确实使用了认证中间件 | 静态分析 router.stack |
| `rate-limit-applied` | Route 声明 `rateLimited: true`，其 limiter 在路由执行路径上 | 检查 limiter 注册 |
| `audit-log-consistency` | 审计日志声明与实际数据流一致 | 集成测试 |

---

## 5. P3 优化改进

### IMP-011: 服务层循环依赖检测（P3 · 2 天）

#### 方案

引入 `madge` 或 `dpdm` 进行循环依赖检测：

```bash
# 安装检测工具
pnpm add -D madge

# 配置检测脚本
npx madge --circular src/ --extensions ts
```

**CI 集成**：在 `check:unused-deps` 或新增 `check:circular-deps` 中运行。

### IMP-012: 代码混淆策略调整（P3 · 半天）

#### 方案

- 生产构建保留 source maps（但不上传到公开路径）
- 或者仅在分发场景（Docker 镜像）混淆，服务端部署使用未混淆版本
- 或者使用 `--compact` 模式替代完全混淆，保留错误栈

```json
// package.json 中的 obfuscate 配置
{
  "javascript-obfuscator": {
    "compact": true,
    "controlFlowFlattening": false,
    "deadCodeInjection": false,
    "stringArray": false,
    "sourceMap": true,
    "sourceMapMode": "separate"
  }
}
```

### IMP-013: 建立测试覆盖率仪表盘（P3 · 1 周）

#### 方案

1. 配置 Jest 生成覆盖率报告（`--coverage`）
2. 定义覆盖率目标（行覆盖率 ≥ 60%，分支覆盖率 ≥ 50%）
3. 集成到 CI 管道
4. 创建 `docs/test-coverage-dashboard.md` 定期更新

---

## 6. 领域重构路线图

### 6.1 重构优先级

```
优先级         领域            当前状态          目标状态           预计工作量
──────────────────────────────────────────────────────────────────────
P1 (阶段 2)    认证            分散在 8+ 文件      独立模块          1 周
P1 (阶段 2)    管理            控制器过大          拆分控制器         3-5 天
P2 (阶段 2)    NexAI          跨多个文件          独立模块          1 周
P2 (阶段 3)    EcoEnchants    服务文件过大         拆分 + 模块化      1 周
P2 (阶段 3)    TTS            已完成模块化         保持              已达标
P3 (阶段 3)    工具集合        分散在多个控制器     逐步归集          2 周
```

### 6.2 重构模式

每个领域模块遵循 TTS 模块的架构模式：

```
src/<domain>/
├── <domain>.ports.ts       ← 接口定义（依赖反转）
├── <domain>.service.ts     ← 核心业务逻辑
├── <domain>.pipeline.ts    ← 请求处理管道
├── <domain>.controller.ts  ← HTTP 适配器（可选，可复用现有 controller）
├── <domain>.errors.ts      ← 领域错误类型
└── middleware/              ← 领域专用中间件（可选）
```

### 6.3 渐进式迁移策略

```
步骤 1: 创建目录 + 定义接口
    ├── 创建 src/<domain>/ 目录
    ├── 定义 <domain>.ports.ts（接口）
    └── 现有代码保持不变

步骤 2: 实现核心
    ├── 实现 <domain>.service.ts
    ├── 现有服务调用新服务（适配器模式）
    └── 逐步迁移调用方

步骤 3: 切流量
    ├── 路由/控制器改为调用新模块
    ├── 旧服务标记为 @deprecated
    └── 验证通过后删除旧代码

步骤 4: 清理
    ├── 删除冗余旧文件
    ├── 更新导入路径
    └── 更新领域文档
```

---

## 7. 治理增强方案

### 7.1 现有治理体系

```
┌───────────────────────────────────────────────────────────────┐
│  CI 治理层                                                      │
│  ├── 路由治理验证 (assertRouteGovernance)                       │
│  ├── TypeScript 文件大小治理 (check:ts-file-size)               │
│  ├── 前端 Bundle 预算治理 (check:frontend-bundle)               │
│  └── 隐私数据契约治理 (check:privacy-contract)                   │
├───────────────────────────────────────────────────────────────┤
│  开发时治理层                                                    │
│  ├── 7 种代码坏味检查（人工 Code Review）                         │
│  └── 架构不变式检查（人工 Code Review）                           │
└───────────────────────────────────────────────────────────────┘
```

### 7.2 新增治理规则

| 治理规则 | 触发时机 | 验证方式 | 优先级 |
|---------|---------|---------|--------|
| 服务层循环依赖 | CI | `madge --circular` | P3 |
| 控制器行数超过阈值 | CI | `check:ts-file-size` 扩展 | P2 |
| 前后端类型不一致 | CI | OpenAPI 生成对比 | P2 |
| 安全绕过策略唯一性 | 启动时 | `assertRouteGovernance()` 扩展 | P0 |
| 全局变量声明 | CI | ESLint `no-var` 规则 | P1 |

### 7.3 治理成熟度模型

```
Level 0: 无治理          ← 当前部分模块
Level 1: 启动时校验       ← 路由治理已达成
Level 2: CI 自动化检查    ← 文件大小、Bundle 已达成
Level 3: 跨层数据流验证   ← 目标
Level 4: 运行时自检       ← 长期目标
```

---

## 8. 执行时序

### 8.1 甘特图

```
任务                      W1  W2  W3  W4  W5  W6  W7  W8  W9  W10 W11 W12 W13 W14 W15 W16
──────────────────────────────────────────────────────────────────────────────────────
IMP-001 App.tsx 拆分      ██  ██
IMP-002 安全绕过合并       ██
IMP-003 全局变量消除       ██
IMP-004 配置系统拆分           ██  ██  ██
IMP-005 前端状态管理            ██  ██  ██  ██
IMP-006 认证领域重构                 ██  ██  ██  ██
IMP-007 领域边界文档                        ██
IMP-008 设计 Token 系统                          ██  ██  ██
IMP-009 类型同步                                    ██  ██  ██
IMP-010 跨层治理                                      ██  ██
IMP-011 循环依赖检测                                            ██
IMP-012 代码混淆策略                                            ██
IMP-013 测试覆盖率仪表盘                                              ██  ██
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
阶段 1 (紧急)     ████████
阶段 2 (核心)            ████████████████████
阶段 3 (优化)                         ████████████████████
```

### 8.2 工作量估算

| 阶段 | 改进项 | 预计工作量 | 参与人数 | 风险 |
|------|--------|-----------|---------|------|
| 阶段 1 | IMP-001 ~ IMP-003 | 4-5 天 | 1 人 | 低 |
| 阶段 2 | IMP-004 ~ IMP-007 | 3-4 周 | 1-2 人 | 中 |
| 阶段 3 | IMP-008 ~ IMP-013 | 5-6 周 | 1-2 人 | 中 |

### 8.3 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 重构引入回归 | 中 | 高 | 增量迁移 + 充分的测试覆盖 |
| 需求变更中断重构 | 高 | 中 | 治理规则约束新代码，旧代码渐进式重构 |
| 团队适应期 | 中 | 低 | 提供迁移指南和代码示例 |
| 第三方依赖变化 | 低 | 中 | 接口抽象化，依赖隔离 |

---

## 附录：改进项速查卡

| 编号 | 名称 | 优先级 | 工作量 | 所属阶段 | 核心文件 |
|------|------|--------|--------|---------|---------|
| IMP-001 | App.tsx 拆分 | P0 | 2-3 天 | 阶段 1 | `frontend/src/App.tsx` |
| IMP-002 | 安全绕过合并 | P0 | 1 天 | 阶段 1 | `src/security/securityPolicy.ts` |
| IMP-003 | 全局变量消除 | P1 | 半天 | 阶段 1 | `src/app/startup.ts` |
| IMP-004 | 配置系统拆分 | P1 | 2-3 天 | 阶段 2 | `src/config/config.ts` |
| IMP-005 | 前端状态管理 | P1 | 1 周 | 阶段 2 | `frontend/src/hooks/useAuth.ts` |
| IMP-006 | 认证领域重构 | P1 | 1 周 | 阶段 2 | `src/middleware/authenticateToken.ts` |
| IMP-007 | 领域边界文档 | P2 | 1 天 | 阶段 2 | `src/contexts/*/CONTEXT.md` |
| IMP-008 | 设计 Token 系统 | P2 | 2-3 周 | 阶段 3 | `frontend/src/design-tokens/` |
| IMP-009 | 前后端类型同步 | P2 | 1 周 | 阶段 3 | `openapi.json` |
| IMP-010 | 跨层治理增强 | P2 | 3-5 天 | 阶段 3 | `src/routes/index.ts` |
| IMP-011 | 循环依赖检测 | P3 | 2 天 | 阶段 3 | `src/services/` |
| IMP-012 | 代码混淆策略 | P3 | 半天 | 阶段 3 | `package.json` |
| IMP-013 | 测试覆盖率仪表盘 | P3 | 1 周 | 阶段 3 | `jest.config.js` |