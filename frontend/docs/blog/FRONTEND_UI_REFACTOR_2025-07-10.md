---
title: 前端 UI 动画重构与弹窗美化实践
date: 2025-07-10
slug: frontend_ui_refactor_2025_07_10
---

# 前端 UI 动画重构与弹窗美化实践

## 1. 目标与背景

近期对 Synapse 前端 UI 进行了大规模重构，目标：

- 移除所有 ./ui/Button、Card、Dialog、Input 等冗余组件，统一用 framer-motion 动画和原生标签实现。
- 所有弹窗、按钮、输入框均支持动画，体验更现代。
- 重要弹窗如公告、CredentialIdModal、二次验证等均支持自适应、移动端滑动、内容溢出滚动。
- 图片上传、短链生成、Passkey 相关功能体验升级。

## 2. 主要改动点与技术细节

### 2.1 统一 UI 组件为 motion 方案

- 所有按钮、弹窗、输入框全部用 `<motion.button>`、`<motion.div>`、`<motion.input>` 实现。
- 典型代码：

```tsx
<motion.button
  className="..."
  whileTap={{ scale: 0.97 }}
  whileHover={{ scale: 1.04 }}
  onClick={...}
>
  操作
</motion.button>
```

### 2.2 CredentialIdModal 纯 motion 实现

- 由 React 组件改为 `renderCredentialIdModal` 纯函数，支持复制按钮：

```tsx
export function renderCredentialIdModal({ open, credentialId, onClose }) {
  const [copied, setCopied] = useState(false);
  ...
  <motion.button onClick={handleCopy}>{copied ? '已复制' : '复制'}</motion.button>
}
```

### 2.3 图片上传页面美化与短链展示

- 上传成功后短链、原始链接均展示，短链可一键复制。
- 上传、移除按钮均为 motion.button，预览区有动画阴影。

```tsx
{
  uploadedShortUrl && (
    <motion.button onClick={() => handleCopy(uploadedShortUrl)}>
      复制
    </motion.button>
  );
}
```

### 2.4 公告弹窗自适应与滚动

- AnnouncementModal 新增 `contentClassName` props，内容区支持 `max-h-[60vh] overflow-y-auto`，移动端/桌面端均可滑动。
- App.tsx 用法：

```tsx
<AnnouncementModal ... contentClassName="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto px-2 sm:px-4" />
```

### 2.5 目录精简

- `/ui` 目录只保留 CredentialIdModal，其他全部删除。
- index.ts 只导出 `renderCredentialIdModal`。

## 3. 典型代码片段

#### 3.1 PasskeySetup 弹窗

```tsx
{
  renderCredentialIdModal({
    open: showModal,
    credentialId: currentCredentialId,
    onClose: () => setShowModal(false),
  });
}
```

#### 3.2 VerificationMethodSelector 动画弹窗

```tsx
<motion.div ...> ... <motion.button ...>取消</motion.button> ... </motion.div>
```

#### 3.3 TOTPVerification/TOTPSetup 动画输入框

```tsx
<motion.input ... whileFocus={{ scale: 1.02 }} />
```

## 4. 总结

本次重构极大提升了 UI 动画体验、代码一致性和维护性。所有弹窗、按钮、输入框均支持动画，且移动端适配良好。后续如需进一步美化或支持更多自定义，欢迎参考本博客代码片段。
