# 前端设计范式文档

本文档记录项目中已形成共识的 UI / 交互设计范式，供新组件开发时参照。

> 色彩体系、字体体系等基础视觉规范请参阅 [ADMIN_DASHBOARD_DESIGN_LANGUAGE.md](./ADMIN_DASHBOARD_DESIGN_LANGUAGE.md)。

---

## 1. Portal 弹窗：逃逸 `backdrop-blur` 产生的 Stacking Context

### 问题

页面中大量卡片容器使用了 `backdrop-blur-sm`（如 `bg-white/80 backdrop-blur-sm`）。根据 CSS 规范，`backdrop-filter` 会创建新的 **stacking context**，导致其内部的 `position: fixed` 弹窗无法突破父容器的层叠限制，即使设置了极高的 `z-index` 也会被裁剪或遮挡。

### 解决方案

使用 `ReactDOM.createPortal` 将弹窗渲染到 `document.body`，使其脱离原有 DOM 层级。

### 标准写法

```tsx
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

{/* Portal 到 body 以逃逸 backdrop-blur 产生的 stacking context */}
{ReactDOM.createPortal(
  <AnimatePresence>
    {visible && (
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-2 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}           // 点击遮罩关闭
      >
        <motion.div
          className="bg-white/90 backdrop-blur rounded-2xl max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6 border border-white/20 shadow-xl"
          initial={{ scale: 0.95, y: 10, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 10, opacity: 0 }}
          onClick={e => e.stopPropagation()}  // 阻止冒泡到遮罩
          data-source-modal="my-modal-name"   // 标识弹窗来源
        >
          {/* 弹窗头部 */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <div className="font-semibold text-gray-900">标题</div>
            <button onClick={onClose} className="px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium flex items-center gap-2">
              <FaTimes className="w-4 h-4" /> 关闭
            </button>
          </div>
          {/* 弹窗内容（可滚动） */}
          <div className="flex-1 overflow-auto min-h-0">
            {/* ... */}
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>,
  document.body
)}
```

### 关键要素

| 要素 | 值 | 说明 |
|------|-----|------|
| Portal 目标 | `document.body` | 脱离 stacking context |
| 遮罩层 z-index | `z-[9999]` | 高于页面所有内容 |
| 遮罩背景 | `bg-black/50 backdrop-blur-sm` | 半透明 + 模糊 |
| 弹窗容器 | `bg-white/90 backdrop-blur rounded-2xl` | 毛玻璃效果 |
| 弹窗宽度 | `max-w-3xl w-[95vw]` | 桌面端限宽，移动端几乎全屏 |
| 弹窗高度 | `max-h-[90vh] flex flex-col` | 限高 + flex 布局实现内部滚动 |
| 内容滚动 | `flex-1 overflow-auto min-h-0` | 头部固定，内容区独立滚动 |
| `data-source-modal` | 自定义字符串 | 用于自动滚动定位和调试 |

### 使用此模式的组件

- `WebhookEventsManager` — 事件详情、编辑/创建弹窗
- `UserManagement` — 指纹详情弹窗
- `SmartHumanCheckTraces` — 日志详情、批量合并查看
- `ModListEditor` — 添加/修改/删除/批量操作弹窗
- `LogShare` — 密码弹窗、归档弹窗、编辑元数据
- `IPBanManager` — 封禁/解封确认弹窗
- `FBIWantedManager` — 创建/编辑/查看通缉犯
- `DataCollectionManager` — 查看/创建/批量查看
- `MobileNav` — 下拉菜单（遮罩 `z-[9998]` + 菜单 `z-[9999]`）

---

## 2. 弹窗全屏覆盖与内部滚动

### 遮罩层

```
fixed inset-0 — 覆盖整个视口
flex items-center justify-center — 弹窗居中
p-2 sm:p-4 — 移动端留 8px 边距，桌面端 16px
```

### 弹窗体

