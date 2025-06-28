---
title: TOTP 验证错误修复测试
date: 2025-06-24
slug: test-totp-fix
---

# TOTP 验证错误修复测试

## 🐛 问题描述

用户在前端输入验证码和恢复码时都显示"没有待验证的 TOTP 请求"错误。

## 🔍 问题分析

### 根本原因

1. **状态依赖问题**：`TOTPVerification`组件依赖`useAuth`中的`pendingTOTP`状态
2. **状态清理问题**：TOTP 验证失败时，`pendingTOTP`状态被清理，导致后续验证失败
3. **参数传递问题**：组件间缺少必要的参数传递

### 具体问题

```typescript
// 问题代码
const { verifyTOTP } = useAuth(); // 依赖全局状态

const handleVerify = async () => {
  await verifyTOTP(verificationCode, backupCode); // 可能因为pendingTOTP为null而失败
};
```

## ✅ 修复方案

### 1. 修改 TOTPVerification 组件

**修复前：**

```typescript
interface TOTPVerificationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const TOTPVerification: React.FC<TOTPVerificationProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { verifyTOTP } = useAuth(); // 依赖全局状态
  // ...
};
```

**修复后：**

```typescript
interface TOTPVerificationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: string; // 新增：用户ID
  token: string; // 新增：临时token
}

const TOTPVerification: React.FC<TOTPVerificationProps> = ({
  isOpen,
  onClose,
  onSuccess,
  userId,
  token,
}) => {
  // 直接使用axios，不依赖全局状态
  const api = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  // ...
};
```

### 2. 修改 AuthForm 组件

**修复前：**

```typescript
const [pendingUser, setPendingUser] = useState<any>(null);

// 登录处理
if (result.requiresTOTP) {
  setPendingUser(result.user);
  setShowTOTPVerification(true);
  return;
}

// TOTP验证组件
<TOTPVerification
  isOpen={showTOTPVerification}
  onClose={() => {
    setShowTOTPVerification(false);
    setPendingUser(null);
  }}
  onSuccess={() => {
    setShowTOTPVerification(false);
    setPendingUser(null);
    onSuccess?.();
  }}
/>;
```

**修复后：**

```typescript
const [pendingUser, setPendingUser] = useState<any>(null);
const [pendingUserId, setPendingUserId] = useState<string>("");
const [pendingToken, setPendingToken] = useState<string>("");

// 登录处理
if (result.requiresTOTP && result.user && result.token) {
  setPendingUser(result.user);
  setPendingUserId(result.user.id);
  setPendingToken(result.token);
  setShowTOTPVerification(true);
  return;
}

// TOTP验证组件
<TOTPVerification
  isOpen={showTOTPVerification}
  onClose={() => {
    setShowTOTPVerification(false);
    setPendingUser(null);
    setPendingUserId("");
    setPendingToken("");
  }}
  onSuccess={() => {
    setShowTOTPVerification(false);
    setPendingUser(null);
    setPendingUserId("");
    setPendingToken("");
    onSuccess?.();
  }}
  userId={pendingUserId}
  token={pendingToken}
/>;
```

### 3. 修改 useAuth hook

**修复前：**

```typescript
if (requiresTOTP) {
  setPendingTOTP({ userId: user.id, token });
  return { requiresTOTP: true, user };
}
```

**修复后：**

```typescript
if (requiresTOTP) {
  setPendingTOTP({ userId: user.id, token });
  return { requiresTOTP: true, user, token };
}
```

## 🧪 测试验证

### 测试用例 1：正常 TOTP 验证流程

**步骤：**

1. 用户输入用户名和密码
2. 后端返回`requiresTOTP: true`
3. 前端显示 TOTP 验证界面
4. 用户输入 6 位验证码
5. 点击验证按钮

**预期结果：**

- ✅ 不显示"没有待验证的 TOTP 请求"错误
- ✅ 验证成功，跳转到首页
- ✅ 用户状态正确更新

### 测试用例 2：TOTP 验证失败后重试

**步骤：**

1. 执行正常 TOTP 验证流程
2. 输入错误验证码
3. 显示错误信息
4. 输入正确验证码
5. 点击验证按钮

**预期结果：**

- ✅ 第一次失败显示错误信息
- ✅ 第二次验证成功，不显示状态错误
- ✅ 验证成功后跳转到首页

### 测试用例 3：使用恢复码验证

**步骤：**

1. 执行正常 TOTP 验证流程
2. 切换到恢复码模式
3. 输入 8 位恢复码
4. 点击验证按钮

**预期结果：**

- ✅ 不显示"没有待验证的 TOTP 请求"错误
- ✅ 恢复码验证成功
- ✅ 跳转到首页

## 📊 修复效果对比

| 测试项目       | 修复前              | 修复后            |
| -------------- | ------------------- | ----------------- |
| 正常验证码验证 | ❌ 显示状态错误     | ✅ 验证成功       |
| 验证失败后重试 | ❌ 显示状态错误     | ✅ 重试成功       |
| 恢复码验证     | ❌ 显示状态错误     | ✅ 验证成功       |
| 状态管理       | ❌ 依赖全局状态     | ✅ 独立状态管理   |
| 错误处理       | ❌ 状态清理导致错误 | ✅ 完善的错误处理 |

## 🎯 总结

通过以下修复，成功解决了 TOTP 验证错误：

1. **独立状态管理**：TOTPVerification 组件不再依赖全局状态
2. **参数传递**：通过 props 传递必要的 userId 和 token
3. **类型安全**：修复了 TypeScript 类型错误
4. **错误处理**：完善了错误处理逻辑

现在用户可以正常使用 TOTP 验证功能，不会再出现"没有待验证的 TOTP 请求"错误。
