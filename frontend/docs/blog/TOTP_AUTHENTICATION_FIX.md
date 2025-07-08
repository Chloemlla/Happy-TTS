---
title: TOTP 认证问题修复
date: 2025-07-07
slug: totp-authentication-fix
tags: [totp, authentication, fix, security]
---

# TOTP 认证问题修复

## 问题描述

用户通过 passkey 登录后，对 TOTP 发出的请求仍然携带错误的 token。从日志可以看出：

```
[0] [2025-07-08T02:17:45.182Z] warn: getUserById: 未找到用户 {"id":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxIiwidXNlcm5hbWUiOiJhZG1pbiIsImlhdCI6MTc1MTk0MTA2MCwiZXhwIjoxNzUyMDI3NDYwfQ.YMoL1HRa6Y5egE_GbWrXup3C-JYvyqWkI58EczfW9qc"}
```

系统在尝试用整个 JWT token 作为用户 ID 来查找用户，这显然是错误的。

## 问题根因

1. **TOTP 路由缺少认证中间件**：TOTP 相关的路由没有使用`authenticateToken`中间件
2. **TOTP 控制器直接解析 authorization header**：TOTP 控制器期望 authorization header 直接包含用户 ID，而不是 JWT token
3. **前端发送 JWT token**：前端正确发送 JWT token，但后端无法正确解析

## 修复方案

### 1. 为 TOTP 路由添加认证中间件

修改 `src/routes/totpRoutes.ts`，为所有 TOTP 路由添加`authenticateToken`中间件：

```typescript
import { authenticateToken } from "../middleware/authenticateToken";

// 为所有TOTP路由添加认证中间件
router.post(
  "/generate-setup",
  authenticateToken,
  totpLimiter,
  TOTPController.generateSetup
);
router.post(
  "/verify-and-enable",
  authenticateToken,
  totpLimiter,
  TOTPController.verifyAndEnable
);
router.post(
  "/verify-token",
  authenticateToken,
  totpLimiter,
  TOTPController.verifyToken
);
router.post("/disable", authenticateToken, totpLimiter, TOTPController.disable);
router.get("/status", authenticateToken, totpLimiter, TOTPController.getStatus);
router.get(
  "/backup-codes",
  authenticateToken,
  totpLimiter,
  TOTPController.getBackupCodes
);
router.post(
  "/regenerate-backup-codes",
  authenticateToken,
  totpLimiter,
  TOTPController.regenerateBackupCodes
);
```

### 2. 修改 TOTP 控制器使用 req.user

修改 `src/controllers/totpController.ts`，使所有方法从`req.user`获取用户信息：

```typescript
// 修改前
const userId = req.headers.authorization?.replace("Bearer ", "");
const user = await UserStorage.getUserById(userId);

// 修改后
// @ts-ignore
const user = req.user as any;
if (!user) {
  return res.status(401).json({ error: "未授权访问" });
}
const userId = user.id;
```

### 3. 修复的方法

- `generateSetup`：生成 TOTP 设置信息
- `verifyAndEnable`：验证并启用 TOTP
- `getStatus`：获取 TOTP 状态
- `disable`：禁用 TOTP
- `getBackupCodes`：获取备用恢复码
- `regenerateBackupCodes`：重新生成备用恢复码

## 修复效果

### 修复前

```
[0] [2025-07-08T02:17:45.182Z] warn: getUserById: 未找到用户 {"id":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}
[0] 127.0.0.1 - - [08/Jul/2025:02:17:45 +0000] "GET /api/totp/status HTTP/1.1" 404 27
```

### 修复后

系统将正确解析 JWT token，提取用户 ID，并返回正确的 TOTP 状态信息。

## 安全改进

1. **统一认证机制**：所有 TOTP 相关接口现在都使用统一的 JWT 认证机制
2. **防止未授权访问**：确保只有经过认证的用户才能访问 TOTP 功能
3. **正确的用户验证**：确保用户只能访问自己的 TOTP 设置

## 测试验证

创建了 `src/tests/totp-authentication-fix.test.ts` 测试文件，包含以下测试：

- 正确解析 JWT token 并获取 TOTP 状态
- 拒绝无效的 JWT token
- 拒绝过期的 JWT token
- 拒绝没有 Authorization header 的请求
- 拒绝格式错误的 Authorization header
- 正确处理 TOTP 生成设置请求
- 拒绝不存在的用户 ID

## 使用说明

修复后，TOTP 相关接口将：

1. 正确解析前端发送的 JWT token
2. 验证 token 的有效性和过期时间
3. 从 token 中提取正确的用户 ID
4. 返回对应用户的 TOTP 状态信息

## 兼容性

此修复保持了与现有前端代码的完全兼容性，前端无需修改任何代码。修复只涉及后端认证逻辑的改进。
