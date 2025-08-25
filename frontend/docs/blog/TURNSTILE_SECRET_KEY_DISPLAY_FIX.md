---
title: 修复Turnstile Secret Key显示问题
date: 2025-08-27
slug: turnstile-secret-key-display-fix
tags: [turnstile, secret-key, display, fix, authentication, blog]
---

# 修复Turnstile Secret Key显示问题

## 问题描述

在EnvManager中配置Turnstile时，发现Secret Key已经设置但前端显示"未设置"的问题。经过分析发现，这是因为Turnstile配置API的认证机制不完整导致的。

## 问题分析

### 1. 根本原因

在`src/routes/turnstileRoutes.ts`中，GET `/config`接口没有使用`authenticateToken`中间件：

```typescript
// 问题代码
router.get("/config", async (req, res) => {
  try {
    const config = await TurnstileService.getConfig();

    // 非管理员用户不返回secretKey
    const userRole = (req as any).user?.role; // 这里user是undefined
    const isAdmin = userRole === "admin" || userRole === "administrator";

    res.json({
      enabled: config.enabled,
      siteKey: config.siteKey,
      ...(isAdmin && { secretKey: config.secretKey }), // 永远不会执行
    });
  } catch (error) {
    // ...
  }
});
```

### 2. 问题影响

- **Secret Key不显示**：由于`req.user`为undefined，`isAdmin`始终为false
- **权限检查失效**：无法正确识别管理员用户
- **安全风险**：非管理员用户可能看到敏感信息

## 解决方案

### 1. 添加认证中间件

为GET `/config`接口添加`authenticateToken`中间件：

```typescript
// 修复后的代码
router.get("/config", authenticateToken, async (req, res) => {
  try {
    const config = await TurnstileService.getConfig();

    // 非管理员用户不返回secretKey
    const userRole = (req as any).user?.role; // 现在user有值
    const isAdmin = userRole === "admin" || userRole === "administrator";

    // 对Secret Key进行脱敏处理
    const maskedSecretKey =
      config.secretKey && config.secretKey.length > 8
        ? config.secretKey.slice(0, 2) + "***" + config.secretKey.slice(-4)
        : config.secretKey
          ? "***"
          : null;

    res.json({
      enabled: config.enabled,
      siteKey: config.siteKey,
      ...(isAdmin && { secretKey: maskedSecretKey }), // 管理员用户会看到脱敏的secretKey
    });
  } catch (error) {
    console.error("获取Turnstile配置失败:", error);
    res.status(500).json({
      error: "获取配置失败",
    });
  }
});
```

### 2. 添加脱敏处理

为Secret Key添加脱敏处理，保护敏感信息：

```typescript
// 对Secret Key进行脱敏处理
const maskedSecretKey =
  config.secretKey && config.secretKey.length > 8
    ? config.secretKey.slice(0, 2) + "***" + config.secretKey.slice(-4)
    : config.secretKey
      ? "***"
      : null;
```

脱敏规则：

- 长度大于8的密钥：显示前2位 + \*\*\* + 后4位
- 长度小于等于8的密钥：显示 \*\*\*
- 未设置的密钥：显示 null

### 3. 更新OpenAPI文档

更新接口文档，说明需要认证：

```typescript
/**
 * @openapi
 * /api/turnstile/config:
 *   get:
 *     summary: 获取Turnstile配置
 *     description: 获取当前Turnstile配置信息（需要认证）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Turnstile配置信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: 是否启用
 *                 siteKey:
 *                   type: string
 *                   description: 站点密钥
 *                 secretKey:
 *                   type: string
 *                   description: 密钥（仅管理员可见）
 *       401:
 *         description: 未授权
 */
```

### 3. 改进错误处理

在EnvManager中添加认证错误的特殊处理：

```typescript
const fetchTurnstileConfig = useCallback(async () => {
  setTurnstileConfigLoading(true);
  try {
    const res = await fetch(TURNSTILE_CONFIG_API, {
      headers: { ...getAuthHeaders() },
    });
    const data = await res.json();
    if (!res.ok) {
      // 处理认证错误
      if (res.status === 401) {
        setNotification({
          message: "登录状态已失效，请重新登录",
          type: "error",
        });
      } else {
        setNotification({
          message: data.error || "获取Turnstile配置失败",
          type: "error",
        });
      }
      setTurnstileConfigLoading(false);
      return;
    }
    // Turnstile配置API直接返回配置数据，不包含success字段
    setTurnstileConfig({
      enabled: data.enabled || false,
      siteKey: data.siteKey || null,
      secretKey: data.secretKey || null,
      updatedAt: data.updatedAt,
    });
  } catch (e) {
    setNotification({
      message:
        "获取Turnstile配置失败：" +
        (e instanceof Error ? e.message : "未知错误"),
      type: "error",
    });
  } finally {
    setTurnstileConfigLoading(false);
  }
}, [setNotification]);
```

## 修复效果

### 1. 功能恢复

- **Secret Key正确显示**：管理员用户可以看到已配置的Secret Key（脱敏显示）
- **权限控制生效**：只有管理员用户能看到Secret Key
- **状态显示准确**：Turnstile启用状态正确显示
- **脱敏保护**：Secret Key以脱敏形式显示，保护敏感信息

### 2. 安全性提升

- **认证要求**：所有配置操作都需要有效的认证token
- **权限验证**：正确识别管理员用户角色
- **敏感信息保护**：Secret Key只对管理员可见

### 3. 用户体验改善

- **错误提示明确**：认证失败时提供清晰的错误信息
- **状态反馈及时**：配置状态实时更新
- **操作流程顺畅**：认证成功后正常显示配置信息

## 测试验证

### 1. 管理员用户测试

```bash
# 使用管理员token访问配置
curl -H "Authorization: Bearer <admin_token>" \
     http://localhost:3000/api/turnstile/config

# 期望响应
{
  "enabled": true,
  "siteKey": "0x4AAAAAAABkMYinukE5NHzg",
  "secretKey": "0x***_key"
}
```

### 2. 普通用户测试

```bash
# 使用普通用户token访问配置
curl -H "Authorization: Bearer <user_token>" \
     http://localhost:3000/api/turnstile/config

# 期望响应
{
  "enabled": true,
  "siteKey": "0x4AAAAAAABkMYinukE5NHzg"
}
```

### 3. 未认证用户测试

```bash
# 不使用token访问配置
curl http://localhost:3000/api/turnstile/config

# 期望响应
{
  "error": "未授权"
}
```

## 相关文件

### 修改的文件

1. **`src/routes/turnstileRoutes.ts`**
   - 添加`authenticateToken`中间件
   - 更新OpenAPI文档

2. **`frontend/src/components/EnvManager.tsx`**
   - 改进错误处理逻辑
   - 添加认证错误特殊处理

### 影响的功能

1. **Turnstile配置管理**：Secret Key正确显示
2. **权限控制**：管理员权限验证生效
3. **错误处理**：认证失败时提供友好提示

## 总结

通过添加认证中间件，我们成功修复了Turnstile Secret Key显示问题。这个修复不仅解决了显示问题，还提升了系统的安全性和用户体验。

### 关键改进点

1. **认证完整性**：确保所有配置操作都需要认证
2. **权限控制**：正确识别和管理员用户权限
3. **错误处理**：提供清晰的错误信息和处理逻辑
4. **文档更新**：保持API文档的准确性

这个修复确保了Turnstile配置管理功能的正确性和安全性，为用户提供了更好的配置管理体验。
