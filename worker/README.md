# Happy-TTS Cloudflare Workers 部署

本目录包含将 Happy-TTS 后端适配到 Cloudflare Workers 运行的全部代码。

## 架构说明

| 原始 (Node.js/Express) | CF Workers 适配 |
|---|---|
| Express | Hono |
| fs (文件系统) | Cloudflare KV / R2 |
| MongoDB (mongoose) | MongoDB Atlas Data API / Hyperdrive |
| Redis | Cloudflare KV |
| winston (日志) | console.log (Workers Logs) |
| bcrypt | bcryptjs (纯 JS) |
| jsonwebtoken | jose (Edge 兼容) |
| child_process | 不支持，已移除 |
| WebSocket | Durable Objects |

## 快速开始

```bash
cd worker
npm install
# 本地开发
npm run dev
# 部署
npm run deploy
```

## 环境变量 (wrangler.toml → [vars] 或 Secrets)

在 Cloudflare Dashboard 或 `wrangler secret put` 设置：

- `OPENAI_API_KEY` - OpenAI API 密钥
- `OPENAI_BASE_URL` - OpenAI API 基础 URL
- `JWT_SECRET` - JWT 签名密钥
- `ADMIN_PASSWORD` - 管理员密码
- `SERVER_PASSWORD` - 服务器密码
- `MONGO_DATA_API_KEY` - MongoDB Atlas Data API 密钥
- `MONGO_DATA_API_URL` - MongoDB Atlas Data API URL
- `TURNSTILE_SECRET_KEY` - Turnstile 密钥

## KV Namespaces

需要在 wrangler.toml 中绑定：

- `USERS_KV` - 用户数据存储
- `RATE_LIMIT_KV` - 速率限制
- `CACHE_KV` - 通用缓存
- `SESSIONS_KV` - 会话存储

## R2 Buckets

- `AUDIO_BUCKET` - 音频文件存储
- `DATA_BUCKET` - 数据文件存储 (日志、导出等)
