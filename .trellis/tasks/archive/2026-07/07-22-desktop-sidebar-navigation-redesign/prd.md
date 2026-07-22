# 桌面端左侧边栏分类导航重构

## Goal

参考 `F:\Repositories\GitHub\new-api` 的新前端左侧边栏分类导航体系，对 Synapse 前端桌面端导航进行结构化重做：桌面端使用统一左侧边栏，管理端入口与 `AdminDashboard` 的导航并入同一体系，并提供一个可承载分类下子功能的二级页面；移动端继续使用现有 `frontend/src/components/MobileNav.tsx`，不将桌面侧栏强行移植到手机端。本阶段只完成调研、需求收敛和最终确认文档，不开始业务代码施工。

## What I already know

* 用户要求以 `new-api` 新前端的左侧分类导航为参考进行桌面端大幅重做。
* 桌面端需要新的左侧边栏，且 `frontend/src/components/AdminDashboard.tsx` 的电脑端导航需要合并进统一侧栏。
* 需要“开一个左侧边栏二级页面”，具体页面承载范围和信息架构需结合两仓库现状确认。
* 移动端仍保持 `frontend/src/components/MobileNav.tsx`，移动端交互不随桌面侧栏直接复制。
* 用户要求先形成 Trellis 最终确认文档，交由用户确认后才开始施工。
* 当前仓库存在用户已有未提交修改：`.gitignore`，本任务不得覆盖或混入该修改。
* 本阶段禁止本地构建/测试；实际构建与测试应在 GitHub Actions 中执行；不执行安装命令。

## Assumptions (temporary)

* 参考 `new-api` 的信息架构和交互模式，但不直接复制其业务代码或品牌视觉。
* 桌面侧栏应同时服务普通用户和管理员，管理员专属入口按权限显示。
* 二级页面优先作为侧栏分类下的可复用页面壳，而非新增后端业务能力；是否需要新增路由由调研结果决定。
* 现有移动端导航继续作为独立响应式分支，必要时只复用导航配置，不改变其组件入口。

## Open Questions

* ~~侧栏的一级分类、管理员分组和二级页面首屏内容如何落位？~~ → 已定：admin 采用 drill-in 二级视图。
* 桌面侧栏是固定展开、可折叠，还是需要记忆用户上次状态？
* `new-api` 的哪些视觉/交互细节必须对齐，哪些只作为信息架构参考？
* 二级页面的 MVP 是“分类总览/占位页”，还是直接承载一个现有功能模块？
* 需要兼容哪些桌面断点、主题、权限与深链刷新场景？

## Decision Log (ADR-lite)

### D1: AdminDashboard 导航合并方式 = Drill-in 二级视图

**Context**: `AdminDashboard.tsx` 当前用内部 tab 切换管理模块（用户/抽奖/LibreChat/公告/...）；桌面端新侧栏需把这些管理入口并入统一体系。
**Decision**: 采用 new-api 的 drill-in 模式——侧栏点击「管理后台」顶级项后整栏切换为管理子项视图，顶部带「← 返回主导航」；`AdminDashboard` 拆成 `/admin/*` 多个子路由，侧栏激活态与 URL 同步，支持刷新/深链。
**Consequences**:
- 侧栏结构清晰、可扩展，大量 admin 子项不会让主导航变长。
- 需要新增 `/admin/*` 子路由拆分，`AdminDashboard` 现有 tab 逻辑需重构为路由 + 子页面（工作量大，但正适合并行 agent：每个子模块一个 agent）。
- 需要一套 sidebar view 注册表 + URL→view 解析（参考 `new-api/web/src/components/layout/lib/sidebar-view-registry.ts`）。
- 移动端不受影响，继续用 `MobileNav.tsx` 的 `adminGroups`。

### D2: 侧栏折叠行为 = 可折叠 + 记忆状态

**Context**: 桌面侧栏宽度会挤占内容区，new-api 用 cookie 记忆上次展开/折叠状态。
**Decision**: 侧栏默认展开（图标+标签），可通过 Rail 或按钮折叠为仅图标窄条；展开/折叠状态写入 cookie（参考 `new-api` 的 `sidebar_state` cookie），刷新后恢复。
**Consequences**:
- 需要 `SidebarProvider` + Rail 组件；折叠态下标签隐藏但保留 tooltip/a11y 标题。
- drill-in 二级视图下，整栏切换动画（`AnimatePresence mode="wait"`）需与折叠态兼容。