```
w-[95vw] — 移动端占据 95% 视口宽度
max-w-2xl / max-w-3xl / max-w-5xl — 桌面端限制最大宽度
max-h-[90vh] — 限制最大高度为视口 90%
flex flex-col — 纵向 flex 布局
```

### 内部滚动

```tsx
{/* 头部：固定不滚动 */}
<div className="flex items-center justify-between mb-3 flex-shrink-0">
  ...
</div>
{/* 内容：独立滚动 */}
<div className="flex-1 overflow-auto min-h-0">
  ...
</div>
```

`min-h-0` 是关键——flex 子元素默认 `min-height: auto`，会阻止 `overflow` 生效。

---

## 3. 弹窗动画

### 标准进出场动画

```tsx
// 遮罩层
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}

// 弹窗体
initial={{ scale: 0.95, y: 10, opacity: 0 }}
animate={{ scale: 1, y: 0, opacity: 1 }}
exit={{ scale: 0.95, y: 10, opacity: 0 }}
```

### AnimatePresence 包裹

`AnimatePresence` 必须包裹在 `createPortal` 内部，确保退出动画能正常播放：

```tsx
{ReactDOM.createPortal(
  <AnimatePresence>
    {visible && ( <motion.div ... /> )}
  </AnimatePresence>,
  document.body
)}
```

---

## 4. 无障碍动画降级（Reduced Motion）

使用 `useReducedMotion` 检测用户系统偏好，在 `prefers-reduced-motion: reduce` 时禁用缩放动画：

```tsx
import { useReducedMotion } from 'framer-motion';

const prefersReducedMotion = useReducedMotion();

const hoverScale = React.useCallback((scale: number, enabled = true) => (
  enabled && !prefersReducedMotion ? { scale } : undefined
), [prefersReducedMotion]);

const tapScale = React.useCallback((scale: number, enabled = true) => (
  enabled && !prefersReducedMotion ? { scale } : undefined
), [prefersReducedMotion]);

// 使用
<motion.button
  whileHover={hoverScale(1.02)}
  whileTap={tapScale(0.98)}
>
```

---

## 5. Z-Index 层级规范

| 层级 | z-index | 用途 |
|------|---------|------|
| 页面内容 | 默认 | 正常文档流 |
| 固定导航 | `z-50` | 顶部导航栏 |
| 浮动组件 | `z-50` | WsConnector 等固定位置组件 |
| 固定头部 | `z-[1000]` | 特殊页面固定头部 |
| Portal 遮罩 | `z-[9998]` | MobileNav 背景遮罩 |
| Portal 弹窗 | `z-[9999]` | 所有 Portal 弹窗统一层级 |
| 极端情况 | `z-[99999]` | ModListEditor 等需要覆盖一切的弹窗 |

---

## 6. 移动端适配范式

### 6.1 响应式断点策略

项目采用 Tailwind 默认断点，移动优先：

| 断点 | 宽度 | 典型设备 |
|------|------|---------|
| 默认 | < 640px | 手机 |
| `sm:` | ≥ 640px | 大屏手机 / 小平板 |
| `md:` | ≥ 768px | 平板 |
| `lg:` | ≥ 1024px | 桌面 |

### 6.2 移动端卡片 vs 桌面端表格

数据列表在移动端使用卡片布局，桌面端使用表格：

```tsx
{/* 移动端卡片 */}
<div className="block md:hidden divide-y divide-gray-100">
  {items.map(item => (
    <div key={item.id} className="p-4">
      {/* 卡片内容 */}
    </div>
  ))}
</div>

{/* 桌面端表格 */}
<div className="hidden md:block overflow-x-auto">
  <table className="min-w-full text-xs sm:text-sm table-fixed">
    {/* 表格内容 */}
  </table>
</div>
```

### 6.3 响应式布局方向

水平布局在移动端切换为垂直：

```
flex flex-col sm:flex-row          — 方向切换
gap-2 sm:gap-4                     — 间距缩放
grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4  — 网格列数递增
```

### 6.4 响应式间距与尺寸

