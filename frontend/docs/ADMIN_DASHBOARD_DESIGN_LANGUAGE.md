# Admin Dashboard UI 设计语言文档

## 色彩体系

本设计基于浅色调色板，营造明亮、专业、清爽的管理后台视觉风格。

### 核心色板

| 语义名称 | Tailwind 写法 | 角色 |
|---------|--------------|------|
| Blue-50 | `blue-50` | 页面渐变背景起始色 — 营造柔和的浅蓝基调 |
| White | `white` | 页面渐变背景中间色 / 卡片主背景 — 干净明亮的基底 |
| Purple-50 | `purple-50` | 页面渐变背景结束色 — 与蓝色形成微妙的冷暖过渡 |
| Blue-600 | `blue-600` (`#2563eb`) | 强调色 / CTA — 按钮激活态、图标高亮、交互焦点 |
| Purple-600 | `purple-600` (`#9333ea`) | 渐变辅助色 — 头部横幅渐变终点 |
| Gray 系列 | `gray-50` ~ `gray-900` | 文字与边框层级体系 |

### 文字色层级

| 用途 | 写法 | 示例 |
|------|------|------|
| 主文字 | `text-gray-900` | 标题、区块标签 |
| 横幅文字 | `text-white` | 渐变头部上的标题 |
| 横幅副文字 | `text-blue-100` | 渐变头部上的副标题 |
| 次要文字 | `text-gray-600` | 非激活 Tab 文字 |
| 辅助文字 | `text-gray-500` | 管理员信息、ID |
| 占位/加载文字 | `text-gray-400` | Suspense fallback |
| 分隔符 | `text-gray-300` | 信息间的 `•` |

### 边框规范

| 用途 | 写法 |
|------|------|
| 卡片边框 | `border-gray-200` |
| 信息栏边框 | `border-gray-200` |
| 非激活 Tab 边框 | `border-gray-200` |
| Hover Tab 边框 | `border-blue-300` |

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

宋体（衬线体）仅用于标题级和标签级中文文字，与深色文字在浅色背景上呈现出清晰而克制的视觉质感。正文、数据、交互操作文字保持系统默认无衬线体，确保小字号下的清晰度和阅读效率。这种「标题衬线 + 正文无衬线」的混排策略在中文 UI 中能有效建立视觉层级。

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
┌─ 页面背景: bg-gradient-to-br from-blue-50 via-white to-purple-50
│
├── 卡片容器: bg-white/80 + backdrop-blur-sm + border-gray-200
│   ├── 头部横幅: bg-gradient-to-r from-blue-600 to-purple-600 (白色文字)
│   └── 内容区域: bg-gray-50
│
├── 功能区卡片: bg-white/80 + border-gray-200
│   ├── 标签栏标题: bg-gray-50 + border-gray-200
│   ├── 激活标签: bg-blue-600 + text-white + shadow-blue-600/20
│   └── 非激活标签: bg-gray-100 + text-gray-600 + border-gray-200
```

---

## 组件样式映射

### 页面背景
```
bg-gradient-to-br from-blue-50 via-white to-purple-50
```

### 卡片容器
```
bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200
```

### 头部横幅（渐变）
```
bg-gradient-to-r from-blue-600 to-purple-600 text-white
```

### 信息栏
```
bg-gray-50 (容器内嵌)
bg-gray-100 rounded-lg border border-gray-200 (标签)
```

### Tab 按钮 — 激活态
```
bg-blue-600 text-white shadow-lg shadow-blue-600/20
```

### Tab 按钮 — 默认态
```
bg-gray-100 text-gray-600 border border-gray-200
```

### Tab 按钮 — Hover 态
```
hover:bg-blue-50 hover:text-gray-900 hover:border-blue-300
```

### 主操作按钮（CTA）
```
bg-blue-600 text-white rounded-lg hover:bg-blue-700
```

### 加载动画
```
border-b-2 border-blue-600 animate-spin
```

### 图标色
```
主图标: text-blue-600
信息图标: text-blue-600
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

在 `tailwind.config.js` 中注册自定义字体（色彩使用 Tailwind 内置色板）：

```js
fontFamily: {
  'songti': ['"Noto Serif SC"', 'SimSun', 'STSong', 'FangSong', 'serif'],
}
```

色彩直接使用 Tailwind 内置的 `blue`、`purple`、`gray` 色板，无需自定义色值。

使用方式：`bg-blue-600`, `text-gray-900`, `border-gray-200`, `font-songti` 等。

---

## 设计原则

1. 浅色优先 — 蓝白紫渐变作为基底，营造明亮清爽的视觉体验
2. 清晰对比 — 深色文字在浅色背景上提供高可读性对比度
3. 焦点引导 — Blue-600 仅用于需要用户注意的元素（激活态、CTA、图标）
4. 层次分明 — 通过 white → gray-50 → gray-100 的层级变化构建空间深度
5. 克制渐变 — 仅在头部横幅使用 Blue-600 → Purple-600 渐变，避免过度装饰
6. 衬线点睛 — 宋体仅用于标题和标签级中文文字，正文保持无衬线体，建立清晰的排版层级