**Context**: `AdminDashboard.tsx` 当前用内部 tab 切换管理模块（用户/抽奖/LibreChat/公告/...）；桌面端新侧栏需把这些管理入口并入统一体系。
**Decision**: 采用 new-api 的 drill-in 模式——侧栏点击「管理后台」顶级项后整栏切换为管理子项视图，顶部带「← 返回主导航」；`AdminDashboard` 拆成 `/admin/*` 多个子路由，侧栏激活态与 URL 同步，支持刷新/深链。
**Consequences**:
- 侧栏结构清晰、可扩展，大量 admin 子项不会让主导航变长。
- 需要新增 `/admin/*` 子路由拆分，`AdminDashboard` 现有 tab 逻辑需重构为路由 + 子页面（工作量大，但正适合并行 agent：每个子模块一个 agent）。
- 需要一套 sidebar view 注册表 + URL→view 解析（参考 `new-api/web/src/components/layout/lib/sidebar-view-registry.ts`）。
- 移动端不受影响，继续用 `MobileNav.tsx` 的 `adminGroups`。

## Requirements (evolving)

* [ ] 桌面端新增统一左侧边栏，覆盖普通用户主导航和管理员导航。
* [ ] `AdminDashboard.tsx` 的电脑端导航入口并入统一左侧边栏，避免桌面端出现第二套独立导航。
* [ ] 新增一个侧栏分类对应的二级页面，并定义其路由、激活态、返回/面包屑行为。
* [ ] 移动端继续以 `MobileNav.tsx` 为导航入口，桌面侧栏不破坏手机端布局和交互。
* [ ] 导航配置、权限可见性、激活态和响应式行为保持可维护并避免重复定义。
* [ ] 参考 `new-api` 的分类层级、图标/标签表达和折叠体验，形成 Synapse 自身一致的视觉规范。
* [ ] 施工前将最终需求、技术路线、验收标准和分 PR 计划写入 Trellis 文档并取得用户确认。

## Acceptance Criteria (evolving)

* [ ] 在桌面视口可看到统一左侧边栏，主导航与管理入口层级清晰。
* [ ] 管理员进入 `AdminDashboard` 后仍可从统一侧栏切换相关管理子页面，页面内不再保留重复的桌面侧导航。
* [ ] 至少一个二级页面可通过侧栏进入，刷新/深链后激活态和返回路径正确。
* [ ] 非管理员看不到管理员专属入口，现有鉴权边界不被绕过。
* [ ] 移动视口继续使用 `MobileNav.tsx`，不出现桌面侧栏溢出、遮挡或重复导航。
* [ ] 关键键盘焦点、当前路由高亮、折叠/展开（若选定）和窄桌面断点行为有明确验收项。
* [ ] GitHub Actions 中的前端类型检查、构建和相关测试通过（本地不执行这些命令）。

## Definition of Done (team quality bar)

* 用户确认最终 PRD/技术方案后再进入施工阶段。
* 代码变更覆盖组件、路由、导航配置和必要测试/文档；不混入 `.gitignore` 等无关修改。
* GitHub Actions 完成规定的 lint、类型检查、构建和测试。
* 完成权限、响应式、深链刷新和无障碍基本检查。
* 按逻辑拆分提交，生成 conventional commit；是否推送遵循用户仓库权限与确认。

## Out of Scope (explicit)

* 本阶段不修改任何前端业务代码，不运行本地构建、测试或依赖安装。
* 不重写或删除 `MobileNav.tsx`，不把桌面布局直接套用到手机端。
* 不新增与侧栏无关的后端 API、数据模型、鉴权策略或 TTS 业务能力。
* 不直接复制 `new-api` 的源码、商标、文案或不可兼容的业务模块。

## Technical Notes

* 目标仓库：`F:\Repositories\GitHub\Synapse`。
* 参考仓库：`F:\Repositories\GitHub\new-api`。
* 预期重点文件：`frontend/src/components/MobileNav.tsx`、`frontend/src/components/AdminDashboard.tsx`、`frontend/src/App.tsx`、`frontend/src/components/`、`frontend/src/api/`、`frontend/src/hooks/` 及相关路由/权限实现。
* 需要先阅读 `.trellis/spec/frontend/` 索引和相关指南，再进入施工阶段。
* 研究文件将放在本任务的 `research/` 目录，并在最终 PRD 中引用。

## Research References

