---
title: React 图片上传组件 XSS 风险与防护实战
slug: image_upload_xss_fix
date: 2025-07-10
---

# React 图片上传组件 XSS 风险与防护实战

## 背景

在前端开发中，文件上传组件常常会直接渲染用户选择的文件名。如果不加防护，理论上存在 XSS 风险，尤其是在后续有 HTML 解释或拼接的场景下。虽然 React 默认会对内容做转义，但安全开发应遵循“防御深度”原则。

## 问题定位

原始代码如下：

```tsx
<div className="text-sm text-gray-600 mt-2">
  {String(file.name)} ({(file.size / 1024).toFixed(1)} KB)
</div>
```

此处直接渲染 file.name，虽然大部分情况下安全，但如果未来代码被迁移到 innerHTML 或其他框架，或浏览器实现有变，理论上存在 XSS 注入隐患。

## 修复方案

采用自定义 escapeHtml 工具函数，对文件名进行 HTML 字符转义，确保无论任何渲染场景都不会被解释为 HTML。

### 1. 新增 escapeHtml 工具函数

```ts
// frontend/src/utils/escapeHtml.ts
// 简单的 HTML 转义函数，防止 XSS
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, function (tag) {
    const chars: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return chars[tag] || tag;
  });
}
```

### 2. 组件中使用 escapeHtml

```tsx
// frontend/src/components/ImageUploadPage.tsx
import { escapeHtml } from '../utils/escapeHtml';
...
<div className="text-sm text-gray-600 mt-2">{escapeHtml(String(file.name))} ({(file.size / 1024).toFixed(1)} KB)</div> // 文件名已做 HTML 转义，防止 XSS
```

## 技术细节说明

- **escapeHtml**：对 `& < > " '` 五类字符做转义，防止注入 HTML 标签或属性。
- **React 默认行为**：React 会自动转义花括号内的内容，但多一层保险可防止未来代码变更或迁移带来的隐患。
- **KISS & YAGNI**：实现简单、无依赖，专注当前需求。

## 安全建议

- 任何用户可控内容渲染到 DOM 时，建议都做转义处理。
- 避免使用 `dangerouslySetInnerHTML`，如必须用，务必对内容做严格过滤。
- 组件间复用 escapeHtml 工具，提升整体安全基线。

## 总结

本次修复通过引入 escapeHtml 工具函数，进一步加固了前端图片上传组件的安全性，防止潜在的 XSS 攻击。建议所有涉及用户输入渲染的场景都采用类似防护措施。
