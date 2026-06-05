# App.tsx UI 设计语言结论文档

来源：`frontend/src/App.tsx`、`frontend/src/index.css`、`frontend/tailwind.config.js`

## 1. 设计结论

Synapse 的主界面语言是“浅色玻璃态工作台”：低饱和灰白背景、半透明白色导航与卡片、靛蓝作为唯一主操作色、Slate/Gray 作为信息层级色，并用短距离位移和轻量缩放完成 SPA 切页反馈。

复刻时不要先做营销页或重型视觉装饰。首屏应直接呈现应用工作区：顶部导航、居中最大宽度内容区、路由页面、页脚、Toast、公告弹窗和安全相关遮罩。

## 2. 技术栈基线

- React + React Router：页面由路由切换，不刷新整页。
- Tailwind CSS：所有主壳层视觉用工具类描述。
- Framer Motion：导航入场、路由切换、模态框、品牌微动效。
- React Toastify：全局通知，语义色由 `index.css` 定制。
- DOMPurify：公告内容渲染前必须清洗。

## 3. 品牌气质

- 关键词：轻量、安全、工具化、干净、可扫描。
- 界面密度：中等密度，避免大面积英雄图和营销卡片。
- 视觉重心：让内容区占主导，背景与动效只做环境层。
- 品牌标识：`/favicon.ico` + `Synapse` 文本，位于 64px 高导航左侧。

## 4. 色彩 Token

### 页面背景

- 主工作台背景：`bg-gradient-to-br from-gray-50 to-gray-100`。
- 加载页背景：
  `radial-gradient(circle at top, rgba(59,130,246,0.22), transparent 34%)`
  叠加 `linear-gradient(180deg,#f8fbff 0%,#eef2ff 55%,#f8fafc 100%)`。
- Artifact 独立页背景：`bg-slate-100`。
- 错误边界背景：`bg-gray-50`。

### 表面层

- 导航：`bg-white/80 backdrop-blur-lg shadow-lg`。
- 加载卡片：`bg-white/88 border-white/70 backdrop-blur-xl`。
- 404 卡片：`bg-white/92 border-slate-200/80 backdrop-blur-xl`。
- 输入或路径提示容器：`bg-slate-50/80 border-slate-200`。
- 弹窗主体：`bg-white shadow-2xl`。

### 文本层级

- 主标题：`text-slate-900` 或 `text-gray-900`。
- 正文：`text-slate-600` 或 `text-gray-600`。
- 次要说明：`text-slate-500`、`text-gray-400`。
- Eyebrow/标签：`text-slate-400` + uppercase + 宽字距。
- 链接 hover：`hover:text-indigo-600`。

### 操作色

- 主操作：`bg-indigo-600 text-white`，hover 为 `bg-indigo-700`。
- 深色主按钮：`bg-slate-900 text-white`，hover 为 `bg-slate-800`。
- 次级按钮：`border-slate-200 bg-white text-slate-700`。
- 错误操作：`from-red-500 to-pink-500`。

### Toast 语义色

- Success：`#f0fdf4` 到 `#dcfce7`，文字 `#065f46`，进度 `#10b981` 到 `#059669`。
- Error：`#fef2f2` 到 `#fee2e2`，文字 `#991b1b`，进度 `#ef4444` 到 `#dc2626`。
- Warning：`#fffbeb` 到 `#fef3c7`，文字 `#92400e`，进度 `#f59e0b` 到 `#d97706`。
- Info：`#eff6ff` 到 `#dbeafe`，文字 `#1e40af`，进度 `#3b82f6` 到 `#6366f1`。

## 5. 字体与排版