<!-- 调研完成后补充 research/*.md 链接 -->

### D3: 主侧栏一级分类 = 复用 MobileNav 现有 5 分组

**Context**: 桌面侧栏主区（admin drill-in 之外）的信息架构；现有 `MobileNav.tsx` 已分 5 组（核心功能/实用工具/娱乐与探索/信息与查询/测试与演示）。
**Decision**: 桌面侧栏主区沿用这 5 个分组，管理员额外一个「管理后台」drill-in 视图；桌面/移动端共用一份导航配置（抽到 `frontend/src/navigation/` 或 hooks），避免 IA 分叉。
**Consequences**: 与移动端体验一致；导航配置去重，后续改动单点维护。

### D4: 二级页面（drill-in 视图）承载 = AdminDashboard 拆分为 `/admin/*` 子路由

**Context**: `AdminDashboard.tsx` 当前用单个内部 `tab` + `searchParams` 切换 29 个管理模块（分 identity/integration/operations/security 4 组）；用户要求"开一个左侧边栏二级页面把任务分发给多个子 agent 同时做"。
**Decision**: 新增 sidebar view 注册表 + URL→view 解析（仿 `new-api/web/src/components/layout/lib/sidebar-view-registry.ts`）；`AdminDashboard` 重构为 `/admin` index 页 + `/admin/<module>` 子路由，每个模块一个独立子页面组件，drill-in 侧栏按 4 组列出模块，激活态与 URL 同步，支持刷新/深链。
**Consequences**:
- 29 个模块天然可并行——每个子页面一个 agent，正合用户"分发给多个子 agent 同时做"的诉求。
- `AdminDashboard` 现有权限校验（`/api/admin/verify-access` + 定期轮询）抽到 `AdminGuard` 共享路由守卫，所有 `/admin/*` 复用。
- 需新增 `tab→path` 映射并兼容旧 `?tab=` 参数（重定向到对应子路由，避免深链断裂）。

### D5: 技术实现 = 移植 new-api shadcn Sidebar 体系（声明式安装依赖，CI 跑安装）

**Context**: 核实 Synapse 前端缺失 shadcn 生态：`class-variance-authority`、`@radix-ui/react-collapsible`、`@radix-ui/react-tooltip`（+ `react-separator`/`react-slot` 视 sidebar.tsx 实际依赖）**均未安装**；`components.json` 不存在；`tsconfig.json` 无 `paths`（但 `vite.config.ts` 已配 `@ → ./src` 别名）；已有 `clsx` + `tailwind-merge`（即 `cn` 依赖齐）；Tailwind v3 风格 `tailwind.config.js` + `@import "tailwindcss"` 全局 `src/index.css`，无 `--sidebar-*`/`--background` 等 shadcn 设计 token。
**Decision**: 用户授权**原样移植 new-api 的 shadcn Sidebar 体系**——补齐依赖链（写进 `frontend/package.json` 的 dependencies）、加 tsconfig `paths`、在 `src/index.css` 注入 shadcn `--sidebar-*`/`--background` 等 CSS 变量 token、落地 `frontend/src/lib/utils.ts` 的 `cn`、复刻 `frontend/src/components/ui/sidebar.tsx` 及配套 `useIsMobile` hook。**不本地 `npm install`**；依赖安装由 CI 执行（声明式声明在 package.json），通过 GitHub Actions 跑 build/类型检查验证，本地仅写代码。
**Consequences**:
- 不新增自研 Sidebar 组件，直接对齐 new-api 视觉/交互（Rail 折叠、collapsible、tooltip、整栏切换动画）。
- 需要的小心点：Synapse 用 **react-router-dom v7**（new-api 用 TanStack Router），`useSidebarView`/`useLocation` 等 hook 需改成 react-router 适配版；`AnimateOutlet`/`AnimatedOutlet` 用现有 `App.tsx` 的 `AnimatePresence pageVariants` 模式替代。
- `.gitignore` 已有未提交修改，本任务 diff 只碰 `frontend/`、`tsconfig`、依赖声明，原样保留 `.gitignore` 现状不掺入。

## Research References（源码直接核对）

* `new-api/web/src/components/layout/components/app-sidebar.tsx` — drill-in 整栏切换骨架（`useSidebarView` + `SidebarViewHeader` + `AnimatePresence`）。
* `new-api/web/src/components/layout/lib/sidebar-view-registry.ts` — view 注册表 + `resolveSidebarView(pathname)`。
* `new-api/web/src/hooks/use-sidebar-view.ts` — root navGroups 按 role 过滤；嵌套 view 不过 config filter。
* `new-api/web/src/components/layout/components/authenticated-layout.tsx` — `SidebarProvider defaultOpen=getCookie('sidebar_state')`（折叠态记忆）。
* `new-api/web/src/components/ui/sidebar.tsx` — 待移植的 shadcn sidebar（依赖 cva + radix-collapsible/tooltip）。
* 目标：`frontend/src/App.tsx`（顶栏+`<main>` 单列→改两栏）、`frontend/src/components/MobileNav.tsx`（移动端不变）、`frontend/src/components/AdminDashboard.tsx`（29 模块 tab→拆 `/admin/*`）。

## Implementation Plan（多 PR / 并行 agent）

### PR1 — 基础设施（串行先行，1 agent）

* `frontend/package.json` `dependencies` 追加：`class-variance-authority`、`@radix-ui/react-collapsible`、`@radix-ui/react-tooltip`、`@radix-ui/react-separator`、`@radix-ui/react-slot`（版本对齐 new-api）。
* `frontend/tsconfig.json` 加 `baseUrl: "."` + `paths: { "@/*": ["./src/*"] }`（vite 已有该 alias）。
* 新增 `frontend/src/lib/utils.ts`：`cn = twMerge(clsx(...))`。
* 新增 `frontend/src/hooks/useIsMobile.ts`（matchMedia 断点）。
* 新增 `frontend/src/components/ui/sidebar.tsx`：从 new-api 移植，`@/lib/utils`/`@/hooks/...` 路径适配本项目（已是 `@`→`src`）；sidebar.tsx 本身不依赖 router，无需改。
* `frontend/src/index.css` 注入 shadcn `--background/--foreground/--sidebar*/--border/--ring` 等 CSS 变量（含 `.dark`），保证 `bg-sidebar`/`text-sidebar-foreground` 等 class 有 token。
* 新增 `frontend/src/layout/`：`SidebarProvider`/`AppSidebar`/`NavGroup`/`NavLinkItem`/`SidebarViewHeader`（react-router-dom v7 适配版）。

### PR2 — 导航配置 + drill-in 注册表（串行跟 PR1，1 agent）

* 新增 `frontend/src/navigation/navConfig.ts`：把 `MobileNav` 的 `menuGroups` + `adminGroups` 统一抽成单一配置（`NavItem`/`NavGroup` + role 字段），桌面/移动端共用。
* 新增 `frontend/src/navigation/sidebarViews.tsx`：`ADMIN_VIEW`（id/pathPattern=/^\/admin/、getNavGroups 返回 identity/integration/operations/security 4 组），注册到 `resolveSidebarView`。
* 新增 `frontend/src/hooks/useSidebarView.ts`：react-router `useLocation` + role 过滤 + `resolveSidebarView`。

### PR3 — AdminDashboard 拆分 + App 布局改两栏（并行，多 agent）

* 抽 `frontend/src/components/admin/AdminGuard.tsx`（`/api/admin/verify-access` + 5 分钟轮询 + 路由守卫），`/admin/*` 用 `<Route element={<AdminGuard/>}>` 包裹。
* `/admin` index：保留 hero + 模块卡片概览。
* `/admin/<module>`：29 个子路由，挂原 `tab===<key>` 对应组件（多数已懒加载）。
* `?tab=<key>` 旧链重定向到 `/admin/<module>`。
* `App.tsx`：桌面视口（≥1024）顶栏右侧 `MobileNav` 桌面分支换成左侧 `AppSidebar` + `SidebarInset`；移动视口仍渲染 `MobileNav`。

**编排**：PR1+PR2 主 agent 串行落地；PR3 子模块拆分用 Workflow 并行多 agent（每 admin 模块 1 agent 写子路由接线），主 agent 收口整合。

## Final Confirmation（用户已确认，进入施工）

* [x] D1 Drill-in 二级视图 ｜ [x] D2 可折叠+记忆 ｜ [x] D3 复用 MobileNav 5 分组 ｜ [x] D4 AdminDashboard 拆 `/admin/*` + 并行 agent ｜ [x] D5 移植 new-api shadcn Sidebar、声明式装依赖 CI 跑。
* [x] 用户明确指示"全部按照你的推荐 自动开写代码"——直接进入施工。

