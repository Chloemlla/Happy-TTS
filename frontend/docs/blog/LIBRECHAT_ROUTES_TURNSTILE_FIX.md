---
title: LibreChat 路由 Turnstile 参数传递修复
date: 2025-08-27
slug: librechat-routes-turnstile-fix
tags: [librechat, turnstile, routes, fix, backend, api, blog]
---

# LibreChat 路由 Turnstile 参数传递修复

## 问题描述

在实现 LibreChat 后端 Turnstile 验证功能后，发现前端发送的 `cfToken` 和 `userRole` 参数没有正确传递到服务层，导致验证失败。

### 错误日志

```
[2025-08-25 09:37:46] warn: 非管理员用户缺少 Turnstile token，拒绝发送消息 {
  userId: undefined,
  userRole: undefined,
  Symbol(level): 'warn',
  Symbol(splat): [ { userId: undefined, userRole: undefined } ]
}
发送消息错误: Error: 需要完成人机验证才能发送消息
```

### 问题分析

1. **前端已发送参数**：前端请求体中包含了 `cfToken` 和 `userRole`
2. **路由未提取参数**：后端路由没有从请求体中提取这些参数
3. **服务层参数缺失**：传递给服务层的 `cfToken` 和 `userRole` 为 `undefined`
4. **验证逻辑错误**：由于 `userRole` 为 `undefined`，系统认为用户不是管理员，但又缺少 `cfToken`

## 解决方案

### 1. 修改发送消息路由

在 `/send` 路由中提取 `cfToken` 和 `userRole` 参数：

```typescript
router.post("/send", async (req, res) => {
  try {
    // 从请求体中提取所有必要参数
    const { message, cfToken, userRole } = req.body;
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // ... 验证逻辑 ...

    // 传递所有参数到服务层
    const response = await libreChatService.sendMessage(
      token ?? "",
      message,
      userId,
      cfToken,
      userRole
    );

    res.json({ response });
  } catch (error) {
    console.error("发送消息错误:", error);

    // 处理 Turnstile 验证错误
    if (error instanceof Error) {
      if (
        error.message.includes("人机验证") ||
        error.message.includes("Turnstile")
      ) {
        return res.status(400).json({ error: error.message });
      }
    }

    res.status(500).json({ error: "发送消息失败" });
  }
});
```

### 2. 修改重试消息路由

在 `/retry` 路由中也添加相同的参数提取：

```typescript
router.post("/retry", async (req, res) => {
  try {
    // 从请求体中提取所有必要参数
    const { messageId, cfToken, userRole } = req.body || {};
    const token = getTokenFromReq(req);
    const userId = extractUserId(req);

    // ... 验证逻辑 ...

    // 传递所有参数到服务层
    const response = await libreChatService.retryMessage(
      token ?? "",
      messageId as string,
      userId,
      cfToken,
      userRole
    );

    return res.json({ response });
  } catch (error) {
    console.error("重试生成错误:", error);

    // 处理 Turnstile 验证错误
    if (error instanceof Error) {
      if (
        error.message.includes("人机验证") ||
        error.message.includes("Turnstile")
      ) {
        return res.status(400).json({ error: error.message });
      }
    }

    res.status(500).json({ error: "重试失败" });
  }
});
```

### 3. 更新 OpenAPI 文档

为两个路由添加新的参数文档：

```typescript
/**
 * @openapi
 * /send:
 *   post:
 *     summary: 发送聊天消息
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, message]
 *             properties:
 *               token:
 *                 type: string
 *                 description: 用户认证token
 *               message:
 *                 type: string
 *                 description: 聊天消息
 *               cfToken:
 *                 type: string
 *                 description: Cloudflare Turnstile 验证token（非管理员用户必需）
 *               userRole:
 *                 type: string
 *                 description: 用户角色（admin/administrator 为管理员，其他为普通用户）
 */
```

## 修复细节

### 1. 参数提取

确保从请求体中正确提取所有参数：

```typescript
// 发送消息路由
const { message, cfToken, userRole } = req.body;

// 重试消息路由
const { messageId, cfToken, userRole } = req.body || {};
```

### 2. 参数传递

将提取的参数正确传递给服务层：

```typescript
// 发送消息
const response = await libreChatService.sendMessage(
  token ?? "",
  message,
  userId,
  cfToken,
  userRole
);

// 重试消息
const response = await libreChatService.retryMessage(
  token ?? "",
  messageId as string,
  userId,
  cfToken,
  userRole
);
```

### 3. 错误处理

为 Turnstile 验证错误添加专门的错误处理：

```typescript
} catch (error) {
  console.error('发送消息错误:', error);

  // 处理 Turnstile 验证错误
  if (error instanceof Error) {
    if (error.message.includes('人机验证') || error.message.includes('Turnstile')) {
      return res.status(400).json({ error: error.message });
    }
  }

  res.status(500).json({ error: '发送消息失败' });
}
```

## 验证流程

### 1. 前端请求

