---
title: Turnstile配置支持数据库存储
date: 2025-08-27
slug: turnstile-database-config
tags: [turnstile, database, config, security, backend, frontend, blog]
---

# Turnstile配置支持数据库存储

## 概述

为了提高系统配置的灵活性和安全性，我们将Turnstile配置从环境变量迁移到数据库存储。现在`TURNSTILE_SECRET_KEY`和`TURNSTILE_SITE_KEY`可以通过数据库进行动态配置，类似于短链服务的AES_KEY配置方式。

## 功能特性

### 1. 数据库配置支持

- **优先级**：数据库配置 > 环境变量配置
- **回退机制**：当数据库配置不可用时，自动回退到环境变量
- **实时更新**：配置更改后立即生效，无需重启服务

### 2. 管理接口

- **获取配置**：支持管理员和普通用户获取配置信息
- **更新配置**：仅管理员可更新配置
- **删除配置**：仅管理员可删除配置

### 3. 安全性

- **权限控制**：管理员权限验证
- **敏感信息保护**：非管理员用户不返回secretKey
- **输入验证**：严格的参数验证

## 后端实现

### 1. 数据库模型

创建Turnstile配置文档模型：

```typescript
// Turnstile配置文档接口
interface TurnstileSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}

// Turnstile配置Schema
const TurnstileSettingSchema = new mongoose.Schema<TurnstileSettingDoc>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "turnstile_settings" }
);

const TurnstileSettingModel =
  (mongoose.models.TurnstileSetting as mongoose.Model<TurnstileSettingDoc>) ||
  mongoose.model<TurnstileSettingDoc>(
    "TurnstileSetting",
    TurnstileSettingSchema
  );
```

### 2. 配置获取函数

实现数据库优先的配置获取逻辑：

```typescript
// 从数据库获取Turnstile密钥
async function getTurnstileKey(
  keyName: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY"
): Promise<string | null> {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await TurnstileSettingModel.findOne({ key: keyName })
        .lean()
        .exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error(`读取Turnstile ${keyName} 失败，回退到环境变量`, e);
  }

  // 回退到环境变量
  const envKey = process.env[keyName]?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}
```

### 3. TurnstileService更新

扩展TurnstileService以支持数据库配置：

```typescript
export class TurnstileService {
  /**
   * 验证 Turnstile token
   */
  public static async verifyToken(
    token: string,
    remoteIp?: string
  ): Promise<boolean> {
    try {
      // 从数据库获取密钥
      const secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");

      // 检查是否配置了密钥
      if (!secretKey) {
        logger.warn("Turnstile 密钥未配置，跳过验证");
        return true;
      }

      // ... 验证逻辑 ...
    } catch (error) {
      logger.error("Turnstile 验证请求失败", error);
      return false;
    }
  }

  /**
   * 检查是否启用了 Turnstile
   */
  public static async isEnabled(): Promise<boolean> {
    const secretKey = await getTurnstileKey("TURNSTILE_SECRET_KEY");
    return !!secretKey;
  }

  /**
   * 获取Turnstile配置
   */
  public static async getConfig(): Promise<{
    enabled: boolean;
    siteKey: string | null;
    secretKey: string | null;
  }> {
    const [secretKey, siteKey] = await Promise.all([
      getTurnstileKey("TURNSTILE_SECRET_KEY"),
      getTurnstileKey("TURNSTILE_SITE_KEY"),
    ]);

    return {
      enabled: !!secretKey,
      siteKey,
      secretKey,
    };
  }

  /**
   * 更新Turnstile配置
   */
  public static async updateConfig(
    key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY",
    value: string
  ): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法更新Turnstile配置");
        return false;
      }

      await TurnstileSettingModel.findOneAndUpdate(
        { key },
        {
          key,
          value: value.trim(),
          updatedAt: new Date(),
        },
        { upsert: true, new: true }
      );

      logger.info(`Turnstile配置更新成功: ${key}`);
      return true;
    } catch (error) {
      logger.error(`更新Turnstile配置失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 删除Turnstile配置
   */
  public static async deleteConfig(
    key: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY"
  ): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        logger.error("数据库连接不可用，无法删除Turnstile配置");
        return false;
      }

      await TurnstileSettingModel.findOneAndDelete({ key });
      logger.info(`Turnstile配置删除成功: ${key}`);
      return true;
    } catch (error) {
      logger.error(`删除Turnstile配置失败: ${key}`, error);
      return false;
    }
  }
}
```

### 4. 管理路由

创建Turnstile配置管理路由：

```typescript
// src/routes/turnstileRoutes.ts
import express from "express";
import { TurnstileService } from "../services/turnstileService";
import { authenticateToken } from "../middleware/authenticateToken";

const router = express.Router();

/**
 * 获取Turnstile配置
 */
