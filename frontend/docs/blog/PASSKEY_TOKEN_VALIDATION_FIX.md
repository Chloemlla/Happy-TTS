---
title: Passkey 认证 Token 和用户 ID 验证修复
date: 2025-07-07
slug: passkey-token-validation-fix
tags: [passkey, token, fix, security]
---

# Passkey 认证 Token 和用户 ID 验证修复

## 问题描述

在用户通过二次校验 passkey 时，系统需要确保：

1. 返回的 token 与用户填表的用户名对应
2. 如果 token 不是用户名对应的 token，需要另行赋值
3. 确保给用户一个正确的 user ID

## 修复内容

### 1. 修改 `src/routes/passkeyRoutes.ts` 中的 `/authenticate/finish` 接口

**增强的验证逻辑：**

- 验证用户是否存在
- 验证用户是否启用了 Passkey
- 验证传入的用户名与用户数据的一致性
- 验证 Passkey 认证结果
- 验证生成的 token 包含正确的用户信息

**关键改进：**

```typescript
// 验证用户名与用户ID的一致性
if (user.username !== username) {
  logger.error("[Passkey] 认证失败：用户名与用户数据不匹配", {
    providedUsername: username,
    actualUsername: user.username,
    userId: user.id,
  });
  return res.status(400).json({ error: "用户名验证失败" });
}

// 验证生成的token包含正确的用户信息
const decoded = jwt.verify(token, config.jwtSecret);
if (decoded.userId !== user.id || decoded.username !== user.username) {
  logger.error("[Passkey] Token生成错误：用户信息不匹配", {
    username,
    userId: user.id,
    tokenUserId: decoded.userId,
    tokenUsername: decoded.username,
  });
  return res.status(500).json({ error: "Token生成失败" });
}
```

### 2. 修改 `src/services/passkeyService.ts` 中的 `generateToken` 方法

**增强的 token 生成逻辑：**

- 验证用户数据完整性
- 记录 token 生成信息
- 验证生成的 token
- 确保 token 中的用户信息正确

**关键改进：**

```typescript
// 验证用户数据完整性
if (!user || !user.id || !user.username) {
  logger.error("[Passkey] generateToken: 用户数据不完整", {
    hasUser: !!user,
    userId: user?.id,
    username: user?.username,
  });
  throw new Error("用户数据不完整，无法生成token");
}

// 验证生成的token
const decoded = jwt.verify(token, config.jwtSecret) as any;
if (decoded.userId !== user.id || decoded.username !== user.username) {
  logger.error("[Passkey] Token验证失败：用户信息不匹配", {
    userId: user.id,
    username: user.username,
    tokenUserId: decoded.userId,
    tokenUsername: decoded.username,
  });
  throw new Error("Token生成失败：用户信息不匹配");
}
```

### 3. 修改 `src/controllers/authController.ts` 中的 `passkeyVerify` 方法

**增强的验证逻辑：**

- 验证用户是否存在
- 验证用户是否启用了 Passkey
- 验证用户名与用户数据的一致性
- 验证 credentialID 是否存在
- 验证 token 与用户 ID 的一致性

**关键改进：**

```typescript
// 验证用户名与用户数据的一致性
if (user.username !== username) {
  logger.error("[AuthController] Passkey校验失败：用户名与用户数据不匹配", {
    providedUsername: username,
    actualUsername: user.username,
    userId: user.id,
  });
  return res.status(400).json({ error: "用户名验证失败" });
}

// 验证token与用户ID的一致性
if (token !== user.id) {
  logger.error("[AuthController] Token生成错误：token与用户ID不匹配", {
    username,
    userId: user.id,
    generatedToken: token,
  });
  return res.status(500).json({ error: "Token生成失败" });
}
```

### 4. 添加 `src/utils/userStorage.ts` 中的 `deleteUser` 方法

**新增功能：**

- 支持删除用户
- 完整的错误处理和日志记录
- 用于测试数据清理

### 5. 创建测试文件 `src/tests/passkey-token-validation.test.ts`

**测试覆盖：**

- 验证 token 生成正确性
- 验证用户数据完整性检查
- 验证用户名与用户数据一致性
- 验证 Passkey 认证流程
- 验证 token 中的用户信息与数据库一致性

## 安全改进

1. **多层验证**：在认证流程的多个环节进行用户信息验证
2. **详细日志**：记录所有关键操作和错误信息，便于调试和审计
3. **错误处理**：提供清晰的错误信息和状态码
4. **数据一致性**：确保 token 中的用户信息与数据库中的用户信息完全一致

## 使用说明

修复后的系统将：

1. 在用户通过 passkey 认证时，严格验证用户信息的正确性
2. 确保返回的 token 包含正确的用户 ID 和用户名
3. 如果发现任何不一致，立即返回错误并记录详细日志
4. 提供完整的测试覆盖，确保修复的有效性

## 测试验证

运行测试命令：

```bash
npm test -- src/tests/passkey-token-validation.test.ts
```

这将验证所有修复的功能是否正常工作。