- 全局字体：
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif`。
- 品牌文字：`text-xl font-bold`。
- 页面大标题：`text-3xl sm:text-5xl font-semibold leading-tight`。
- 弹窗标题：`text-2xl font-bold`。
- 正文：`text-sm sm:text-base leading-7`。
- 标签：`text-[11px] font-semibold uppercase tracking-[0.26em]` 到 `tracking-[0.28em]`。
- 代码/快捷键：`font-mono text-[10px]`，小圆角边框。

## 6. 间距与布局

- 全局容器最大宽度：`max-w-7xl mx-auto`。
- 主要内容区：`py-6 sm:px-6 lg:px-8`。
- 导航横向内边距：`px-4 sm:px-6 lg:px-8`。
- 导航高度：`h-16`。
- 加载页内容最大宽度：`max-w-3xl`。
- 404 页面最大宽度：`max-w-4xl`。
- 弹窗最大宽度：`max-w-lg w-full`。
- 模态安全高度：`max-h-[90vh] overflow-y-auto overscroll-contain`。
- 路由加载空态：`min-h-[46vh]`。

## 7. 圆角系统

- 小按钮：`rounded-xl`。
- 标准按钮与弹窗：`rounded-2xl`。
- 导航加载徽章：`rounded-[18px]`。
- 提示容器：`rounded-[22px]`。
- 加载图标底座：`rounded-[26px]`。
- 404 主卡片：`rounded-[34px]`。
- 加载卡片：`rounded-[36px]`。
- Pill 标签和跳转链接：`rounded-full`。

## 8. 阴影与玻璃态

- 导航：`shadow-lg`，配合 `bg-white/80` 和 `backdrop-blur-lg`。
- 加载卡片：
  `shadow-[0_24px_80px_rgba(15,23,42,0.08)]`。
- 404 卡片：
  `shadow-[0_28px_110px_rgba(15,23,42,0.1)]`。
- 导航加载徽章：
  `shadow-[0_8px_24px_rgba(15,23,42,0.08)]`。
- 页脚加载徽章：
  `shadow-[0_8px_24px_rgba(15,23,42,0.06)]`。
- Toast 卡片：
  `0 4px 24px rgba(0,0,0,0.08)`，hover 提升到更强阴影。

## 9. 层级与 z-index

- 背景粒子：`z-0 pointer-events-none`。
- 主壳层内容：`relative z-10`。
- 跳过链接：`z-50`。
- TOTP 模态遮罩：`z-50`。
- 水印遮罩：`z-[99999]`。
- 路由内容必须在背景粒子之上，且不能被导航或遮罩误盖。

## 10. 页面壳层蓝图

按以下结构复刻：

```tsx
<NotificationProvider>
  <BroadcastModalProvider>
    <WsConnector />
    <LazyMotion features={domAnimation}>
      <ToastContainer position={toastPosition} autoClose={4500} hideProgressBar newestOnTop limit={3} />
      <AnnouncementModal contentClassName="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto px-2 sm:px-4" />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 relative overflow-hidden">
        {showParticles && <BackgroundParticles />}
        <a href="#app-main-content" className="absolute left-4 top-4 z-50 -translate-y-24 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition focus:translate-y-0" />
        <m.nav className="bg-white/80 backdrop-blur-lg shadow-lg relative z-10" />
        <main id="app-main-content" tabIndex={-1} className="max-w-7xl mx-auto py-6 focus:outline-none sm:px-6 lg:px-8 relative z-10" />
        <Footer />
      </div>
    </LazyMotion>
  </BroadcastModalProvider>
</NotificationProvider>
```

## 11. 导航蓝图

- 外层：`m.nav`，初始 `y:-100, opacity:0`，进入 `y:0, opacity:1`。
- 容器：`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`。
- 内容：`flex justify-between items-center h-16`。
- 品牌组：`flex items-center space-x-2`。
- Logo：`w-8 h-8`，可做 `rotate: [0,4,-4,0]` 的 4 秒循环微动效。
- 品牌文本：`text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors`。
- 登录按钮：`px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2`。
- 登录按钮 focus：`focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2`。

## 12. 加载状态蓝图

统一使用 `LoadingCard`：

```tsx
<div className="w-full rounded-[36px] border border-white/70 bg-white/88 px-6 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-slate-100 text-slate-500"><Spinner /></div>
  <div className="mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400">Synapse Route</div>
  <h1 className="mt-3 text-xl font-semibold leading-tight text-slate-900 sm:text-2xl" />
  <p className="mt-3 text-sm leading-7 text-slate-600" />
</div>
```

- 路由加载外壳：`mx-auto flex min-h-[46vh] max-w-3xl items-center justify-center px-4 py-10`。
- App 全屏加载：`relative min-h-screen overflow-hidden` + 蓝色径向高光背景。
- 导航占位徽章：`h-10 w-10 rounded-[18px]`。
- 页脚占位徽章：`inline-flex items-center gap-3 rounded-full px-4 py-1.5`。
- 启动和首访加载应延迟 200ms 显示，避免快速路径闪屏。

## 13. 404 页面蓝图

- 外层：`section mx-auto max-w-4xl px-4 py-12 sm:py-20`。
- 主卡片：
  `relative overflow-hidden rounded-[34px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_28px_110px_rgba(15,23,42,0.1)] backdrop-blur-xl sm:p-10`。
- 装饰高光：两个绝对定位圆形径向渐变，右上蓝色、左下天蓝色。
- 标签：`inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500`。
- 路径显示：`rounded-[22px] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3`。
- 操作区：移动端纵向 `flex-col`，桌面 `sm:flex-row`。

## 14. 模态框蓝图

- 遮罩：`fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm`。
- 主体：`bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overscroll-contain`。
- 入场：`scale:0.9, opacity:0, y:20` 到 `scale:1, opacity:1, y:0`。
- 标题区：`flex items-start justify-between mb-6`。
- 关闭按钮：`rounded-full p-2 text-gray-400 hover:text-gray-600 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`。
- 必须使用 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`、`aria-describedby`。