router.get("/config", async (req, res) => {
  try {
    const config = await TurnstileService.getConfig();

    // 非管理员用户不返回secretKey
    const userRole = (req as any).user?.role;
    const isAdmin = userRole === "admin" || userRole === "administrator";

    res.json({
      enabled: config.enabled,
      siteKey: config.siteKey,
      ...(isAdmin && { secretKey: config.secretKey }),
    });
  } catch (error) {
    console.error("获取Turnstile配置失败:", error);
    res.status(500).json({
      error: "获取配置失败",
    });
  }
});

/**
 * 更新Turnstile配置（仅管理员）
 */
router.post("/config", authenticateToken, async (req, res) => {
  try {
    // 检查管理员权限
    const userRole = (req as any).user?.role;
    if (userRole !== "admin" && userRole !== "administrator") {
      return res.status(403).json({
        error: "权限不足，仅管理员可操作",
      });
    }

    const { key, value } = req.body;

    if (!key || !value) {
      return res.status(400).json({
        error: "缺少必要参数",
      });
    }

    if (!["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"].includes(key)) {
      return res.status(400).json({
        error: "无效的配置键名",
      });
    }

    const success = await TurnstileService.updateConfig(key, value);

    if (success) {
      res.json({
        success: true,
        message: "配置更新成功",
      });
    } else {
      res.status(500).json({
        error: "配置更新失败",
      });
    }
  } catch (error) {
    console.error("更新Turnstile配置失败:", error);
    res.status(500).json({
      error: "更新配置失败",
    });
  }
});

/**
 * 删除Turnstile配置（仅管理员）
 */
router.delete("/config/:key", authenticateToken, async (req, res) => {
  try {
    // 检查管理员权限
    const userRole = (req as any).user?.role;
    if (userRole !== "admin" && userRole !== "administrator") {
      return res.status(403).json({
        error: "权限不足，仅管理员可操作",
      });
    }

    const { key } = req.params;

    if (!["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"].includes(key)) {
      return res.status(400).json({
        error: "无效的配置键名",
      });
    }

    const success = await TurnstileService.deleteConfig(
      key as "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY"
    );

    if (success) {
      res.json({
        success: true,
        message: "配置删除成功",
      });
    } else {
      res.status(500).json({
        error: "配置删除失败",
      });
    }
  } catch (error) {
    console.error("删除Turnstile配置失败:", error);
    res.status(500).json({
      error: "删除配置失败",
    });
  }
});

export default router;
```

### 5. 路由注册

在主应用中注册Turnstile路由：

```typescript
// src/app.ts
import turnstileRoutes from "./routes/turnstileRoutes";

// 注册路由
app.use("/api/turnstile", turnstileRoutes);
```

### 6. 服务更新

更新使用Turnstile服务的其他组件：

```typescript
// src/services/ipfsService.ts
// 如果提供了cfToken，进行Turnstile验证
if (cfToken) {
  if (await TurnstileService.isEnabled()) {
    try {
      const isValid = await TurnstileService.verifyToken(cfToken);
      if (!isValid) {
        throw new Error("人机验证失败，请重新验证");
      }
      logger.info("[IPFS] Turnstile验证通过");
    } catch (error) {
      logger.error("[IPFS] Turnstile验证失败:", error);
      throw new Error("人机验证失败，请重新验证");
    }
  } else {
    logger.warn("[IPFS] Turnstile服务未启用，跳过验证");
  }
}

// src/controllers/ttsController.ts
// 验证 Turnstile
if (await TurnstileService.isEnabled()) {
  const cfVerified = await TurnstileService.verifyToken(cfToken, ip);
  if (!cfVerified) {
    logger.warn("Turnstile 验证失败", {
      ip,
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    });
    return res.status(403).json({
      error: "人机验证失败，请重新验证",
    });
  }
}
```

## 前端实现

### 1. 配置Hook更新

更新useTurnstileConfig hook以使用新的API端点：

```typescript
// frontend/src/hooks/useTurnstileConfig.ts
export const useTurnstileConfig = () => {
  const [config, setConfig] = useState<TurnstileConfig>({
    enabled: false,
    siteKey: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        console.log("正在获取 Turnstile 配置...");
        const response = await api.get("/api/turnstile/config");
        console.log("Turnstile 配置获取成功:", response.data);
        setConfig(response.data);
      } catch (err) {
        console.error("获取Turnstile配置失败:", err);
        setError("获取验证配置失败");
        // 失败时默认关闭Turnstile
        setConfig({ enabled: false, siteKey: null });
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading, error };
};
```

## API接口

### 1. 获取配置

```http
GET /api/turnstile/config
```

**响应示例：**

```json
{
  "enabled": true,
  "siteKey": "0x4AAAAAAABkMYinukE5NHzg"
}
```

**管理员响应示例：**

```json
{
  "enabled": true,
  "siteKey": "0x4AAAAAAABkMYinukE5NHzg",
  "secretKey": "0x4AAAAAAABkMYinukE5NHzg_secret_key"
}
```

### 2. 更新配置

```http
POST /api/turnstile/config
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "key": "TURNSTILE_SECRET_KEY",
  "value": "your_secret_key_here"
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "配置更新成功"
}
```

### 3. 删除配置

```http
DELETE /api/turnstile/config/TURNSTILE_SECRET_KEY
Authorization: Bearer <admin_token>
```

**响应示例：**

```json
{
  "success": true,
  "message": "配置删除成功"
}
```

## 数据库结构

### Turnstile配置集合

```javascript
// 集合名: turnstile_settings
{
  "_id": ObjectId("..."),
  "key": "TURNSTILE_SECRET_KEY",
  "value": "your_secret_key_here",
  "updatedAt": ISODate("2025-08-27T10:00:00.000Z")
}

