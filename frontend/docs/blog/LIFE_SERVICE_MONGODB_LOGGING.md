---
title: 生活信息服务MongoDB日志增强
description: 为LifeService添加详细的请求和响应日志记录到MongoDB，支持完整的API调用追踪和统计分析
date: 2025-10-19
author: Synapse Team
tags: [后端, MongoDB, 日志, 监控, 生活信息, API追踪]
---

# 生活信息服务 MongoDB 日志增强

## 概述

本文档介绍了对 `lifeService.ts` 的全面增强，包括：

1. **继承 ProductionServiceBase**：获得断路器、限流器、缓存等生产级特性
2. **MongoDB 日志记录**：详细记录所有 API 请求和响应
3. **统计分析功能**：支持 API 调用统计和历史查询

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                  生活信息服务层                                │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 限流器(200/m)│  │ 缓存(10分钟) │  │ 断路器(3次)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 手机号归属地  │  │  油价查询     │  │  外部API      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 日志记录      │  │ 统计分析     │  │ 历史查询      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ MongoDB日志   │  │ 性能监控     │  │ 健康检查      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 增强特性

### 1. 📝 MongoDB 日志记录

#### 1.1 日志数据结构

```typescript
interface LifeAPILogDoc {
  apiType: "phoneAddress" | "oilPrice";

  // 请求参数
  requestParams: {
    phone?: string; // 手机号（已脱敏）
    city?: string; // 城市名称
  };

  // 响应数据
  response: {
    success: boolean; // 是否成功
    data?: any; // 响应数据（已清洗）
    error?: string; // 错误信息
    statusCode?: number; // HTTP状态码
  };

  // 元数据
  metadata: {
    requestTime: Date; // 请求时间
    responseTime: Date; // 响应时间
    duration: number; // 耗时（毫秒）
    cacheHit: boolean; // 是否缓存命中
    rateLimited: boolean; // 是否被限流
    circuitBreakerState: string; // 断路器状态
  };

  // 客户端信息
  clientInfo?: {
    ip?: string; // 客户端IP
    userAgent?: string; // User-Agent
    userId?: string; // 用户ID
  };
}
```

#### 1.2 数据库索引设计

**单字段索引：**

```typescript
apiType: 索引                    // API类型索引
metadata.requestTime: 索引      // 时间索引
metadata.cacheHit: 索引         // 缓存命中索引
metadata.rateLimited: 索引      // 限流索引
circuitBreakerState: 索引       // 断路器状态索引
```

**复合索引：**

```typescript
// 按API类型和时间查询
{ apiType: 1, 'metadata.requestTime': -1 }

// 缓存命中统计
{ 'metadata.cacheHit': 1, 'metadata.requestTime': -1 }

// 成功率统计
{ 'response.success': 1, 'metadata.requestTime': -1 }

// 性能分析
{ 'metadata.duration': 1 }
```

#### 1.3 数据脱敏和清洗

**手机号脱敏：**

```typescript
// 原始: 13812345678
// 脱敏: 138****5678
phone: requestParams.phone
  ? requestParams.phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")
  : undefined;
```

**响应数据清洗：**

```typescript
private sanitizeResponseData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // 转换为字符串并限制大小
  const jsonStr = JSON.stringify(data);
  if (jsonStr.length > 10000) { // 限制10KB
    return {
      __truncated__: true,
      summary: jsonStr.substring(0, 500) + '...',
      size: jsonStr.length
    };
  }

  return data;
}
```

### 2. 🔍 统计分析功能

#### 2.1 API 调用统计

```typescript
const stats = await lifeService.getAPIStats({
  apiType: "phoneAddress", // 可选：指定API类型
  startDate: new Date("2025-10-01"), // 可选：开始日期
  endDate: new Date("2025-10-19"), // 可选：结束日期
});

console.log(stats);
// {
//   total: 1500,                  // 总调用次数
//   byType: [                     // 按类型分组
//     { _id: 'phoneAddress', count: 800 },
//     { _id: 'oilPrice', count: 700 }
//   ],
//   avgDuration: 250,             // 平均耗时（毫秒）
//   cacheHitRate: 0.65,           // 缓存命中率（65%）
//   successRate: 0.98             // 成功率（98%）
// }
```

**统计维度：**

