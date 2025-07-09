---
title: 后端速率限制配置文档
date: 2025-07-07
slug: rate-limiting-config
tags: [rate-limit, backend, config, blog]
---

# 后端速率限制配置文档

## 概述

本后端系统已实现全面的速率限制功能，防止拒绝服务攻击和 API 滥用。所有路由都受到适当的速率限制保护。

## 速率限制策略

### 1. 认证相关路由

| 路由           | 限制          | 时间窗口 | 说明                 |
| -------------- | ------------- | -------- | -------------------- |
| `/api/auth/*`  | 30 次/分钟    | 1 分钟   | 登录、注册等认证操作 |
| `/api/auth/me` | 300 次/5 分钟 | 5 分钟   | 用户信息查询（高频） |

### 2. TTS 相关路由

| 路由                | 限制       | 时间窗口 | 说明                       |
| ------------------- | ---------- | -------- | -------------------------- |
| `/api/tts/generate` | 10 次/分钟 | 1 分钟   | TTS 语音生成（资源密集型） |
| `/api/tts/history`  | 20 次/分钟 | 1 分钟   | 历史记录查询               |

### 3. 二次验证路由

| 路由             | 限制         | 时间窗口 | 说明                     |
| ---------------- | ------------ | -------- | ------------------------ |
| `/api/totp/*`    | 20 次/5 分钟 | 5 分钟   | TOTP 操作（安全敏感）    |
| `/api/passkey/*` | 30 次/5 分钟 | 5 分钟   | Passkey 操作（安全敏感） |

### 4. 管理员路由

| 路由           | 限制       | 时间窗口 | 说明       |
| -------------- | ---------- | -------- | ---------- |
| `/api/admin/*` | 50 次/分钟 | 1 分钟   | 管理员操作 |

### 5. 功能路由

| 路由                     | 限制       | 时间窗口 | 说明           |
| ------------------------ | ---------- | -------- | -------------- |
| `/api/tamper/*`          | 30 次/分钟 | 1 分钟   | 防篡改验证     |
| `/api/command/*`         | 10 次/分钟 | 1 分钟   | 命令执行       |
| `/api/libre-chat/*`      | 60 次/分钟 | 1 分钟   | LibreChat 集成 |
| `/api/data-collection/*` | 30 次/分钟 | 1 分钟   | 数据收集       |
| `/api/logs/*`            | 20 次/分钟 | 1 分钟   | 日志查询       |
| `/api/ipfs/*`            | 10 次/分钟 | 1 分钟   | IPFS 上传      |
| `/api/network/*`         | 30 次/分钟 | 1 分钟   | 网络检测       |
| `/api/data/*`            | 50 次/分钟 | 1 分钟   | 数据处理       |
| `/api/media/*`           | 20 次/分钟 | 1 分钟   | 媒体解析       |
| `/api/social/*`          | 30 次/分钟 | 1 分钟   | 社交媒体       |
| `/api/life/*`            | 20 次/分钟 | 1 分钟   | 生活服务       |
| `/api/status`            | 10 次/分钟 | 1 分钟   | 状态查询       |

### 6. 静态文件路由

| 路由              | 限制        | 时间窗口 | 说明     |
| ----------------- | ----------- | -------- | -------- |
| `/static/*`       | 100 次/分钟 | 1 分钟   | 静态文件 |
| `/static/audio/*` | 50 次/分钟  | 1 分钟   | 音频文件 |

### 7. 特殊功能路由

| 路由             | 限制       | 时间窗口 | 说明        |
| ---------------- | ---------- | -------- | ----------- |
| `/api-docs`      | 30 次/分钟 | 1 分钟   | API 文档    |
| `/integrity`     | 20 次/分钟 | 1 分钟   | 完整性检查  |
| `/`              | 30 次/分钟 | 1 分钟   | 根路径      |
| `/ip-query`      | 20 次/分钟 | 1 分钟   | IP 查询     |
| `/ip-report`     | 10 次/分钟 | 1 分钟   | IP 报告     |
| `/docs-timeout`  | 5 次/分钟  | 1 分钟   | 文档超时    |
| `/server_status` | 10 次/分钟 | 1 分钟   | 服务器状态  |
| `/ip-location`   | 20 次/分钟 | 1 分钟   | IP 位置查询 |

### 8. 全局保护

| 路由     | 限制        | 时间窗口 | 说明             |
| -------- | ----------- | -------- | ---------------- |
| 全局默认 | 100 次/分钟 | 1 分钟   | 未明确限制的路由 |
| 404 处理 | 50 次/分钟  | 1 分钟   | 无效请求         |

## 技术实现

### 1. 统一限流器配置

使用 `src/middleware/unifiedRateLimit.ts` 统一管理所有限流器配置：

```typescript
const createLimiter = (options: {
  windowMs: number;
  max: number;
  message: string;
  routeName?: string;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) =>
      req.ip || req.socket.remoteAddress || "unknown",
    skip: (req: Request): boolean => req.isLocalIp || false,
    handler: (req, res) => {
      res.status(429).json({
        error: options.message,
        route: options.routeName || req.path,
        retryAfter: Math.ceil(options.windowMs / 1000 / 60),
      });
    },
  });
};
```

### 2. 本地 IP 跳过

本地 IP 地址会自动跳过速率限制：

```typescript
skip: (req: Request): boolean => req.isLocalIp || false;
```

### 3. 监控和日志

- 所有被限制的请求都会记录到日志
- 提供速率限制监控工具 `src/utils/rateLimitMonitor.ts`
- 支持统计分析和可疑 IP 检测

## 响应格式

当请求被限制时，服务器返回 429 状态码和以下格式的响应：

```json
{
  "error": "请求过于频繁，请稍后再试",
  "route": "auth",
  "retryAfter": 1
}
```

同时返回标准的 RateLimit 响应头：

```
RateLimit-Limit: 30
RateLimit-Remaining: 0
RateLimit-Reset: 1234567890
Retry-After: 60
```

## 测试

### 运行测试

```bash
# 测试所有端点的速率限制
npm run test:rate-limit

# 测试特定端点
npm run test:rate-limit -- /api/auth/login POST '{"identifier":"test","password":"test"}'
```

### 监控速率限制

```typescript
import { getRateLimitMonitor } from "./utils/rateLimitMonitor";

const monitor = getRateLimitMonitor();
const stats = monitor.getStats();
const suspiciousIPs = monitor.getSuspiciousIPs(10);
```

## 安全考虑

1. **防止 DoS 攻击**: 限制单个 IP 的请求频率
2. **保护服务器资源**: 防止过度消耗 CPU 和内存
3. **公平使用**: 确保所有用户都能正常访问服务
4. **分层保护**: 不同功能有不同的限制策略
5. **本地开发友好**: 本地 IP 跳过限制

## 配置调整

如需调整限制参数，请修改 `src/middleware/unifiedRateLimit.ts` 中的配置：

```typescript
export const authLimiter = createLimiter({
  windowMs: 60 * 1000, // 时间窗口
  max: 30, // 最大请求数
  message: "认证请求过于频繁，请稍后再试",
  routeName: "auth",
});
```

## 监控建议

1. **监控 429 状态码**: 定期检查被限制的请求数量
2. **分析可疑 IP**: 使用监控工具检测异常 IP
3. **调整限制**: 根据实际使用情况调整限制参数
4. **日志分析**: 定期分析速率限制日志
