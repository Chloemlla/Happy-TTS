# Redis 依赖安装说明

## 安装 Redis 客户端库

要启用 Redis IP 封禁功能，需要安装 `redis` npm 包：

```bash
npm install redis
```

或使用其他包管理器：

```bash
# Yarn
yarn add redis

# PNPM
pnpm add redis
```

## 安装后的步骤

1. **重启开发服务器**（如果正在运行）
2. **配置环境变量**：在 `.env` 文件中添加 `REDIS_URL`
3. **启动 Redis 服务**：确保 Redis 服务正在运行

## 验证安装

启动应用后，检查日志输出：

- ✅ 成功：`✅ Redis 连接成功`
- ⚠️ 未配置：`📦 Redis URL 未配置，IP封禁将使用 MongoDB 存储`
- ❌ 失败：`❌ Redis 初始化失败`

## TypeScript 类型定义

`redis` 包已包含 TypeScript 类型定义，无需额外安装 `@types/redis`。

## 可选：不使用 Redis

如果不想使用 Redis，可以：
1. 不安装 `redis` 包
2. 不配置 `REDIS_URL` 环境变量
3. 系统会自动使用 MongoDB 存储 IP 封禁信息

这不会影响系统的正常运行。