- 总调用次数
- 按 API 类型分组
- 平均响应时间
- 缓存命中率
- 成功率

#### 2.2 API 调用历史查询

```typescript
const logs = await lifeService.getAPILogs({
  apiType: "oilPrice", // 可选：API类型
  startDate: new Date("2025-10-19"),
  endDate: new Date(),
  page: 1, // 页码
  limit: 20, // 每页数量
});

console.log(logs);
// {
//   logs: [
//     {
//       apiType: 'oilPrice',
//       requestParams: { city: '北京' },
//       response: {
//         success: true,
//         data: { ... },
//         statusCode: 200
//       },
//       metadata: {
//         requestTime: '2025-10-19T12:00:00Z',
//         responseTime: '2025-10-19T12:00:01Z',
//         duration: 250,
//         cacheHit: false,
//         rateLimited: false,
//         circuitBreakerState: 'CLOSED'
//       },
//       clientInfo: {
//         ip: '192.168.1.1',
//         userId: 'user123'
//       }
//     }
//   ],
//   total: 100,
//   page: 1,
//   limit: 20
// }
```

### 3. ⚡ 生产级特性（继承自 ProductionServiceBase）

#### 3.1 自定义配置

```typescript
super(
  createServiceConfig("LifeService", {
    // 限流配置
    rateLimit: {
      enabled: true,
      maxRequests: 200, // 200次/分钟（外部API查询较频繁）
      window: 60000,
    },

    // 缓存配置
    cache: {
      enabled: true,
      ttl: 600000, // 10分钟（生活信息变化不频繁）
      maxSize: 500,
    },

    // 断路器配置
    circuitBreaker: {
      enabled: true,
      threshold: 3, // 外部API更敏感，3次失败即打开
      timeout: 30000, // 30秒后尝试恢复
      successThreshold: 2,
    },

    // 健康阈值
    healthThresholds: {
      degradedResponseTime: 3000, // 外部API 3秒算降级
      unhealthyResponseTime: 8000, // 8秒算不健康
      degradedErrorRate: 0.1,
      unhealthyErrorRate: 0.3,
    },

    // 性能配置
    performance: {
      operationTimeout: 15000, // 外部API总超时15秒
    },
  })
);
```

#### 3.2 核心特性

- ✅ **限流器**：200 次/分钟，防止 API 滥用
- ✅ **缓存**：10 分钟 TTL，减少外部 API 调用
- ✅ **断路器**：3 次失败即打开，30 秒后恢复
- ✅ **性能监控**：自动统计响应时间、成功率
- ✅ **健康检查**：三级状态（healthy/degraded/unhealthy）

## 使用示例

### 1. 手机号归属地查询

```typescript
import { lifeService } from "./services/lifeService";

// 基础查询
const result = await lifeService.phoneAddress("13812345678");

if (result.success) {
  console.log("归属地信息:", result.data);
} else {
  console.error("查询失败:", result.error);
}

// 带客户端信息的查询（会记录到日志）
const resultWithClient = await lifeService.phoneAddress("13812345678", {
  ip: "192.168.1.1",
  userAgent: "Mozilla/5.0...",
  userId: "user123",
});
```

### 2. 油价查询

```typescript
// 查询全国油价
const nationalOilPrice = await lifeService.oilPrice();

// 查询特定城市油价
const beijingOilPrice = await lifeService.oilPrice("北京", {
  ip: "192.168.1.1",
  userId: "user456",
});

if (beijingOilPrice.success) {
  console.log("北京油价:", beijingOilPrice.data);
}
```

### 3. 查询 API 统计

```typescript
// 查询所有API的统计
const allStats = await lifeService.getAPIStats();

console.log("总调用次数:", allStats.total);
console.log("平均响应时间:", allStats.avgDuration + "ms");
console.log("缓存命中率:", allStats.cacheHitRate * 100 + "%");
console.log("成功率:", allStats.successRate * 100 + "%");
console.log("各API调用量:", allStats.byType);

// 查询特定时间段的统计
const weekStats = await lifeService.getAPIStats({
  startDate: new Date("2025-10-12"),
  endDate: new Date("2025-10-19"),
});

// 查询特定API的统计
const phoneStats = await lifeService.getAPIStats({
  apiType: "phoneAddress",
});
```

### 4. 查询 API 调用历史

