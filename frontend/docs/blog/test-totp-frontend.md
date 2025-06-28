---
title: 前端 TOTP 适配测试
date: 2025-06-27
slug: test-totp-frontend
---

# 前端 TOTP 适配测试

## 🧪 测试目标

验证前端是否正确适配了 `requiresTOTP: true` 响应，确保 TOTP 登录流程正常工作。

## 📋 测试用例

### 1. 正常登录流程（无 TOTP）

**测试步骤：**

1. 用户输入用户名和密码
2. 点击登录按钮
3. 后端返回 `{ user, token, requiresTOTP: false }`
4. 前端直接跳转到首页

**预期结果：**

- ✅ 登录成功
- ✅ 用户状态更新
- ✅ 跳转到首页
- ✅ 不显示 TOTP 验证界面

### 2. TOTP 登录流程

**测试步骤：**

1. 用户输入用户名和密码
2. 点击登录按钮
3. 后端返回 `{ user, token, requiresTOTP: true }`
4. 前端显示 TOTP 验证界面
5. 用户输入 6 位验证码
6. 验证成功后跳转到首页

**预期结果：**

- ✅ 显示 TOTP 验证模态框
- ✅ 支持验证码和恢复码切换
- ✅ 验证成功后跳转到首页
- ✅ 用户状态正确更新

### 3. TOTP 验证失败

**测试步骤：**

1. 执行 TOTP 登录流程
2. 输入错误的验证码
3. 点击验证按钮

**预期结果：**

- ✅ 显示错误信息
- ✅ 显示剩余尝试次数
- ✅ 达到限制后显示锁定信息

### 4. 手机端适配

**测试步骤：**

1. 在手机端执行 TOTP 登录流程
2. 验证界面显示和交互

**预期结果：**

- ✅ 界面响应式适配
- ✅ 支持滚动
- ✅ 触摸友好

## 🔧 代码检查点

### 1. useAuth.ts

```typescript
// ✅ 检查登录函数是否正确处理 requiresTOTP
const login = async (username: string, password: string) => {
  const response = await api.post("/api/auth/login", {
    identifier: username,
    password,
  });
  const { user, token, requiresTOTP } = response.data;

  if (requiresTOTP) {
    setPendingTOTP({ userId: user.id, token });
    return { requiresTOTP: true, user };
  } else {
    localStorage.setItem("token", token);
    setUser(user);
    navigate("/", { replace: true });
    return { requiresTOTP: false };
  }
};
```

### 2. AuthForm.tsx

```typescript
// ✅ 检查是否正确处理登录结果
if (isLogin) {
  const result = await login(sanitizedUsername, sanitizedPassword);
  if (result.requiresTOTP) {
    setPendingUser(result.user);
    setShowTOTPVerification(true);
    return;
  }
}
```

### 3. TOTPVerification.tsx

```typescript
// ✅ 检查验证成功后的处理
const handleVerify = async () => {
  await verifyTOTP(verificationCode, backupCode);
  onSuccess(); // 调用成功回调
};
```

## 🐛 已知问题和修复

### 1. 导航问题（已修复）

**问题：** 使用 `window.location.href` 而不是 React Router 的 `navigate`

**修复：**

```typescript
// 修复前
window.location.href = "/";

// 修复后
navigate("/", { replace: true });
```

### 2. 状态管理问题（已修复）

**问题：** TOTP 验证失败时没有正确清理状态

**修复：**

```typescript
// 在 catch 块中清理 pendingTOTP 状态
setPendingTOTP(null);
```

## 📱 手机端优化检查

### 1. 响应式设计

- ✅ 使用 Tailwind CSS 响应式类
- ✅ 模态框支持滚动
- ✅ 按钮在小屏幕上垂直排列

### 2. 触摸优化

- ✅ 合适的点击区域
- ✅ 清晰的视觉反馈
- ✅ 易于输入的验证码框

### 3. 滚动支持

- ✅ `overflow-y-auto` 实现滚动
- ✅ `max-h-[90vh]` 限制最大高度
- ✅ 防止内容溢出

## 🎯 测试结果

| 测试项目   | 状态    | 说明                   |
| ---------- | ------- | ---------------------- |
| 正常登录   | ✅ 通过 | 无 TOTP 用户正常登录   |
| TOTP 登录  | ✅ 通过 | 显示验证界面并成功验证 |
| 验证失败   | ✅ 通过 | 正确显示错误信息       |
| 手机端适配 | ✅ 通过 | 响应式设计和滚动支持   |
| 导航修复   | ✅ 通过 | 使用 React Router 导航 |
| 状态管理   | ✅ 通过 | 正确清理和更新状态     |

## 🚀 部署建议

1. **测试环境验证**

   - 在测试环境完整测试 TOTP 流程
   - 验证手机端体验
   - 检查错误处理

2. **生产环境部署**

   - 确保后端 TOTP 功能正常
   - 监控 TOTP 相关错误日志
   - 准备用户支持文档

3. **用户引导**
   - 提供 TOTP 设置指南
   - 说明支持的认证器应用
   - 强调恢复码的重要性

## 📝 总结

前端已成功适配 `requiresTOTP: true` 响应，TOTP 登录流程完整且用户友好。主要改进包括：

1. **完整的 TOTP 流程** - 从登录到验证的完整支持
2. **优秀的用户体验** - 响应式设计，支持手机端
3. **健壮的错误处理** - 完善的错误提示和状态管理
4. **正确的导航逻辑** - 使用 React Router 进行导航

用户现在可以流畅地使用 TOTP 二次验证功能！
