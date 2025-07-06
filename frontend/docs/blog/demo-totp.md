---
title: TOTP 二次验证功能演示
date: 2025-06-24
slug: demo-totp
tags: [security, totp, demo, feature]
---

# TOTP 二次验证功能演示

## 🎯 功能概述

本系统已成功实现完整的 TOTP（基于时间的一次性密码）二次验证功能，为用户账户提供额外的安全保护。

## 🚀 快速开始

### 1. 用户注册和登录

```bash
# 1. 注册新用户
POST /api/auth/register
{
  "username": "testuser",
  "email": "test@example.com",
  "password": "TestPass123!"
}

# 2. 登录用户
POST /api/auth/login
{
  "identifier": "testuser",
  "password": "TestPass123!"
}

# 如果用户启用了TOTP，响应会包含：
{
  "user": { ... },
  "token": "temp_token",
  "requiresTOTP": true
}
```

### 2. 设置 TOTP 二次验证

```bash
# 1. 生成TOTP设置
POST /api/totp/generate-setup
Authorization: Bearer {temp_token}

# 响应包含：
{
  "secret": "JBSWY3DPEHPK3PXP",
  "otpauthUrl": "otpauth://totp/...",
  "qrCodeDataUrl": "data:image/png;base64,...",
  "backupCodes": ["ABCD1234", "EFGH5678", ...],
  "message": "请使用认证器应用扫描QR码..."
}

# 2. 验证并启用TOTP
POST /api/totp/verify-and-enable
Authorization: Bearer {temp_token}
{
  "token": "123456"  // 6位验证码
}
```

### 3. 登录时 TOTP 验证

```bash
# 1. 正常登录（需要TOTP验证）
POST /api/auth/login
{
  "identifier": "testuser",
  "password": "TestPass123!"
}

# 2. 验证TOTP令牌
POST /api/totp/verify-token
Authorization: Bearer {temp_token}
{
  "userId": "user_id",
  "token": "123456"  // 或使用 "backupCode": "ABCD1234"
}
```

## 📱 手机端优化特性

### 响应式设计

- ✅ 自适应不同屏幕尺寸
- ✅ 支持手机端滚动
- ✅ 触摸友好的界面元素

### 用户体验

- ✅ 美观的模态框界面
- ✅ 流畅的动画效果
- ✅ 清晰的错误提示
- ✅ 实时输入验证

## 🔐 安全特性

### 验证机制

- ✅ 6 位数字 TOTP 验证码
- ✅ 8 位字母数字恢复码
- ✅ 时间窗口验证（±30 秒）
- ✅ 防暴力破解（5 次尝试限制）

### 安全保护

- ✅ 临时 token 机制
- ✅ 输入清理和验证
- ✅ 安全的密钥生成
- ✅ 会话管理

## 🎨 界面展示

### 登录流程

```
用户输入凭据 → 系统检查TOTP状态 → 显示验证界面 → 输入验证码 → 登录成功
```

### 设置流程

```
进入TOTP管理 → 生成设置 → 扫描QR码 → 输入验证码 → 启用成功
```

### 管理界面

```
查看状态 → 启用/禁用 → 管理恢复码 → 重新设置
```

## 🧪 测试验证

### 运行测试脚本

```bash
node test-totp-login.js
```

### 手动测试步骤

1. 注册新用户
2. 登录并设置 TOTP
3. 使用认证器应用扫描 QR 码
4. 输入验证码完成设置
5. 退出登录
6. 重新登录，验证 TOTP 功能

## 📋 支持的认证器应用

- ✅ Google Authenticator
- ✅ Microsoft Authenticator
- ✅ Authy
- ✅ 1Password
- ✅ Bitwarden
- ✅ 其他支持 TOTP 的应用

## 🔧 技术实现

### 后端技术栈

- Node.js + Express
- TypeScript
- speakeasy (TOTP 库)
- qrcode (QR 码生成)

### 前端技术栈

- React 18
- TypeScript
- Tailwind CSS
- Framer Motion

### 核心组件

- `AuthForm.tsx` - 登录表单
- `TOTPVerification.tsx` - 验证界面
- `TOTPSetup.tsx` - 设置界面
- `TOTPManager.tsx` - 管理界面

## 📊 功能对比

| 功能       | 状态    | 说明                 |
| ---------- | ------- | -------------------- |
| TOTP 设置  | ✅ 完成 | 支持 QR 码和手动输入 |
| 登录验证   | ✅ 完成 | 集成到登录流程       |
| 恢复码     | ✅ 完成 | 10 个备用恢复码      |
| 手机端支持 | ✅ 完成 | 响应式设计，支持滚动 |
| 安全限制   | ✅ 完成 | 防暴力破解机制       |
| 用户界面   | ✅ 完成 | 美观的现代化界面     |
| 错误处理   | ✅ 完成 | 完善的错误提示       |
| 测试覆盖   | ✅ 完成 | 单元测试和集成测试   |

## 🎉 总结

TOTP 二次验证功能已完全实现并优化，具备以下特点：

1. **完整的功能实现** - 从设置到验证的完整流程
2. **优秀的用户体验** - 响应式设计，支持手机端
3. **强大的安全保护** - 多重安全机制
4. **良好的可维护性** - 清晰的代码结构和文档

用户现在可以安全地启用 TOTP 二次验证，在登录时享受额外的安全保护！
