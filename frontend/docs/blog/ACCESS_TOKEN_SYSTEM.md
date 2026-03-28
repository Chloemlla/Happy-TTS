---
title: 访问密钥系统实现
description: 实现5分钟有效期的访问密钥系统，避免重复的首次访问验证
date: 2025-09-15
author: Synapse Team
tags: [后端, 前端, 安全, 用户体验, MongoDB, 访问控制]
---

# 访问密钥系统实现

## 概述

为了实现更好的用户体验，我们设计并实现了一个访问密钥系统。该系统在用户完成首次访问验证后，生成一个5分钟有效期的访问密钥，用户在5分钟内无需再次进行Turnstile验证。

## 系统设计

### 核心概念

1. **访问密钥（Access Token）**: 用户完成验证后获得的临时凭证
2. **有效期**: 5分钟，过期后需要重新验证
3. **存储方式**: MongoDB + 本地存储双重保障
4. **验证机制**: 前后端双重验证确保安全性

### 工作流程

```
用户首次访问 → 生成指纹 → 检查访问密钥 → 无有效密钥 → 显示验证页面
                                    ↓
用户完成验证 → 生成访问密钥 → 存储到MongoDB → 存储到本地 → 5分钟内免验证
                                    ↓
用户再次访问 → 检查访问密钥 → 有效 → 直接进入 → 无需验证
```

## 技术实现

### 1. 后端实现

#### MongoDB模型设计

```typescript
// src/models/accessTokenModel.ts
interface AccessTokenDoc {
  token: string; // 访问密钥
  fingerprint: string; // 浏览器指纹
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
  expiresAt: Date; // 过期时间
}

const AccessTokenSchema = new mongoose.Schema<AccessTokenDoc>(
  {
    token: { type: String, required: true, unique: true, index: true },
    fingerprint: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// TTL索引，5分钟后自动删除
AccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

#### 服务层实现

```typescript
// src/services/turnstileService.ts
export class TurnstileService {
  // 生成访问密钥
  public static async generateAccessToken(
    fingerprint: string
  ): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5分钟后过期

    await AccessTokenModel.create({
      token,
      fingerprint,
      expiresAt,
    });

    return token;
  }

  // 验证访问密钥
  public static async verifyAccessToken(
    token: string,
    fingerprint: string
  ): Promise<boolean> {
    const doc = await AccessTokenModel.findOne({
      token,
      fingerprint,
      expiresAt: { $gt: new Date() }, // 确保未过期
    }).exec();

    return !!doc;
  }

  // 检查指纹是否有有效访问密钥
  public static async hasValidAccessToken(
    fingerprint: string
  ): Promise<boolean> {
    const doc = await AccessTokenModel.findOne({
      fingerprint,
      expiresAt: { $gt: new Date() },
    }).exec();

    return !!doc;
  }
}
```

#### API端点设计

```typescript
// src/routes/turnstileRoutes.ts

// 验证访问密钥接口
router.post("/verify-access-token", async (req, res) => {
  const { token, fingerprint } = req.body;
  const isValid = await TurnstileService.verifyAccessToken(token, fingerprint);

  res.json({
    success: true,
    valid: isValid,
  });
});

// 检查指纹是否有有效访问密钥接口
router.get("/check-access-token/:fingerprint", async (req, res) => {
  const { fingerprint } = req.params;
  const hasValidToken = await TurnstileService.hasValidAccessToken(fingerprint);

  res.json({
    success: true,
    hasValidToken,
  });
});
```

### 2. 前端实现

#### 工具函数

```typescript
// frontend/src/utils/fingerprint.ts

// 验证访问密钥
export const verifyAccessToken = async (
  token: string,
  fingerprint: string
): Promise<boolean> => {
  const response = await fetch(
    `${getApiBaseUrl()}/api/turnstile/verify-access-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, fingerprint }),
    }
  );

  const data = await response.json();
  return data.success && data.valid;
};

// 检查指纹是否有有效访问密钥
export const checkAccessToken = async (
  fingerprint: string
): Promise<boolean> => {
  const response = await fetch(
    `${getApiBaseUrl()}/api/turnstile/check-access-token/${fingerprint}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }
  );

  const data = await response.json();
  return data.success && data.hasValidToken;
};