前端发送包含所有必要参数的请求：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "人机验证✓ 验证通过如何使用Turnstile",
  "cfToken": "0.zW80s2MuE_oetqP-IvQLGr82K0NyZdrdSe8idvvvIvJuCC_yQfqpnkseijL8cQWJ7v0vINAxDlaWzeh1X2VnbF03k4J9NE0skedSqhCoOrjB7ju9hVw7GJtMxhquyVT27YyAZz8Ioynf7tWh8o5PHmZPOjEXRERjlD-IflnGfrUEEdFN8cduPZ6YdO6dOyao1y1erBfcanj5thVMp8uI5TZckiDA-YAfPQzg_gLH55E8Bh1eyg_PyA8d0j86LUQX-bMOZZYBLlkt2kxGtKsZa5VxTKvNoqXruFnpbPPxv98Dvac9JIr_RsYJ9PyVaCYZENWsMlxGpAwZg8EZtqvQjDbJ7U-1FVmjiEesR-YimRE4fME2TJHy3q4fAIwIttCsLCCc_DKv44YNpseR8KiWX1PEawyr_8u-thBZ4Ib9ynKn3X-TtTm7709Pk2crVn_p4Ksrk2bciJREHR29Ym-yBwEU2JWFwQw9P2Hr847weYAC7Sk6S6AnUzbkCKOiwQIRSe5n_nn2ZgzqPp76hraEPURMrh43jK_7THuGY1aAqeRTggBKJXU5JV-IR7sTjXaXk5DGWAaOxDrXx5qAH2iWDesnSd5A8rly-qVcHR9OGNLM023qcUVDC6f4dsi5uzXSv8eE4KvbxEHQMi96bwCbl1VabSbLHFnf9ZxZZlRoYyKcyHF-HBNUXNX8Y8tb3HLW4qulcUNv1JMN_GamqS-jbkn_440LtfDdmtaFtwMl_n-rdP-jID1MduukJpmKdXBm9chBSmvAPYwrX-BvExLmSBqqULRnd3VOMmj4EOIyuKaEhLeiAUUxU1GJIsgJymRcgJHj2_4lmSYBZYRyc48Pbx9FfuOIBsVdpMIv4BUDTG3BtT1n6mxNYZZh-fMxv7A8gV4_jYUqRFGIMVXZxpWHHQ.phYh4p1qIKqXvvUFmDK7aQ.0c7fa51b7f8e906e33caab9502e7acf25f489a0b502869c7cc1b6ff83ba4b4b2",
  "userRole": "user"
}
```

### 2. 路由处理

路由正确提取并传递参数：

```typescript
// 提取参数
const { message, cfToken, userRole } = req.body;

// 传递给服务
const response = await libreChatService.sendMessage(
  token ?? "",
  message,
  userId,
  cfToken,
  userRole
);
```

### 3. 服务层验证

服务层根据用户角色和 cfToken 进行验证：

```typescript
// 检查非管理员用户的 Turnstile 验证
const isAdmin = userRole === "admin" || userRole === "administrator";
if (!isAdmin && process.env.TURNSTILE_SECRET_KEY) {
  if (!cfToken) {
    throw new Error("需要完成人机验证才能发送消息");
  }
  // 验证 cfToken...
}
```

## 测试用例

### 1. 正常流程测试

```typescript
// 普通用户发送消息（有效 cfToken）
const response = await fetch("/api/librechat/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: "user_token",
    message: "测试消息",
    cfToken: "valid_cf_token",
    userRole: "user",
  }),
});

// 应该返回成功响应
expect(response.status).toBe(200);
```

### 2. 错误情况测试

```typescript
// 普通用户缺少 cfToken
const response = await fetch("/api/librechat/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: "user_token",
    message: "测试消息",
    userRole: "user",
    // 缺少 cfToken
  }),
});

// 应该返回 400 错误
expect(response.status).toBe(400);
const error = await response.json();
expect(error.error).toContain("需要完成人机验证");
```

### 3. 管理员用户测试

```typescript
// 管理员用户发送消息（无需 cfToken）
const response = await fetch("/api/librechat/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: "admin_token",
    message: "测试消息",
    userRole: "admin",
    // 管理员无需 cfToken
  }),
});

// 应该返回成功响应
expect(response.status).toBe(200);
```

## 部署注意事项

### 1. 环境变量

确保后端配置了 Turnstile 密钥：

```bash
# .env 文件
TURNSTILE_SECRET_KEY=your_turnstile_secret_key_here
```

### 2. 前端配置

确保前端正确发送参数：

```typescript
// 构建请求体
const requestBody: any = token
  ? { token, message: toSend }
  : { message: toSend };

// 如果不是管理员且Turnstile已启用，添加验证token
if (!isAdmin && !!turnstileConfig.siteKey && turnstileToken) {
  requestBody.cfToken = turnstileToken;
  requestBody.userRole = userRole; // 添加用户角色
}
```

### 3. 监控和日志

监控 Turnstile 验证的成功率和错误率：

```typescript
// 验证成功日志
logger.info("Turnstile 验证成功", {
  userId,
  userRole,
  hostname: verificationResult.hostname,
});

// 验证失败日志
logger.warn("Turnstile 验证失败", {
  userId,
  userRole,
  errorCodes: verificationResult["error-codes"],
});
```

## 总结

通过修复路由参数传递问题，我们实现了：

1. **参数完整性**：确保前端发送的所有参数都能正确传递到服务层
2. **验证准确性**：根据用户角色正确进行 Turnstile 验证
3. **错误处理**：为 Turnstile 验证错误提供专门的错误处理
4. **文档完整性**：更新 OpenAPI 文档，明确参数要求

这个修复确保了 LibreChat 的 Turnstile 验证功能能够正常工作，提供了完整的安全保护。
