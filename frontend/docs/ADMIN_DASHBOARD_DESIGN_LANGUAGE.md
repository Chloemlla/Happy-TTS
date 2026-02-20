# Admin Dashboard UI 设计语言文档

## 色彩体系

本设计基于深蓝与琥珀暖色的对比色板，营造沉稳、专业、富有活力的管理后台视觉风格。

### 核心色板

| 语义名称 | 色值 | Tailwind 写法 | 角色 |
|---------|------|--------------|------|
| Light Blue | `#8ECAE6` | `[#8ECAE6]` | 页面渐变背景起始色 / Hover 态背景 — 柔和的浅蓝基调 |
| Teal Blue | `#219EBC` | `[#219EBC]` | 渐变辅助色 / 信息图标 — 头部横幅渐变终点、次要强调 |
| Dark Navy | `#023047` | `[#023047]` | 主文字色 / 深色背景 — 沉稳的深蓝底色，替代 gray-900 |
| Amber | `#FFB703` | `[#FFB703]` | 强调色 / CTA — 按钮激活态、图标高亮、交互焦点 |
| Orange | `#FB8500` | `[#FB8500]` | 渐变强调终点 / Hover 加深 — 按钮悬停态、渐变搭配 |
| White | `white` | `white` | 卡片主背景 — 干净明亮的基底 |

### 文字色层级

| 用途 | 色值 / 写法 | 示例 |
|------|------------|------|
| 主文字 | `text-[#023047]` | 标题、区块标签 |
| 横幅文字 | `text-white` | 渐变头部上的标题 |
| 横幅副文字 | `text-[#8ECAE6]` | 渐变头部上的副标题 |
| 次要文字 | `text-[#023047]/70` | 非激活 Tab 文字 |
| 辅助文字 | `text-[#023047]/50` | 管理员信息、ID |
| 占位/加载文字 | `text-[#023047]/30` | Suspense fallback |
| 分隔符 | `text-[#023047]/20` | 信息间的 `•` |

### 边框规范

| 用途 | 写法 |
|------|------|
| 卡片边框 | `border-[#8ECAE6]/30` |
| 信息栏边框 | `border-[#8ECAE6]/30` |
| 非激活 Tab 边框 | `border-[#8ECAE6]/30` |
| Hover Tab 边框 | `border-[#219EBC]` |

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
┌─ 页面背景: bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10
│
├── 卡片容器: bg-white/80 + backdrop-blur-sm + border-[#8ECAE6]/30
│   ├── 头部横幅: bg-gradient-to-r from-[#023047] to-[#219EBC] (白色文字)
│   └── 内容区域: bg-[#8ECAE6]/10
│
├── 功能区卡片: bg-white/80 + border-[#8ECAE6]/30
│   ├── 标签栏标题: bg-[#8ECAE6]/10 + border-[#8ECAE6]/30
│   ├── 激活标签: bg-[#FFB703] + text-[#023047] + shadow-[#FFB703]/20
│   └── 非激活标签: bg-[#8ECAE6]/10 + text-[#023047]/70 + border-[#8ECAE6]/30
```

---

## 组件样式映射

### 页面背景
```
bg-gradient-to-br from-[#8ECAE6]/20 via-white to-[#219EBC]/10
```

### 卡片容器
```
bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-[#8ECAE6]/30
```

### 头部横幅（渐变）
```
bg-gradient-to-r from-[#023047] to-[#219EBC] text-white
```

### 信息栏
```
bg-[#8ECAE6]/10 (容器内嵌)
bg-[#8ECAE6]/15 rounded-lg border border-[#8ECAE6]/30 (标签)
```

### Tab 按钮 — 激活态
```
bg-[#FFB703] text-[#023047] shadow-lg shadow-[#FFB703]/20
```

### Tab 按钮 — 默认态
```
bg-[#8ECAE6]/10 text-[#023047]/70 border border-[#8ECAE6]/30
```

### Tab 按钮 — Hover 态
```
hover:bg-[#8ECAE6]/20 hover:text-[#023047] hover:border-[#219EBC]
```

### 主操作按钮（CTA）
```
bg-[#FFB703] text-[#023047] rounded-lg hover:bg-[#FB8500]
```

### 加载动画
```
border-b-2 border-[#FFB703] animate-spin
```

### 图标色
```
主图标: text-[#FFB703]
信息图标: text-[#219EBC]
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

在 `tailwind.config.js` 中注册自定义字体和色彩：

```js
theme: {
  extend: {
    colors: {
      'brand-light': '#8ECAE6',
      'brand-teal': '#219EBC',
      'brand-navy': '#023047',
      'brand-amber': '#FFB703',
      'brand-orange': '#FB8500',
    },
    fontFamily: {
      'songti': ['"Noto Serif SC"', 'SimSun', 'STSong', 'FangSong', 'serif'],
    },
  },
}
```

注册后可使用语义化写法：`bg-brand-amber`, `text-brand-navy`, `border-brand-light` 等，也可继续使用任意值写法 `[#8ECAE6]`。

---

## 设计原则

1. 冷暖对比 — 深蓝 (`#023047`) 与琥珀 (`#FFB703`) 形成鲜明的冷暖对比，视觉张力强
2. 清晰对比 — 深蓝文字在浅色背景上提供高可读性对比度
3. 焦点引导 — 琥珀黄 (`#FFB703`) 仅用于需要用户注意的元素（激活态、CTA、图标）
4. 层次分明 — 通过 white → `#8ECAE6`/10 → `#8ECAE6`/15 的层级变化构建空间深度
5. 克制渐变 — 仅在头部横幅使用 `#023047` → `#219EBC` 渐变，避免过度装饰
6. 衬线点睛 — 宋体仅用于标题和标签级中文文字，正文保持无衬线体，建立清晰的排版层级