## 15. 背景粒子

- 容器：`fixed inset-0 overflow-hidden pointer-events-none z-0`。
- 粒子：`absolute w-2 h-2 bg-indigo-200 rounded-full`，opacity 0.3。
- 数量：移动端 8 个，桌面 14 个。
- 动画：`particleMove`，12 到 28 秒线性无限循环。
- 浏览器标签不可见时暂停动画。

## 16. 水印遮罩

- 容器：`fixed inset-0 z-[99999] pointer-events-none overflow-hidden backdrop-blur-sm`。
- 斜向红色条纹：`rgba(255,0,0,0.18)`，背景尺寸 `200px 200px`。
- 水平细线：`rgba(0,0,0,0.08)`，间距 6px。
- 水印文本：`text-red-500/40 font-bold select-none whitespace-nowrap`。
- 网格密度：移动端 10 x 7，桌面 16 x 10。
- 移动端字号 14px，桌面 16px。
- 支持 `prefers-reduced-motion`，减弱动效时停止动画。

## 17. 路由动效

```ts
const pageVariants = {
  initial: { opacity: 0, y: 6, scale: 0.995 },
  in: { opacity: 1, y: 0, scale: 1 },
  out: { opacity: 0, y: -2, scale: 0.995 },
};
const PAGE_TRANSITION = { type: 'tween', ease: 'easeOut', duration: 0.22 };
const NAV_SPRING = { type: 'spring', stiffness: 100, damping: 20 };
const TOTP_SPRING = { type: 'spring', stiffness: 300, damping: 30 };
```

- 路由切换使用 `<AnimatePresence mode="wait">`。
- 每个页面包在 `m.div` 中，应用 `initial / animate / exit`。
- 用户开启 reduced motion 时，切页和模态动画 duration 应为 0 或禁用。
- 品牌 hover 使用 `scale:1.05`，tap 使用 `scale:0.95`。

## 18. 响应式规则

- 断点沿用 Tailwind：`sm`、`lg`，并额外支持 `xs:480px`。
- 导航和主内容在桌面扩展到 `max-w-7xl`，移动端保留 `px-4`。
- Toast 移动端最大宽度：`calc(100vw - 32px)`。
- 移动端 `button` 和 `[role="button"]` 最小触摸目标：44px x 44px。
- 模态框在移动端需要应用 safe-area padding。
- 可滚动容器使用 `-webkit-overflow-scrolling: touch`。

## 19. 可访问性规则

- 提供跳过链接：默认移出视口，focus 时回到顶部可见。
- 主内容区使用 `id="app-main-content"` 和 `tabIndex={-1}`。
- 加载状态使用 `role="status"`、`aria-live="polite"`、`aria-busy="true"`。
- 图标按钮必须有 `aria-label`，纯装饰 SVG 使用 `aria-hidden="true"`。
- 模态框必须可通过 Esc 或关闭按钮退出，并阻止点击内容区冒泡。
- focus ring 使用 2px ring + offset，不要只依赖颜色变化。

## 20. 复刻检查清单

- 页面根节点是浅灰渐变工作台，不是纯白页或深色页。
- 所有主容器都居中并限制在 `max-w-7xl`。
- 导航固定 64px 高，半透明白色，带 blur 和阴影。
- 主操作只使用 indigo，危险操作只使用 red/pink。
- 加载、404、弹窗都遵守白色玻璃态卡片规则。
- 路由切换只做轻微纵向位移、透明度和 0.995 缩放。
- reduced motion、标签页不可见暂停动画、移动端触摸目标均已处理。
- Toast 保持语义色和轻微上浮 hover，不引入新的通知风格。

## 21. 最终结论

复刻 `App.tsx` 的关键不是复制每个业务页面，而是复刻主壳层秩序：浅灰渐变背景、半透明白色导航、居中受限内容区、玻璃态状态卡、靛蓝主操作、Slate 文本层级、短促低幅度动效，以及完整的加载、错误、公告、Toast、模态和安全遮罩状态。只要这些 token 和蓝图一致，新页面就会自然融入现有 Synapse UI。