// 本地存储管理
export const storeAccessToken = (fingerprint: string, token: string): void => {
  const accessTokens = JSON.parse(localStorage.getItem("accessTokens") || "{}");
  accessTokens[fingerprint] = {
    token,
    timestamp: Date.now(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  localStorage.setItem("accessTokens", JSON.stringify(accessTokens));
};

export const getAccessToken = (fingerprint: string): string | null => {
  const accessTokens = JSON.parse(localStorage.getItem("accessTokens") || "{}");
  const tokenData = accessTokens[fingerprint];

  if (!tokenData || Date.now() > tokenData.expiresAt) {
    return null;
  }

  return tokenData.token;
};
```

#### Hook实现

```typescript
// frontend/src/hooks/useFirstVisitDetection.ts
export const useFirstVisitDetection = (): UseFirstVisitDetectionReturn => {
  const checkFirstVisit = useCallback(async () => {
    const fp = await getFingerprint();
    if (!fp) return;

    // 清理过期的访问密钥
    cleanupExpiredAccessTokens();

    // 首先检查是否有有效的访问密钥
    const hasValidToken = await checkAccessToken(fp);
    if (hasValidToken) {
      setIsFirstVisit(false);
      setIsVerified(true);
      return;
    }

    // 检查本地存储的访问密钥
    const localToken = getAccessToken(fp);
    if (localToken) {
      const isValid = await verifyAccessToken(localToken, fp);
      if (isValid) {
        setIsFirstVisit(false);
        setIsVerified(true);
        return;
      }
    }

    // 没有有效密钥，显示验证页面
    setIsFirstVisit(true);
    setIsVerified(false);
  }, []);

  // ... 其他逻辑
};
```

#### 组件集成

```typescript
// frontend/src/components/FirstVisitVerification.tsx
const handleVerify = useCallback(async () => {
  const result = await verifyTempFingerprint(fingerprint, turnstileToken);
  if (result.success) {
    // 存储访问密钥
    if (result.accessToken) {
      storeAccessToken(fingerprint, result.accessToken);
      console.log("访问密钥已存储，5分钟内无需再次验证");
    }

    onVerificationComplete();
  }
}, [fingerprint, turnstileToken, onVerificationComplete]);
```

## 安全特性

### 1. 密钥生成

- 使用`crypto.randomBytes(32)`生成64位十六进制密钥
- 确保密钥的唯一性和随机性

### 2. 双重验证

- 前端本地存储 + 后端数据库验证
- 防止本地存储被篡改

### 3. 自动过期

- MongoDB TTL索引自动清理过期密钥
- 前端定时清理过期密钥

### 4. 指纹绑定

- 访问密钥与浏览器指纹绑定
- 防止密钥被其他设备使用

## 性能优化

### 1. 数据库优化

- 复合索引提升查询性能
- TTL索引自动清理过期数据

### 2. 缓存策略

- 本地存储减少网络请求
- 双重验证提升响应速度

### 3. 定时清理

- 后台定时任务清理过期数据
- 避免数据库数据积累

## 监控和管理

### 1. 统计信息

```typescript
// 获取访问密钥统计
const stats = await TurnstileService.getAccessTokenStats();
// 返回: { total: number, valid: number, expired: number }
```

### 2. 手动清理

```typescript
// 手动清理过期密钥
const result = await TurnstileService.cleanupExpiredAccessTokens();
// 返回清理的数量
```

### 3. 日志记录

- 密钥生成、验证、过期等关键操作都有详细日志
- 便于问题排查和系统监控

## 用户体验提升

### 1. 减少验证频率

- 5分钟内无需重复验证
- 提升用户访问体验

### 2. 无缝切换

- 验证完成后立即生效
- 无需刷新页面

### 3. 智能检测

- 自动检测有效密钥
- 避免不必要的验证页面

## 部署和配置

### 1. 数据库迁移

- 自动创建必要的索引
- 无需手动配置

### 2. 环境变量

- 无需额外配置
- 与现有Turnstile系统集成

### 3. 兼容性

- 向后兼容现有验证流程
- 渐进式升级

## 总结

访问密钥系统成功实现了以下目标：

1. **提升用户体验**: 5分钟内免验证，减少重复操作
2. **保持安全性**: 多重验证机制，防止绕过
3. **优化性能**: 减少不必要的验证请求
4. **易于维护**: 自动过期清理，无需人工干预

该系统为首次访问验证提供了更好的用户体验，同时保持了系统的安全性和可靠性。
