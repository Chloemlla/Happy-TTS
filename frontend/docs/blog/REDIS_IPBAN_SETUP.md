---
title: Redis IP封禁配置指南
description: 使用Redis优化IP封禁系统，提供更快的查询速度和更好的性能
date: 2025-11-22
author: Synapse Team
tags: [后端, Redis, 安全, IP封禁, 性能优化, 配置]
---

# Redis IP 封禁配置指南

本系统支持使用 Redis 或 MongoDB 存储 IP 封禁信息。当配置了 Redis 时，系统会优先使用 Redis 进行 IP 封禁检查，提供更快的查询速度和更好的性能。

## 功能特性

✅ **双存储支持**：支持 Redis 和 MongoDB 两种存储方式
✅ **自动降级**：Redis 不可用时自动降级到 MongoDB
✅ **自动过期**：利用 Redis TTL 自动清理过期封禁
✅ **高性能**：Redis 内存存储，查询速度极快
✅ **无缝切换**：无需修改代码，只需配置环境变量

## 配置步骤

### 1. 安装 Redis 依赖

```bash
npm install redis
# 或
yarn add redis
# 或
pnpm add redis
```

### 2. 配置环境变量

在 `.env` 文件中添加 Redis 连接 URL：

```env
# Redis 配置（可选）
REDIS_URL=redis://localhost:6379

# 如果 Redis 需要密码
REDIS_URL=redis://:your_password@localhost:6379

# 如果使用 Redis Cloud 或其他云服务
REDIS_URL=redis://username:password@your-redis-host:port
```

### 3. 存储方式选择

系统会根据配置自动选择存储方式：

- **配置了 `REDIS_URL`**：优先使用 Redis 存储
- **未配置 `REDIS_URL`**：使用 MongoDB 存储
- **Redis 连接失败**：自动降级到 MongoDB

## Redis 连接示例

### 本地 Redis（无密码）
```env
REDIS_URL=redis://localhost:6379
```

### 本地 Redis（有密码）
```env
REDIS_URL=redis://:mypassword@localhost:6379
```

### Redis Cloud
```env
REDIS_URL=redis://default:your_password@redis-12345.c123.us-east-1-2.ec2.cloud.redislabs.com:12345
```

### Upstash Redis
```env
REDIS_URL=redis://default:your_token@your-endpoint.upstash.io:6379
```

### AWS ElastiCache
```env
REDIS_URL=redis://your-cluster.cache.amazonaws.com:6379
```

## 使用说明

### 封禁 IP

使用现有的 API 端点封禁 IP，系统会自动将数据存储到 Redis（如果配置了）：

```bash
POST /api/turnstile/ban-ips
Authorization: Bearer <admin_token>

{
  "ipAddresses": ["192.168.1.100"],
  "reason": "恶意攻击",
  "durationMinutes": 60
}
```

### 解封 IP

```bash
POST /api/turnstile/unban-ips
Authorization: Bearer <admin_token>

{
  "ipAddresses": ["192.168.1.100"]
}
```

### 查询封禁状态

所有请求都会自动检查 IP 是否被封禁：
- 如果配置了 Redis，优先从 Redis 查询
- 如果 Redis 不可用，从 MongoDB 查询
- 白名单路径（`/health`, `/status` 等）不进行检查

## 数据结构

### Redis 存储格式

```
Key: ipban:192.168.1.100
Value: {
  "ip": "192.168.1.100",
  "reason": "恶意攻击",
  "bannedAt": 1700000000000,
  "expiresAt": 1700003600000,
  "fingerprint": "abc123...",
  "userAgent": "Mozilla/5.0...",
  "violationCount": 1
}
TTL: 3600 秒（自动过期）
```

### MongoDB 存储格式

```javascript
{
  ipAddress: "192.168.1.100",
  reason: "恶意攻击",
  violationCount: 1,
  bannedAt: ISODate("2025-11-17T12:00:00.000Z"),
  expiresAt: ISODate("2025-11-17T13:00:00.000Z"),
  fingerprint: "abc123...",
  userAgent: "Mozilla/5.0..."
}
```

## 性能对比