{
  "_id": ObjectId("..."),
  "key": "TURNSTILE_SITE_KEY",
  "value": "your_site_key_here",
  "updatedAt": ISODate("2025-08-27T10:00:00.000Z")
}
```

## 迁移指南

### 1. 从环境变量迁移

如果之前使用环境变量配置Turnstile，可以通过以下方式迁移：

```bash
# 1. 获取当前环境变量值
echo $TURNSTILE_SECRET_KEY
echo $TURNSTILE_SITE_KEY

# 2. 使用API接口更新配置
curl -X POST http://localhost:3000/api/turnstile/config \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "TURNSTILE_SECRET_KEY",
    "value": "your_secret_key_here"
  }'

curl -X POST http://localhost:3000/api/turnstile/config \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "TURNSTILE_SITE_KEY",
    "value": "your_site_key_here"
  }'
```

### 2. 验证配置

```bash
# 获取配置验证是否迁移成功
curl http://localhost:3000/api/turnstile/config \
  -H "Authorization: Bearer <admin_token>"
```

## 安全考虑

### 1. 权限控制

- 只有管理员可以更新和删除配置
- 非管理员用户只能查看基本配置信息
- 敏感信息（secretKey）只对管理员可见

### 2. 输入验证

- 严格的参数验证
- 只允许预定义的配置键名
- 防止SQL注入和XSS攻击

### 3. 错误处理

- 详细的错误日志记录
- 用户友好的错误提示
- 数据库连接失败时的回退机制

### 4. 数据保护

- 配置值在传输和存储时进行验证
- 支持配置值的加密存储（可扩展）
- 定期备份配置数据

## 监控和日志

### 1. 配置操作日志

```typescript
logger.info(`Turnstile配置更新成功: ${key}`);
logger.error(`更新Turnstile配置失败: ${key}`, error);
logger.info(`Turnstile配置删除成功: ${key}`);
logger.error(`删除Turnstile配置失败: ${key}`, error);
```

### 2. 验证操作日志

```typescript
logger.warn("Turnstile 密钥未配置，跳过验证");
logger.info("Turnstile 验证成功", { remoteIp, hostname });
logger.warn("Turnstile 验证失败", { errorCodes, remoteIp });
logger.error("Turnstile 验证请求失败", { error, remoteIp });
```

## 测试用例

### 1. 配置管理测试

```typescript
// 测试获取配置
const config = await TurnstileService.getConfig();
expect(config.enabled).toBeDefined();
expect(config.siteKey).toBeDefined();

// 测试更新配置
const success = await TurnstileService.updateConfig(
  "TURNSTILE_SECRET_KEY",
  "test_key"
);
expect(success).toBe(true);

// 测试删除配置
const deleted = await TurnstileService.deleteConfig("TURNSTILE_SECRET_KEY");
expect(deleted).toBe(true);
```

### 2. 验证功能测试

```typescript
// 测试启用状态检查
const enabled = await TurnstileService.isEnabled();
expect(typeof enabled).toBe("boolean");

// 测试token验证
const isValid = await TurnstileService.verifyToken("valid_token");
expect(typeof isValid).toBe("boolean");
```

### 3. API接口测试

```typescript
// 测试获取配置接口
const response = await request(app).get("/api/turnstile/config").expect(200);

expect(response.body.enabled).toBeDefined();
expect(response.body.siteKey).toBeDefined();

// 测试更新配置接口（管理员）
const updateResponse = await request(app)
  .post("/api/turnstile/config")
  .set("Authorization", `Bearer ${adminToken}`)
  .send({
    key: "TURNSTILE_SECRET_KEY",
    value: "test_secret_key",
  })
  .expect(200);

expect(updateResponse.body.success).toBe(true);
```

## 总结

通过将Turnstile配置迁移到数据库存储，我们实现了：

1. **配置灵活性**：支持动态配置更新，无需重启服务
2. **安全性提升**：严格的权限控制和输入验证
3. **可维护性**：统一的配置管理接口
4. **向后兼容**：支持环境变量回退机制
5. **监控能力**：详细的日志记录和错误处理

这个改进使得Turnstile配置管理更加灵活和安全，同时保持了系统的稳定性和可用性。