```typescript
// 查询最近的API调用
const recentLogs = await lifeService.getAPILogs({
  page: 1,
  limit: 50,
});

console.log("总记录数:", recentLogs.total);
console.log("当前页:", recentLogs.page);

recentLogs.logs.forEach((log) => {
  console.log("API类型:", log.apiType);
  console.log("请求时间:", log.metadata.requestTime);
  console.log("耗时:", log.metadata.duration + "ms");
  console.log("缓存命中:", log.metadata.cacheHit);
  console.log("是否成功:", log.response.success);
});

// 查询特定API的历史
const phoneLogs = await lifeService.getAPILogs({
  apiType: "phoneAddress",
  startDate: new Date("2025-10-19"),
  page: 1,
  limit: 20,
});
```

### 5. 性能和健康监控

```typescript
// 获取服务性能统计
const perfStats = lifeService.getPerformanceStats();
console.log("总操作次数:", perfStats.totalOperations);
console.log("成功次数:", perfStats.successfulOperations);
console.log("失败次数:", perfStats.failedOperations);
console.log("平均响应时间:", perfStats.avgResponseTime + "ms");
console.log("缓存命中率:", perfStats.cacheHitRate * 100 + "%");
console.log("限流命中次数:", perfStats.rateLimitHits);

// 获取健康状态
const health = lifeService.getHealthStatus();
console.log("服务状态:", health.status);
console.log("断路器状态:", health.circuitBreakerState);
console.log("缓存大小:", health.cacheSize);
console.log("错误率:", health.errorRate * 100 + "%");
```

## 日志记录时机

### 完整的请求生命周期跟踪

```
用户请求
  ↓
输入验证 → 失败 → 记录验证失败日志 → 返回错误
  ↓
限流检查 → 超限 → 记录限流日志 → 返回错误
  ↓
缓存检查 → 命中 → 记录缓存命中日志 → 返回缓存数据
  ↓
断路器检查 → 打开 → 记录断路器日志 → 返回错误
  ↓
调用外部API
  ↓
成功 → 记录成功日志 → 缓存结果 → 返回数据
  ↓
失败 → 记录失败日志 → 返回错误
```

### 日志记录场景

1. **输入验证失败**：记录无效输入
2. **限流触发**：记录限流事件（rateLimited: true）
3. **缓存命中**：记录缓存使用（cacheHit: true）
4. **API 调用成功**：记录完整的请求和响应
5. **API 调用失败**：记录错误信息和状态码

## MongoDB 查询示例

### 查询缓存命中记录

```javascript
db.life_api_logs
  .find({
    "metadata.cacheHit": true,
  })
  .sort({ "metadata.requestTime": -1 })
  .limit(10);
```

### 查询限流记录

```javascript
db.life_api_logs
  .find({
    "metadata.rateLimited": true,
  })
  .sort({ "metadata.requestTime": -1 });
```

### 查询失败记录

```javascript
db.life_api_logs
  .find({
    "response.success": false,
  })
  .sort({ "metadata.requestTime": -1 })
  .limit(20);
```

### 查询慢请求（超过 3 秒）

```javascript
db.life_api_logs
  .find({
    "metadata.duration": { $gt: 3000 },
  })
  .sort({ "metadata.duration": -1 });
```

### 统计各 API 调用量

```javascript
db.life_api_logs.aggregate([
  {
    $group: {
      _id: "$apiType",
      count: { $sum: 1 },
      avgDuration: { $avg: "$metadata.duration" },
    },
  },
  { $sort: { count: -1 } },
]);
```

### 统计缓存效果

```javascript
db.life_api_logs.aggregate([
  {
    $group: {
      _id: "$metadata.cacheHit",
      count: { $sum: 1 },
    },
  },
]);
```

## API 路由集成示例

