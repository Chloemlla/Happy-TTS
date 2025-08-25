---
title: LibreChat 消息编辑支持 VSCode Dark+ 主题代码编辑器
date: 2025-08-27
slug: librechat-code-editor
tags: [librechat, code-editor, vscode, dark-theme, frontend, feature, blog]
---

# LibreChat 消息编辑支持 VSCode Dark+ 主题代码编辑器

## 功能概述

LibreChat 页面现在支持使用 VSCode Dark+ 主题的代码编辑器进行消息编辑，为用户提供更好的代码编辑体验。

## 主要特性

### 🎨 VSCode Dark+ 主题

- 采用与 VSCode 一致的深色主题配色方案
- 专业的代码编辑界面，减少视觉疲劳
- 支持多种编程语言的语法高亮

### 🔍 智能语言检测

编辑器能够自动检测内容类型并应用相应的语法高亮：

- **JSON**: 自动识别 JSON 格式并高亮
- **JavaScript/TypeScript**: 支持 JS/TS 语法高亮
- **HTML/CSS**: 网页开发语言支持
- **SQL**: 数据库查询语言
- **Python**: Python 脚本语言
- **Bash**: Shell 脚本
- **Markdown**: 文档标记语言

### 📝 编辑器功能

- **行号显示**: 清晰的行号标识
- **语法高亮**: 实时语法高亮显示
- **自动换行**: 长行自动换行显示
- **复制功能**: 一键复制编辑内容
- **视图切换**: 在语法高亮和原始文本间切换
- **全屏编辑**: 支持展开到全屏模式编辑

### 🎯 用户体验优化

- **自动聚焦**: 打开编辑器时自动聚焦到编辑区域
- **键盘快捷键**: 支持 Escape 键关闭，Enter 键确认
- **字符计数**: 实时显示字符数量
- **响应式设计**: 适配不同屏幕尺寸

## 使用方法

### 1. 编辑消息

1. 在聊天历史中找到要编辑的消息
2. 点击消息下方的"编辑"按钮
3. 在弹出的代码编辑器中修改内容
4. 点击"确定"保存修改

### 2. 编辑器操作

- **复制内容**: 点击右上角的复制图标
- **切换视图**: 点击眼睛图标在语法高亮和原始文本间切换
- **全屏编辑**: 点击展开图标进入全屏模式
- **关闭编辑器**: 点击右上角的关闭按钮或按 Escape 键

### 3. 测试功能

页面提供了"测试编辑器"按钮，可以体验代码编辑器的各项功能。

## 技术实现

### 前端组件

- **PromptModal**: 增强的模态框组件，支持代码编辑器模式
- **SyntaxHighlighter**: 基于 react-syntax-highlighter 的语法高亮
- **VSCode Dark+ 主题**: 使用 vscDarkPlus 主题配置

### 支持的语言

```typescript
// 已注册的语言模块
SyntaxHighlighter.registerLanguage("json", jsonLang);
SyntaxHighlighter.registerLanguage("javascript", jsLang);
SyntaxHighlighter.registerLanguage("typescript", tsLang);
SyntaxHighlighter.registerLanguage("css", cssLang);
SyntaxHighlighter.registerLanguage("html", htmlLang);
SyntaxHighlighter.registerLanguage("sql", sqlLang);
SyntaxHighlighter.registerLanguage("python", pythonLang);
SyntaxHighlighter.registerLanguage("bash", bashLang);
SyntaxHighlighter.registerLanguage("markdown", markdownLang);
```

### 语言检测算法

```typescript
const detectLanguage = (content: string): string => {
  if (!content) return "text";

  const trimmed = content.trim();

  // JSON检测
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {}
  }

  // JavaScript/TypeScript检测
  if (trimmed.includes("function") || trimmed.includes("const ")) {
    if (trimmed.includes("interface ") || trimmed.includes("type ")) {
      return "typescript";
    }
    return "javascript";
  }

  // 其他语言检测...

  return "text";
};
```

## 界面展示

### 编辑器界面

```
┌─────────────────────────────────────────────────────────┐
│ ✏️ 编辑消息                    [复制] [视图] [展开] [×] │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 1  // 这是一个JavaScript示例                        │ │
│ │ 2  function greet(name) {                           │ │
│ │ 3    return `Hello, ${name}!`;                      │ │
│ │ 4  }                                                │ │
│ │ 5                                                   │ │
│ │ 6  const user = "World";                            │ │
│ │ 7  console.log(greet(user));                        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [取消]                    [确定]                        │
└─────────────────────────────────────────────────────────┘
```

### 功能按钮说明

- **复制**: 复制当前编辑内容到剪贴板
- **视图**: 切换语法高亮和原始文本视图
- **展开**: 进入全屏编辑模式
- **关闭**: 关闭编辑器（不保存）

## 配置选项

### PromptModal 组件属性

```typescript
interface PromptModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
  maxLength?: number;
  codeEditor?: boolean; // 启用代码编辑器模式
  language?: string; // 指定语言或 'auto' 自动检测
}
```

### 使用示例

```typescript
setPromptModal({
  open: true,
  title: "编辑消息",
  message: "请输入新的消息内容：",
  placeholder: "请输入消息内容",
  defaultValue: current || "",
  codeEditor: true, // 启用代码编辑器
  language: "auto", // 自动检测语言
  maxLength: MAX_MESSAGE_LEN,
  onConfirm: async (content: string) => {
    // 处理确认逻辑
  },
});
```

## 兼容性

### 浏览器支持

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 12+
- ✅ Edge 79+

### 功能降级

- 在不支持 EventSource 的浏览器中，SSE 功能会自动降级
- 在不支持 Clipboard API 的浏览器中，复制功能使用 document.execCommand 降级

## 未来计划

### 即将推出的功能

- [ ] 代码片段库支持
- [ ] 多光标编辑
- [ ] 代码格式化
- [ ] 语法错误检查
- [ ] 自定义主题支持
- [ ] 快捷键自定义

### 性能优化

- [ ] 大文件编辑优化
- [ ] 虚拟滚动支持
- [ ] 懒加载语法高亮
- [ ] 内存使用优化

## 总结

LibreChat 的 VSCode Dark+ 主题代码编辑器为用户提供了专业的代码编辑体验，特别适合编辑包含代码、配置或结构化数据的消息。通过智能语言检测和丰富的编辑功能，大大提升了消息编辑的效率和用户体验。

---

**相关链接**

- [LibreChat 项目主页](https://github.com/danny-avila/LibreChat)
- [VSCode 主题参考](https://code.visualstudio.com/docs/getstarted/themes)
- [React Syntax Highlighter 文档](https://react-syntax-highlighter.github.io/react-syntax-highlighter/)