| 存储方式 | 查询速度 | 自动过期 | 持久化 | 适用场景 |
|---------|---------|---------|--------|---------|
| Redis   | < 1ms   | ✅ 自动  | 可选   | 高并发、临时封禁 |
| MongoDB | 5-10ms  | ✅ TTL索引 | ✅ 持久 | 需要历史记录 |

## 监控和维护

### 查看 Redis 连接状态

系统启动时会在日志中显示 Redis 连接状态：

```
✅ Redis 连接成功
```

或

```
📦 Redis URL 未配置，IP封禁将使用 MongoDB 存储
```

### 手动清理过期记录

Redis 会自动清理过期记录，MongoDB 使用 TTL 索引自动清理。

如需手动清理 Redis 过期记录：

```javascript
const { redisService } = require('./src/services/redisService');
await redisService.cleanupExpiredBans();
```

## 故障排查

### Redis 连接失败

如果看到以下错误：
```
❌ Redis 错误: ECONNREFUSED
```

检查：
1. Redis 服务是否正在运行
2. `REDIS_URL` 配置是否正确
3. 防火墙是否允许连接
4. Redis 密码是否正确

### 自动降级

即使 Redis 连接失败，系统也会自动降级到 MongoDB，不影响服务可用性：

```
⚠️ Redis 检查失败，降级到 MongoDB
```

## 最佳实践

1. **生产环境**：推荐使用 Redis，提供更好的性能
2. **开发环境**：可以只使用 MongoDB，简化配置
3. **高可用**：使用 Redis Cluster 或 Sentinel
4. **监控**：监控 Redis 连接状态和内存使用
5. **备份**：定期备份 MongoDB 数据（Redis 数据可选）

## 数据同步

### 自动同步

系统已集成自动同步服务，每 5 分钟自动执行 MongoDB ↔ Redis 双向同步：

**MongoDB → Redis 同步：**
- 将 MongoDB 中的封禁记录同步到 Redis
- 智能合并：比较过期时间，使用较晚的那个
- 合并违规次数：取较大值
- 合并原因：如果不同则拼接

**Redis → MongoDB 同步：**
- 将 Redis 中的新增封禁记录同步回 MongoDB
- 更新 MongoDB 中的过期时间（如果 Redis 更晚）
- 确保数据持久化

### 手动同步

**触发同步：**
```bash
POST /api/turnstile/sync-ipbans
Authorization: Bearer <admin_token>
```

**查看同步状态：**
```bash
GET /api/turnstile/sync-status
Authorization: Bearer <admin_token>
```

响应示例：
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "isSyncEnabled": true,
    "lastCleanup": "2025-11-17T12:00:00.000Z",
    "lastSync": "2025-11-17T12:05:00.000Z",
    "ipBanSyncStatus": {
      "isRunning": true,
      "isSyncing": false,
      "syncInterval": 300000,
      "redisAvailable": true
    }
  }
}
```

### 同步策略

**智能合并规则：**
1. **过期时间**：使用较晚的过期时间
2. **违规次数**：取较大值
3. **封禁原因**：如果不同则拼接
4. **指纹和 UA**：优先使用非空值

**同步频率：**
- 自动同步：每 5 分钟
- 手动同步：随时可触发
- 启动同步：服务启动时立即执行一次

## 注意事项

⚠️ **Redis 数据持久化**：建议配置 Redis RDB 或 AOF 以防止数据丢失。

✅ **自动同步**：系统已实现双向同步，无需手动干预。

✅ **数据一致性**：智能合并策略确保两个存储系统的数据一致。

## 环境变量完整示例

```env
# MongoDB（必需）
MONGO_URI=mongodb://localhost:27017/your_database

# Redis（可选，配置后优先使用）
REDIS_URL=redis://localhost:6379

# 其他配置...
JWT_SECRET=your_secret_key
ADMIN_PASSWORD=your_admin_password
```

## 技术支持

如有问题，请查看：
- Redis 官方文档：https://redis.io/docs/
- Node Redis 文档：https://github.com/redis/node-redis
- 项目 Issues：https://github.com/your-repo/issues