```typescript
import express from "express";
import { lifeService } from "./services/lifeService";

const router = express.Router();

// 手机号归属地查询
router.get("/phone-address/:phone", async (req, res) => {
  try {
    const result = await lifeService.phoneAddress(req.params.phone, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      userId: req.user?.id, // 如果有用户系统
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "服务器错误",
    });
  }
});

// 油价查询
router.get("/oil-price", async (req, res) => {
  try {
    const city = req.query.city as string | undefined;
    const result = await lifeService.oilPrice(city, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      userId: req.user?.id,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "服务器错误",
    });
  }
});

// API统计端点
router.get("/stats", async (req, res) => {
  try {
    const stats = await lifeService.getAPIStats({
      apiType: req.query.apiType as any,
      startDate: req.query.startDate
        ? new Date(req.query.startDate as string)
        : undefined,
      endDate: req.query.endDate
        ? new Date(req.query.endDate as string)
        : undefined,
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "获取统计失败",
    });
  }
});

// API日志查询端点（管理员）
router.get("/logs", async (req, res) => {
  try {
    const logs = await lifeService.getAPILogs({
      apiType: req.query.apiType as any,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "获取日志失败",
    });
  }
});

// 服务健康检查
router.get("/health", (req, res) => {
  const health = lifeService.getHealthStatus();
  const stats = lifeService.getPerformanceStats();

  res.status(health.status === "healthy" ? 200 : 503).json({
    health,
    stats,
  });
});

export default router;
```

## 性能基准

### API 调用性能

| 指标         | 数值             | 备注          |
| ------------ | ---------------- | ------------- |
| 平均响应时间 | < 100ms          | 缓存命中时    |
| 平均响应时间 | < 1s             | 外部 API 调用 |
| 缓存命中率   | > 60%            | 正常情况下    |
| 限流阈值     | 200 次/分钟/标识 | 可配置        |
| 日志写入延迟 | < 50ms           | 异步写入      |

### 日志存储估算

| 场景           | 单条日志大小 | 1 万次调用 | 100 万次调用 |
| -------------- | ------------ | ---------- | ------------ |
| 缓存命中       | ~500B        | ~5MB       | ~500MB       |
| API 成功（小） | ~2KB         | ~20MB      | ~2GB         |
| API 成功（大） | ~10KB        | ~100MB     | ~10GB        |
| API 失败       | ~1KB         | ~10MB      | ~1GB         |

**建议：**

- 设置 TTL 索引自动过期旧日志（如 30 天）
- 定期归档历史日志
- 对于大响应数据进行截断（已实现，10KB 限制）

## 监控和分析

### Dashboard 示例查询

**今日 API 调用趋势：**

```javascript
db.life_api_logs.aggregate([
  {
    $match: {
      "metadata.requestTime": {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
  },
  {
    $group: {
      _id: {
        $hour: "$metadata.requestTime",
      },
      count: { $sum: 1 },
      avgDuration: { $avg: "$metadata.duration" },
    },
  },
  { $sort: { _id: 1 } },
]);
```

**最慢的 10 个请求：**

```javascript
db.life_api_logs
  .find({
    "response.success": true,
  })
  .sort({ "metadata.duration": -1 })
  .limit(10);
```

**错误分析：**

```javascript
db.life_api_logs.aggregate([
  { $match: { "response.success": false } },
  {
    $group: {
      _id: "$response.error",
      count: { $sum: 1 },
    },
  },
  { $sort: { count: -1 } },
]);
```

## 部署建议

### 1. MongoDB 配置

```javascript
// 创建索引
db.life_api_logs.createIndex({ apiType: 1, "metadata.requestTime": -1 });
db.life_api_logs.createIndex({
  "metadata.cacheHit": 1,
  "metadata.requestTime": -1,
});
db.life_api_logs.createIndex({
  "response.success": 1,
  "metadata.requestTime": -1,
});
db.life_api_logs.createIndex({ "metadata.duration": 1 });

// 设置TTL索引（30天后自动删除）
db.life_api_logs.createIndex(
  { "metadata.requestTime": 1 },
  { expireAfterSeconds: 2592000 }
);
```

### 2. 监控集成

```typescript
// Prometheus metrics 端点
app.get("/metrics/life-service", (req, res) => {
  const stats = lifeService.getPerformanceStats();
  const health = lifeService.getHealthStatus();

  res.json({
    stats,
    health,
    // 自定义指标
    customMetrics: {
      cacheSize: health.cacheSize,
      circuitBreakerState: health.circuitBreakerState,
      uptime: health.uptime,
    },
  });
});
```

## 最佳实践

### 1. 客户端信息传递

```typescript
// ✅ 推荐：传递完整的客户端信息
const result = await lifeService.phoneAddress(phone, {
  ip: req.ip || req.headers["x-forwarded-for"],
  userAgent: req.headers["user-agent"],
  userId: req.user?.id,
});

// ❌ 不推荐：不传递客户端信息
const result = await lifeService.phoneAddress(phone);
```

