# Admin Dashboard UI 设计语言文档

## 色彩体系

本设计基于五色调色板，营造深沉、专业、具有权威感的管理后台视觉风格。

### 核心色板

| 语义名称 | 色值 | HSL | 角色 |
|---------|------|-----|------|
| Ink Black | `#04151f` | `hsla(202, 77%, 7%, 1)` | 主背景色 — 页面底层，营造深邃沉稳的基调 |
| Dark Slate | `#183a37` | `hsla(175, 41%, 16%, 1)` | 容器/卡片背景 — 在 Ink Black 之上形成层次 |
| Wheat | `#efd6ac` | `hsla(38, 68%, 81%, 1)` | 主文字色 / 前景色 — 温暖的浅色调，用于标题、正文、图标 |
| Burnt Orange | `#c44900` | `hsla(22, 100%, 38%, 1)` | 强调色 / CTA — 按钮激活态、图标高亮、交互焦点 |
| Midnight Violet | `#432534` | `hsla(330, 29%, 20%, 1)` | 辅助深色 — 渐变过渡、头部背景、次级容器 |

### 透明度规范

| 用途 | 写法 | 示例 |
|------|------|------|
| 主文字 | `text-wheat` | 标题、按钮文字 |
| 次要文字 | `text-wheat/70` | 副标题、描述 |
| 辅助文字 | `text-wheat/60` | 管理员信息、ID |
| 占位/加载文字 | `text-wheat/40` | Suspense fallback |
| 分隔符 | `text-wheat/30` | 信息间的 `•` |
| 边框 | `border-wheat/10` | 卡片、输入框边框 |

---

## 字体体系

### 字体栈定义

```js
fontFamily: {
  'songti': ['"Noto Serif SC"', 'SimSun', 'STSong', 'FangSong', 'serif'],
}
```

Tailwind class: `font-songti`

### 字体分工

| 场景 | 字体 | 说明 |
|------|------|------|
| 页面主标题 | `font-songti` | "管理后台" — 宋体赋予标题庄重的中文排版气质 |
| 副标题 | `font-songti` | "系统管理与配置中心" — 与主标题保持视觉统一 |
| 区块标签 | `font-songti` | "管理员信息"、"管理功能" — 宋体强调区块语义 |
| Tab 标签文字 | `font-songti` | 所有导航标签 — 宋体增强中文标签的辨识度 |
| 拒绝访问标题 | `font-songti` | "访问被拒绝" — 保持全局标题风格一致 |
| 正文/数据/ID | 系统无衬线 | 管理员名称、ID、按钮操作文字 — 无衬线体保证小字号可读性 |
| 加载提示 | 系统无衬线 | "加载中…"、"正在验证…" — 功能性文字不需要装饰 |

### 设计意图

宋体（衬线体）仅用于标题级和标签级中文文字，与 Wheat 色搭配在深色背景上呈现出古典而克制的视觉质感。正文、数据、交互操作文字保持系统默认无衬线体，确保小字号下的清晰度和阅读效率。这种「标题衬线 + 正文无衬线」的混排策略在中文 UI 中能有效建立视觉层级。

### 字体回退链

`Noto Serif SC` → `SimSun` → `STSong` → `FangSong` → `serif`

- Noto Serif SC: Google 开源宋体，跨平台覆盖最广
- SimSun: Windows 系统内置宋体
- STSong: macOS 系统内置华文宋体
- FangSong: 仿宋作为最终中文回退
- serif: 通用衬线回退

---

## 层级结构

```
┌─ 页面背景: bg-ink-black
│
├── 卡片容器: bg-dark-slate/80 + backdrop-blur-sm
│   ├── 头部横幅: bg-gradient-to-r from-midnight-violet to-dark-slate
│   └── 内容区域: bg-ink-black/40
│
├── 功能区卡片: bg-dark-slate/80
│   ├── 标签栏标题: bg-ink-black/40 + border-wheat/10
│   ├── 激活标签: bg-burnt-orange + shadow-burnt-orange/20
│   └── 非激活标签: bg-ink-black/60 + border-wheat/10
```

---

## 组件样式映射

### 页面背景
```
bg-ink-black
```

### 卡片容器
```
bg-dark-slate/80 backdrop-blur-sm rounded-2xl shadow-xl border border-wheat/10
```

### 头部横幅（渐变）
```
bg-gradient-to-r from-midnight-violet to-dark-slate text-wheat
```

### 信息栏
```
bg-ink-black/40 (容器内嵌)
bg-dark-slate/60 rounded-lg border border-wheat/10 (标签)
```

### Tab 按钮 — 激活态
```
bg-burnt-orange text-wheat shadow-lg shadow-burnt-orange/20
```

### Tab 按钮 — 默认态
```
bg-ink-black/60 text-wheat/70 border border-wheat/10
```

### Tab 按钮 — Hover 态
```
hover:bg-midnight-violet/40 hover:text-wheat hover:border-burnt-orange/30
```

### 主操作按钮（CTA）
```
bg-burnt-orange text-wheat rounded-lg hover:bg-burnt-orange/80
```

### 加载动画
```
border-b-2 border-burnt-orange animate-spin
```

### 图标色
```
主图标: text-burnt-orange
信息图标: text-burnt-orange
```

---

## 交互动效

| 交互 | 动效 | 参数 |
|------|------|------|
| 卡片入场 | 淡入 + 上移 | `opacity: 0→1, y: 20→0, duration: 0.6s` |
| Tab 切换内容 | 水平滑入/滑出 | `x: 40→0 (入), x: 0→-40 (出), duration: 0.25s` |
| 按钮点击 | 缩放 | `whileTap: scale(0.95~0.96)` |
| 按钮悬停 | 放大 | `whileHover: scale(1.05)` |
| 标题入场 | 缩放 | `scale: 0.9→1, duration: 0.5s, delay: 0.2s` |
| 副标题入场 | 淡入 | `opacity: 0→1, duration: 0.5s, delay: 0.4s` |

---

## Tailwind 配置

在 `tailwind.config.js` 中注册自定义色值与字体：

```js
colors: {
  'ink-black': '#04151f',
  'dark-slate': '#183a37',
  'wheat': '#efd6ac',
  'burnt-orange': '#c44900',
  'midnight-violet': '#432534',
},
fontFamily: {
  'songti': ['"Noto Serif SC"', 'SimSun', 'STSong', 'FangSong', 'serif'],
}
```

使用方式：`bg-ink-black`, `text-wheat`, `border-burnt-orange/30`, `font-songti` 等，支持 Tailwind 原生透明度修饰符。

---

## 设计原则

1. 深色优先 — Ink Black 作为基底，所有内容在暗色上浮现，减少视觉疲劳
2. 温暖对比 — Wheat 文字在深色背景上提供舒适的阅读对比度
3. 焦点引导 — Burnt Orange 仅用于需要用户注意的元素（激活态、CTA、图标）
4. 层次分明 — 通过 Dark Slate → Ink Black 的透明度变化构建空间深度
5. 克制渐变 — 仅在头部横幅使用 Midnight Violet → Dark Slate 渐变，避免过度装饰
6. 衬线点睛 — 宋体仅用于标题和标签级中文文字，正文保持无衬线体，建立清晰的排版层级
