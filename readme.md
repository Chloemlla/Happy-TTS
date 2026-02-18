# Happy TTS - 智能语音合成平台

一个功能丰富的全栈应用，集成了文本转语音、用户认证、数据分析、资源管理等多个模块。基于 Node.js + Express 后端和 React + Vite 前端构建。

## 📋 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [API 文档](#api-文档)
- [部署](#部署)
- [开发指南](#开发指南)

## 🎯 项目概述

Happy TTS 是一个综合性的 Web 应用平台，提供：

- **文本转语音 (TTS)** - 高质量的语音合成服务
- **用户认证系统** - 支持邮箱、TOTP、Passkey 等多种认证方式
- **智能人机验证** - 防止滥用和自动化攻击
- **资源商店** - 管理和分发数字资源
- **数据分析** - 收集和分析用户行为数据
- **实用工具** - 字数统计、大小写转换、年龄计算等
- **游戏和娱乐** - 抽奖系统、硬币翻转、老虎冒险等
- **管理后台** - 完整的系统管理和监控功能

## ✨ 核心功能

### 认证与安全
- **多因素认证 (MFA)**
  - TOTP (Time-based One-Time Password)
  - Passkey/WebAuthn
  - 邮箱验证
  - 备份码

- **安全防护**
  - IP 封禁管理
  - 速率限制 (Rate Limiting)
  - WAF (Web Application Firewall)
  - 篡改检测
  - 智能人机验证

### 文本转语音
- 支持多种语言和音色
- 音频文件生成和缓存
- 历史记录管理
- 生成统计分析

### 用户管理
- 用户注册和登录
- 个人资料管理
- API 密钥管理
- 审计日志记录

### 数据管理
- 数据收集和处理
- 用户行为分析
- 查询统计
- 数据导出

### 资源管理
- 资源商店 (CDK、模组等)
- 资源上传和下载
- 库存管理
- 交易记录

### 实用工具
- **文本工具**
  - 字数统计
  - 大小写转换
  - Markdown 导出

- **生活工具**
  - 年龄计算器
  - 硬币翻转
  - 抽奖系统
  - 日志分享

- **查询工具**
  - FBI 通缉犯查询
  - 安踏防伪查询
  - GitHub 账单查询
  - IP 位置查询

### 社交与通知
- 邮件发送服务
- 外部邮件集成
- 通知系统
- Webhook 事件

## 🛠 技术栈

### 后端
- **运行时**: Node.js 18+
- **框架**: Express.js 5.x
- **数据库**: MongoDB + Mongoose
- **缓存**: Redis
- **认证**: JWT, WebAuthn
- **API 文档**: Swagger/OpenAPI 3.0
- **日志**: Winston
- **安全**: Helmet, CORS, WAF

### 前端
- **框架**: React 19
- **构建工具**: Vite 7
- **路由**: React Router 7
- **样式**: Tailwind CSS
- **动画**: Framer Motion
- **UI 组件**: Radix UI
- **状态管理**: React Hooks
- **HTTP 客户端**: Axios
- **代码高亮**: Prism.js, React Syntax Highlighter

### DevOps
- **容器化**: Docker + Docker Compose
- **代码混淆**: JavaScript Obfuscator
- **代码质量**: Biome
- **测试**: Jest, Vitest
- **监控**: Microsoft Clarity

## 📁 项目结构

```
happy-tts/
├── src/                          # 后端源代码
│   ├── app.ts                   # 应用入口
│   ├── config.ts                # 配置文件
│   ├── config/                  # 配置目录
│   ├── controllers/             # 请求处理器 (28 个模块)
│   │   ├── authController.ts
│   │   ├── ttsController.ts
│   │   ├── adminController.ts
│   │   ├── userService.ts
│   │   └── ...
│   ├── routes/                  # API 路由 (42 个路由文件)
│   │   ├── authRoutes.ts
│   │   ├── ttsRoutes.ts
│   │   ├── adminRoutes.ts
│   │   └── ...
│   ├── services/                # 业务逻辑服务 (50+ 个服务)
│   │   ├── ttsService.ts
│   │   ├── userService.ts
│   │   ├── mongoService.ts
│   │   ├── redisService.ts
│   │   ├── emailService.ts
│   │   ├── passkeyService.ts
│   │   ├── smartHumanCheckService.ts
│   │   └── ...
│   ├── middleware/              # 中间件
│   │   ├── authenticateToken.ts
│   │   ├── corsMiddleware.ts
│   │   ├── ipBanCheck.ts
│   │   ├── routeLimiters.ts
│   │   ├── wafMiddleware.ts
│   │   └── ...
│   ├── models/                  # 数据模型
│   ├── types/                   # TypeScript 类型定义
│   ├── utils/                   # 工具函数
│   ├── templates/               # 邮件模板
│   └── tests/                   # 测试文件
│
├── frontend/                     # 前端源代码
│   ├── src/
│   │   ├── App.tsx              # 主应用组件
│   │   ├── main.tsx             # 入口文件
│   │   ├── components/          # React 组件 (100+ 个)
│   │   │   ├── TtsPage.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── ResourceStoreApp.tsx
│   │   │   └── ...
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── api/                 # API 调用
│   │   ├── types/               # TypeScript 类型
│   │   ├── utils/               # 工具函数
│   │   ├── styles/              # 样式文件
│   │   └── config/              # 前端配置
│   ├── vite.config.ts           # Vite 配置
│   ├── tailwind.config.js       # Tailwind 配置
│   ├── package.json
│   └── index.html
│
├── worker/                       # Cloudflare Worker (可选)
│   ├── src/
│   ├── wrangler.toml
│   └── package.json
│
├── data/                         # 数据目录
│   ├── users.json
│   ├── chat_history.json
│   ├── blocked-ips.json
│   ├── logs/
│   └── exports/
│
├── Dockerfile                    # Docker 镜像配置
├── docker-compose.yml            # Docker Compose 配置
├── package.json                  # 后端依赖
├── tsconfig.json                 # TypeScript 配置
├── jest.config.js                # Jest 测试配置
├── biome.json                    # Biome 代码质量配置
└── openapi.json                  # OpenAPI 文档

```

## 🚀 快速开始

### 前置要求
- Node.js 18.20.8+
- pnpm 1.22.22+
- MongoDB (可选，支持文件存储模式)
- Redis (可选，用于缓存)

### 安装依赖

```bash
# 安装后端依赖
pnpm install

# 安装前端依赖
cd frontend && pnpm install && cd ..
```

### 开发模式

```bash
# 启动后端和前端开发服务器
pnpm run dev

# 或分别启动
pnpm run dev:backend    # 后端: http://localhost:3000
pnpm run dev:frontend   # 前端: http://localhost:3001
```

### 生产构建

```bash
# 构建后端和前端
pnpm run build

# 启动生产服务器
pnpm start
```

### Docker 部署

```bash
# 构建 Docker 镜像
docker build -t happy-tts:latest .

# 使用 Docker Compose
docker-compose up -d
```

## 🔧 环境配置

### 必需的环境变量

创建 `.env` 文件：

```env
# 服务器配置
NODE_ENV=development
PORT=3000
TZ=Asia/Shanghai

# OpenAI 配置
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1

# 数据库配置
MONGO_URI=mongodb://user:password@host:27017/tts
USER_STORAGE_MODE=mongo  # 或 'file'

# Redis 配置 (可选)
REDIS_URL=redis://localhost:6379

# 认证配置
JWT_SECRET=your-secret-key
ADMIN_PASSWORD=admin
SERVER_PASSWORD=1145

# 邮件服务
RESEND_API_KEY=re_xxx
RESEND_DOMAIN=example.com
EMAIL_USER=noreply@example.com

# Turnstile 验证码
TURNSTILE_SITE_KEY=0x4xxx
TURNSTILE_SECRET_KEY=0x4xxx

# WebAuthn 配置
RP_ID=localhost
RP_ORIGIN=http://localhost:3001

# 前端配置
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_NODE_ENV=development

# 其他配置
AES_KEY=your-aes-key
GENERATION_CODE=happyclo
LOCAL_IPS=127.0.0.1,::1
```

### 前端环境变量

在 `frontend/.env` 中配置：

```env
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_NODE_ENV=development
VITE_CLOUDFLARE_TURNSTILE_SITE_KEY=0x4xxx
VITE_ENABLE_TURNSTILE=false
```

## 📚 API 文档

### 访问 API 文档

- **Swagger UI**: http://localhost:3000/api-docs
- **OpenAPI JSON**: http://localhost:3000/openapi.json

### 主要 API 端点

#### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户登出
- `GET /api/auth/me` - 获取当前用户信息

#### 文本转语音
- `POST /api/tts/generate` - 生成语音
- `GET /api/tts/history` - 获取生成历史

#### 用户管理
- `GET /api/admin/users` - 获取用户列表
- `PUT /api/admin/users/:id` - 更新用户
- `DELETE /api/admin/users/:id` - 删除用户

#### 资源管理
- `GET /api/resources` - 获取资源列表
- `POST /api/resources` - 创建资源
- `PUT /api/resources/:id` - 更新资源
- `DELETE /api/resources/:id` - 删除资源

#### 数据收集
- `POST /api/data-collection` - 收集数据
- `GET /api/data-collection/stats` - 获取统计信息

#### 其他
- `GET /health` - 健康检查
- `GET /ip` - 获取客户端 IP 信息
- `GET /api-docs.json` - OpenAPI 文档

## 🐳 部署

### Docker 部署

```bash
# 构建镜像
docker build -t happy-tts:latest .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -p 3001:3001 \
  -e OPENAI_API_KEY=sk-xxx \
  -e MONGO_URI=mongodb://... \
  -v ./data:/app/data \
  happy-tts:latest
```

### Docker Compose 部署

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止服务
docker-compose down
```

### 环境变量优化

- **文件存储模式**: `USER_STORAGE_MODE=file` (无需 MongoDB)
- **最小化构建**: `pnpm run build:minimal`
- **简化构建**: `pnpm run build:simple`

## 👨‍💻 开发指南

### 项目脚本

```bash
# 开发
pnpm run dev              # 启动开发服务器
pnpm run dev:backend      # 仅启动后端
pnpm run dev:frontend     # 仅启动前端
pnpm run dev:docs         # 启动文档服务器

# 构建
pnpm run build            # 完整构建
pnpm run build:backend    # 仅构建后端
pnpm run build:frontend   # 仅构建前端
pnpm run build:minimal    # 最小化构建

# 测试
pnpm run test             # 运行所有测试
pnpm run test:coverage    # 生成覆盖率报告
pnpm run test:watch       # 监听模式

# 代码质量
pnpm run check:api-docs   # 检查 API 文档
pnpm run analyze:bundle   # 分析打包体积

# 生产
pnpm run prod             # 构建并启动生产服务器
pnpm start                # 启动生产服务器
```

### 后端路由模块 (42 个)

| 路由 | 功能 |
|------|------|
| `authRoutes` | 用户认证 (登录、注册、登出) |
| `ttsRoutes` | 文本转语音服务 |
| `adminRoutes` | 管理员功能 |
| `userRoutes` | 用户管理 |
| `passkeyRoutes` | WebAuthn/Passkey 认证 |
| `totpRoutes` | TOTP 双因素认证 |
| `apiKeyRoutes` | API 密钥管理 |
| `resourceRoutes` | 资源管理 |
| `lotteryRoutes` | 抽奖系统 |
| `mediaRoutes` | 媒体管理 |
| `emailRoutes` | 邮件服务 |
| `outemailRoutes` | 外部邮件集成 |
| `dataCollectionRoutes` | 数据收集 |
| `dataProcessRoutes` | 数据处理 |
| `humanCheckRoutes` | 人机验证 |
| `turnstileRoutes` | Turnstile 验证码 |
| `shortUrlRoutes` | 短链接管理 |
| `webhookRoutes` | Webhook 管理 |
| `webhookEventRoutes` | Webhook 事件 |
| `ipfsRoutes` | IPFS 集成 |
| `networkRoutes` | 网络工具 |
| `socialRoutes` | 社交功能 |
| `lifeRoutes` | 生活工具 |
| `libreChatRoutes` | LibreChat 集成 |
| `commandRoutes` | 命令执行 |
| `debugConsoleRoutes` | 调试控制台 |
| `logRoutes` | 日志管理 |
| `statusRouter` | 状态检查 |
| `policyRoutes` | 政策管理 |
| `tamperRoutes` | 篡改检测 |
| `modlistRoutes` | 模组列表 |
| `cdkRoutes` | CDK 管理 |
| `imageDataRoutes` | 图片数据 |
| `fbiWantedRoutes` | FBI 通缉犯 |
| `antaRoutes` | 安踏防伪 |
| `githubBillingRoutes` | GitHub 账单 |
| `miniapiRoutes` | 迷你 API |
| `recommendationRoutes` | 推荐系统 |
| `auditLogRoutes` | 审计日志 |
| `invitationRoutes` | 邀请系统 |
| `workspaceRoutes` | 工作区管理 |
| `analyticsRoutes` | 分析统计 |

### 后端服务模块 (50+)

主要服务包括：

- **认证**: `authService`, `passkeyService`, `totpService`
- **核心**: `ttsService`, `userService`, `mongoService`, `redisService`
- **安全**: `smartHumanCheckService`, `tamperService`, `ipBanSyncService`
- **数据**: `dataCollectionService`, `dataProcessService`, `usageAnalyticsService`
- **资源**: `resourceService`, `shortUrlService`, `cdkService`
- **通信**: `emailService`, `outEmailService`, `webhookEventService`
- **工具**: `lifeService`, `networkService`, `mediaService`
- **管理**: `auditLogService`, `apiKeyService`, `workspaceService`

### 前端组件 (100+)

主要组件包括：

- **认证**: `LoginPage`, `RegisterPage`, `AuthForm`, `PasskeySetup`
- **核心**: `TtsPage`, `AdminDashboard`, `UserProfile`
- **工具**: `CaseConverter`, `WordCountPageSimple`, `AgeCalculatorPage`
- **资源**: `ResourceStoreApp`, `CDKStoreManager`, `ModListPage`
- **游戏**: `LotteryPage`, `CoinFlip`, `TigerAdventure`
- **查询**: `FBIWantedPublic`, `AntiCounterfeitPage`, `GitHubBillingDashboard`
- **演示**: `DemoHub`, `XiaohongshuDemo`, `MeditationAppDemo`

### 代码规范

- **后端**: TypeScript + Express.js
- **前端**: React + TypeScript
- **代码质量**: Biome (格式化和 Lint)
- **测试**: Jest (后端) + Vitest (前端)

### 常见开发任务

#### 添加新的 API 端点

1. 在 `src/routes/` 中创建路由文件
2. 在 `src/controllers/` 中创建控制器
3. 在 `src/services/` 中实现业务逻辑
4. 在 `src/app.ts` 中注册路由

#### 添加新的前端页面

1. 在 `frontend/src/components/` 中创建组件
2. 在 `frontend/src/App.tsx` 中添加路由
3. 使用 React Router 进行导航

#### 添加数据库模型

1. 在 `src/models/` 中定义 Mongoose Schema
2. 在服务中使用模型进行 CRUD 操作

## 📊 监控和日志

### 日志系统

- **后端日志**: `data/logs/` 目录
- **日志库**: Winston
- **日志级别**: error, warn, info, debug

### 健康检查

```bash
# 检查服务器状态
curl http://localhost:3000/health

# 响应示例
{
  "status": "ok",
  "uptime": 3600,
  "mongo": "connected",
  "wsConnections": 5,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 性能监控

- **Microsoft Clarity**: 用户行为分析
- **Bundle 分析**: `pnpm run analyze:bundle`
- **性能测试**: `pnpm run test:performance`

## 🔐 安全特性

- **HTTPS/TLS**: 生产环境强制 HTTPS
- **CORS**: 严格的跨域资源共享配置
- **CSP**: 内容安全策略
- **Helmet**: 安全 HTTP 头
- **WAF**: Web 应用防火墙
- **IP 封禁**: 自动检测和封禁恶意 IP
- **速率限制**: 防止 DDoS 和滥用
- **输入验证**: 所有输入都经过验证和清理
- **SQL 注入防护**: 使用 ORM 和参数化查询
- **XSS 防护**: DOMPurify 和 CSP

## 📝 许可证

MIT License

## 👥 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 支持

- 📧 邮件: admin@example.com
- 🐛 Bug 报告: GitHub Issues
- 💬 讨论: GitHub Discussions

---

**最后更新**: 2024 年
**版本**: 1.0.0