### 2. 错误处理

```typescript
// ✅ 推荐：根据错误类型处理
const result = await lifeService.phoneAddress(phone, clientInfo);

if (!result.success) {
  if (result.error?.includes("格式无效")) {
    return res.status(400).json({ error: "手机号格式错误" });
  } else if (result.error?.includes("过于频繁")) {
    return res.status(429).json({ error: "请求过于频繁" });
  } else {
    return res.status(500).json({ error: "服务暂时不可用" });
  }
}

// ❌ 不推荐：统一返回500错误
if (!result.success) {
  return res.status(500).json(result);
}
```

### 3. 日志查询

```typescript
// ✅ 推荐：使用分页和时间范围
const logs = await lifeService.getAPILogs({
  startDate: last7Days,
  endDate: now,
  page: 1,
  limit: 50,
});

// ❌ 不推荐：查询所有历史日志
const logs = await lifeService.getAPILogs({
  page: 1,
  limit: 100000, // 会被限制为100
});
```

## 日志分析用例

### 用例 1: 监控缓存效果

```typescript
const stats = await lifeService.getAPIStats({
  startDate: new Date("2025-10-19"),
});

console.log("缓存命中率:", (stats.cacheHitRate * 100).toFixed(2) + "%");

// 如果命中率<50%，考虑：
// 1. 增加缓存TTL
// 2. 增加缓存容量
// 3. 优化缓存策略
```

### 用例 2: 分析失败原因

```typescript
const failedLogs = await lifeService.getAPILogs({
  page: 1,
  limit: 100,
});

const failureReasons = {};
failedLogs.logs
  .filter((log) => !log.response.success)
  .forEach((log) => {
    const error = log.response.error || "Unknown";
    failureReasons[error] = (failureReasons[error] || 0) + 1;
  });

console.log("失败原因统计:", failureReasons);
```

### 用例 3: 性能优化分析

```typescript
const stats = await lifeService.getAPIStats();

if (stats.avgDuration > 2000) {
  console.warn("平均响应时间过长，需要优化:");
  console.log("- 检查外部API性能");
  console.log("- 提高缓存TTL");
  console.log("- 考虑使用更快的API提供商");
}
```

## 技术亮点

### 1. 完整的追踪

- ✅ 记录所有请求（成功/失败/限流/验证失败）
- ✅ 记录缓存命中情况
- ✅ 记录断路器状态
- ✅ 记录客户端信息

### 2. 数据安全

- ✅ 手机号自动脱敏（138\*\*\*\*5678）
- ✅ 响应数据大小限制（10KB）
- ✅ Schema 严格模式
- ✅ 字段长度限制

### 3. 高性能

- ✅ 异步日志写入（不阻塞主流程）
- ✅ 日志写入失败不影响业务
- ✅ 复合索引优化查询
- ✅ 分页和限制保护

### 4. 易于分析

- ✅ 结构化日志数据
- ✅ 丰富的查询维度
- ✅ 聚合统计支持
- ✅ 时间序列分析

## 总结

`lifeService` 经过增强后，成为一个**生产级别的生活信息查询服务**：

### ✅ 生产级特性

- 继承 ProductionServiceBase 获得所有通用能力
- 断路器、限流器、缓存自动保护
- 性能监控和健康检查

### ✅ 完整的日志追踪

- 所有请求和响应详细记录
- 支持缓存、限流、断路器状态追踪
- 客户端信息完整记录

### ✅ 强大的分析能力

- API 调用统计（总量、成功率、响应时间）
- 历史记录查询（支持多维度过滤）
- 缓存效果分析
- 性能瓶颈识别

### ✅ 数据安全

- 敏感数据自动脱敏
- 响应数据大小限制
- Schema 严格验证
- 异步写入不阻塞

该服务适用于**需要外部 API 调用追踪和分析**的场景，所有日志数据可用于监控、分析、审计和性能优化。

## 相关文档

- [生产级服务基础类框架](./PRODUCTION_SERVICE_BASE.md)
- [数据收集服务增强](./DATA_COLLECTION_SERVICE_ENHANCEMENT.md)
- [CDK 兑换服务增强](./CDK_SERVICE_ENHANCEMENT.md)