```
p-2 sm:p-4          — 容器内边距
p-3 sm:p-4          — 卡片内边距
p-4 sm:p-6          — 弹窗内边距
px-3 sm:px-4        — 按钮水平内边距
text-xs sm:text-sm  — 文字大小
text-lg sm:text-2xl — 标题/数字大小
w-6 h-6 sm:w-8 sm:h-8 — 图标大小
```

### 6.5 触摸目标

移动端按钮增大点击区域（建议最小 44×44px）：

```
p-2 sm:p-1.5  — 移动端更大的 padding
py-2 sm:py-3  — 更高的按钮
```

### 6.6 移动端文本省略

```
truncate                    — 单行省略
line-clamp-2                — 两行省略
max-w-[120px] sm:max-w-none — 移动端限宽截断
```

### 6.7 移动端按钮文字隐藏

小屏幕只显示图标，大屏幕显示图标+文字：

```tsx
<button>
  <FaSyncAlt /> <span className="hidden sm:inline">刷新</span>
</button>
```

### 6.8 浮动组件定位

```
fixed bottom-4 right-4 max-sm:bottom-2 max-sm:right-2
w-80 max-sm:w-[calc(100vw-1rem)]
```

---

## 7. `data-source-modal` 标识

每个 Portal 弹窗的内容容器上添加 `data-source-modal` 属性，用于：

1. 自动滚动定位（`EnvManager` 中使用 `document.querySelector('[data-source-modal]')` 定位弹窗）
2. 调试时快速识别弹窗来源

命名规范：`{组件名}-{功能}`，如 `webhook-event-detail`、`data-collection-create`。

---

## 8. 卡片容器标准样式

### 毛玻璃卡片（页面内容区）

```
bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20
```

### 渐变头部横幅

```
bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6
```

### 统计卡片网格

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
  <div className="bg-green-50 rounded-lg p-3 sm:p-4 border border-green-200">
    <div className="flex items-center justify-between gap-2">
      <FaIcon className="w-6 h-6 sm:w-8 sm:h-8 text-green-500 flex-shrink-0" />
      <span className="text-lg sm:text-2xl font-bold text-green-700">值</span>
    </div>
    <p className="text-xs sm:text-sm text-gray-600 mt-2">标签</p>
  </div>
</div>
```

---

## 9. 搜索栏与筛选面板

### 搜索栏

```tsx
<div className="flex flex-wrap items-center gap-2">
  {/* 搜索输入 — 移动端全宽 */}
  <div className="flex-1 min-w-0 w-full sm:w-auto relative">
    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
    <input className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm ..." />
  </div>
  {/* 操作按钮组 — 移动端另起一行 */}
  <div className="flex items-center gap-2 w-full sm:w-auto">
    <button className="flex-1 sm:flex-none ...">筛选</button>
    <button className="flex-1 sm:flex-none ...">搜索</button>
    <button>刷新图标</button>
  </div>
</div>
```

### 筛选面板

```tsx
<div className="flex flex-wrap gap-2 sm:gap-3 p-3 bg-gray-50 rounded-lg">
  <select className="flex-1 sm:flex-none min-w-[120px] ..." />
  <div className="flex items-center gap-2 w-full sm:w-auto">
    <input type="date" className="flex-1 sm:flex-none ..." />
    <span>至</span>
    <input type="date" className="flex-1 sm:flex-none ..." />
  </div>
  <button>重置</button>
</div>
```

---

## 10. 分页组件

```tsx
<div className="flex items-center justify-between text-xs sm:text-sm">
  <span className="text-gray-500">共 {total} 条，{page}/{totalPages} 页</span>
  <div className="flex items-center gap-1">
    <button disabled={page <= 1} className="px-2 py-1 rounded border ...">
      <FaChevronLeft />
    </button>
    <button disabled={page >= totalPages} className="px-2 py-1 rounded border ...">
      <FaChevronRight />
    </button>
  </div>
</div>
```
