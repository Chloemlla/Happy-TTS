# Synapse - 智能语音合成与综合服务平台

[![Docker Image Version](https://img.shields.io/docker/v/happyclo/tts-node?sort=date&label=Docker%20Image&color=blue&logo=docker)](https://hub.docker.com/r/happyclo/tts-node/tags)
[![Docker Pulls](https://img.shields.io/docker/pulls/happyclo/tts-node?logo=docker&label=Pulls)](https://hub.docker.com/r/happyclo/tts-node)
[![Docker Image Size](https://img.shields.io/docker/image-size/happyclo/tts-node?sort=date&logo=docker&label=Image%20Size)](https://hub.docker.com/r/happyclo/tts-node)
[![License](https://img.shields.io/badge/License-Custom-red.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24%2B-339933?logo=node.js)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express)](https://expressjs.com/)

> [!CAUTION]
> **使用本项目前，请务必先阅读 [LICENSE](LICENSE) 文件。** 本项目采用自定义许可证，对使用、修改和分发有明确的限制条件。未经许可证授权的任何使用行为，由使用者自行承担全部法律责任和后果。继续使用本项目即表示您已阅读、理解并同意遵守许可证中的所有条款。

> [!IMPORTANT]
> 本项目的 Docker 镜像托管在 [Docker Hub: happyclo/tts-node](https://hub.docker.com/r/happyclo/tts-node/tags)，请始终使用最新版本的镜像以获得安全更新和功能修复。

一个功能丰富的全栈 Web 应用平台，以文本转语音（TTS）为核心，集成用户认证、安全防护、资源商店、数据分析、实用工具、娱乐游戏、管理后台等数十个功能模块。后端基于 Node.js + Express 5 + MongoDB，前端基于 React 19 + Vite 7 + Tailwind CSS，支持 Docker 一键部署。

---

## 📋 目录

- [项目概述](#项目概述)
- [核心功能模块](#核心功能模块)
  - [认证与安全](#1-认证与安全)
  - [文本转语音 (TTS)](#2-文本转语音-tts)
  - [用户管理](#3-用户管理)
  - [资源商店](#4-资源商店)
  - [数据收集与分析](#5-数据收集与分析)
  - [通信服务](#6-通信服务)
  - [实用工具](#7-实用工具)
  - [查询服务](#8-查询服务)
  - [娱乐与游戏](#9-娱乐与游戏)
  - [管理后台](#10-管理后台)
  - [网络与集成](#11-网络与集成)
  - [UI 演示中心](#12-ui-演示中心)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [API 文档](#api-文档)
- [部署](#部署)
- [开发指南](#开发指南)
- [安全特性](#安全特性)
- [监控与日志](#监控与日志)
- [许可证](#许可证)

---

## 🎯 项目概述

Synapse 是一个综合性 Web 应用平台，围绕文本转语音核心功能，扩展出完整的用户体系、安全防护、资源管理、数据分析等企业级能力。平台采用前后端分离架构，后端提供 42 个路由模块、50+ 个服务模块，前端包含 100+ 个 React 组件，覆盖认证、工具、商店、游戏、查询、管理等多个业务领域。

### 亮点特性

- 🔐 多因素认证体系（密码 + TOTP + Passkey/WebAuthn + 邮箱验证 + 备份码）
- 🛡️ 多层安全防护（WAF + IP 封禁 + 速率限制 + 篡改检测 + 智能人机验证）
- 🎙️ 基于 OpenAI 的高质量文本转语音服务
- 🏪 完整的资源商店与 CDK 兑换系统
- 📊 用户行为数据收集与分析（集成 Microsoft Clarity）
- 🌐 WebSocket 实时通信
- 🐳 多阶段 Docker 构建，支持代码混淆
- 📚 内置 Swagger/OpenAPI 文档 + Docusaurus 文档站
- ☁️ 可选 Cloudflare Worker 边缘部署

---

## ✨ 核心功能模块

### 1. 认证与安全

#### 多因素认证 (MFA)
| 认证方式 | 说明 | 后端路由 | 前端组件 |
|---------|------|---------|---------|
| 密码认证 | 用户名/邮箱 + 密码登录注册 | `authRoutes` | `LoginPage`, `RegisterPage` |
| TOTP 双因素 | 基于时间的一次性密码（Google Authenticator 等） | `totpRoutes` | `TOTPManager`, `TOTPSetup`, `TOTPVerification` |
| Passkey/WebAuthn | 无密码生物识别认证（指纹/面容） | `passkeyRoutes` | `PasskeySetup`, `PasskeyVerifyModal` |
| 邮箱验证 | 注册邮箱验证 + 密码重置链接 | `emailRoutes` | `EmailVerifyPage`, `ForgotPasswordPage`, `ResetPasswordLinkPage` |
| 备份码 | MFA 备用恢复码 | `authRoutes` | `BackupCodesModal` |

#### 安全防护体系
| 防护层 | 说明 | 实现 |
|-------|------|------|
| WAF 防火墙 | Web 应用防火墙，检测恶意请求 | `wafMiddleware.ts` |
| IP 封禁 | 自动/手动封禁恶意 IP，支持 CIDR 段 | `ipBanCheck.ts`, `IPBanManager` |
| 速率限制 | 按路由粒度的请求频率限制（37 个独立限流器） | `routeLimiters.ts` |
| 篡改检测 | 前端关键元素篡改保护 | `tamperProtection.ts`, `TamperDetectionDemo` |
| 智能人机验证 | 基于行为分析的人机识别 | `smartHumanCheckService.ts`, `SmartHumanCheck` |
| Turnstile 验证码 | Cloudflare Turnstile 集成 | `turnstileAuth.ts`, `TurnstileWidget` |
| hCaptcha 验证 | hCaptcha 人机验证集成 | `HCaptchaWidget`, `HCaptchaVerificationPage` |
| 首次访问检测 | 新设备/浏览器首次访问验证 | `FirstVisitVerification` |
| 指纹采集 | 浏览器指纹识别与追踪 | `FingerprintManager`, `FingerprintRequestModal` |
| 重放保护 | 防止请求重放攻击 | `replayProtection.ts` |
| 审计日志 | 全操作审计记录 | `auditLog.ts`, `AuditLogViewer` |

### 2. 文本转语音 (TTS)

> [!NOTE]
> TTS 功能依赖 OpenAI API，需要在 `.env` 中配置有效的 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`。支持自定义 API 代理地址。

平台核心功能，基于 OpenAI TTS API 实现高质量语音合成。

- **语音合成**：支持多种语言、多种音色，文本转语音生成
- **音频管理**：生成历史记录、音频文件缓存与预览
- **生成统计**：用户生成次数统计与分析
- **音频预览**：在线播放生成的音频文件

| 模块 | 说明 |
|------|------|
| 后端路由 | `ttsRoutes.ts` |
| 后端服务 | `ttsService.ts` |
| 前端页面 | `TtsPage.tsx`（主页面）、`TTSForm.tsx`（表单）、`AudioPreview.tsx`（预览） |
| 静态资源 | `/static/audio/` 音频文件服务 |

### 3. 用户管理

> [!TIP]
> 如果不需要 MongoDB，可以设置 `USER_STORAGE_MODE=file` 使用文件存储模式快速启动，适合开发和小规模部署。

- **用户注册/登录**：支持用户名 + 密码注册，JWT Token 认证
- **个人资料**：头像、昵称、邮箱等个人信息管理
- **API 密钥**：用户可生成和管理个人 API 密钥
- **用户偏好**：个性化设置存储
- **存储模式**：支持 MongoDB / MySQL / 文件三种用户数据存储模式

| 模块 | 说明 |
|------|------|
| 后端路由 | `authRoutes.ts`, `apiKeyRoutes.ts` |
| 后端服务 | `userService.ts`, `apiKeyService.ts`, `userGenerationService.ts` |
| 前端组件 | `UserProfile.tsx`, `ApiKeyManager.tsx`, `UserManagement.tsx` |
| 数据模型 | `accessTokenModel.ts`, `apiKeyModel.ts`, `userPreferencesModel.ts` |

### 4. 资源商店

完整的数字资源分发与 CDK 兑换系统。

- **资源浏览**：资源列表展示、详情查看、分类筛选
- **CDK 兑换**：激活码生成、批量导入/导出、兑换验证
- **库存管理**：资源库存追踪、交易记录
- **模组列表**：游戏模组管理与分发
- **管理后台**：资源 CRUD、CDK 批量管理

| 模块 | 说明 |
|------|------|
| 后端路由 | `resourceRoutes.ts`, `cdkRoutes.ts`, `modlistRoutes.ts` |
| 后端服务 | `resourceService.ts`, `cdkService.ts`, `transactionService.ts` |
| 前端组件 | `ResourceStoreList.tsx`, `ResourceStoreDetail.tsx`, `ResourceStoreManager.tsx`, `CDKStoreManager.tsx`, `AdminStoreDashboard.tsx`, `ModListPage.tsx`, `ModListEditor.tsx` |
| 数据模型 | `resourceModel.ts`, `cdkModel.ts` |

### 5. 数据收集与分析

- **行为数据收集**：用户操作行为、页面访问、设备信息采集
- **数据处理**：数据清洗、聚合、统计分析
- **使用分析**：API 调用统计、功能使用频率分析
- **查询统计**：各模块查询次数与趋势
- **Microsoft Clarity**：集成 Clarity 用户行为分析（前端自动初始化）

| 模块 | 说明 |
|------|------|
| 后端路由 | `dataCollectionRoutes.ts`, `dataCollectionAdminRoutes.ts`, `dataProcessRoutes.ts`, `analyticsRoutes.ts` |
| 后端服务 | `dataCollectionService.ts`, `dataProcessService.ts`, `usageAnalyticsService.ts`, `queryStatsService.ts`, `clarityService.ts` |
| 前端组件 | `DataCollectionManager.tsx` |

### 6. 通信服务

- **内部邮件**：系统通知邮件、验证码邮件（基于 Resend API）
- **外部邮件**：对外邮件发送服务，支持独立域名
- **Webhook**：事件驱动的 Webhook 通知系统（基于 Svix）
- **WebSocket**：实时双向通信，支持广播消息

| 模块 | 说明 |
|------|------|
| 后端路由 | `emailRoutes.ts`, `outemailRoutes.ts`, `webhookRoutes.ts`, `webhookEventRoutes.ts` |
| 后端服务 | `emailService.ts`, `outEmailService.ts`, `webhookEventService.ts`, `wsService.ts` |
| 前端组件 | `EmailSender.tsx`, `OutEmail.tsx`, `WebhookEventsManager.tsx`, `BroadcastManager.tsx`, `WsConnector.tsx` |
| 邮件模板 | `emailTemplates.ts` |

### 7. 实用工具

#### 文本工具
| 工具 | 说明 | 前端路由 |
|------|------|---------|
| 字数统计 | 字数、字符数、段落数、阅读时间统计 | `/word-count` |
| 大小写转换 | 文本大小写批量转换 | `/case-converter` |
| Markdown 导出 | Markdown 渲染与导出为 PDF/DOCX | `/markdown-export` |
| Markdown 预览 | 实时 Markdown 渲染预览（支持 KaTeX 数学公式、Mermaid 图表） | 内嵌组件 |

#### 生活工具
| 工具 | 说明 | 前端路由 |
|------|------|---------|
| 年龄计算器 | 精确年龄计算，支持多种日期格式 | `/age-calculator` |
| 日志分享 | 加密日志分享与查看 | `/logshare` |
| 校园紧急情况 | 校园安全紧急信息页面 | `/campus-emergency` |

#### 网络工具
| 工具 | 说明 | 后端路由 |
|------|------|---------|
| IP 查询 | 客户端 IP 信息与地理位置查询 | `/ip`, `/ip-location` |
| 短链接 | URL 短链生成与跳转管理 | `shortUrlRoutes` |
| IPFS 上传 | 文件上传至 IPFS 分布式存储 | `ipfsRoutes` |
| 图片上传 | 图片批量上传与管理 | `imageDataRoutes` |

### 8. 查询服务

| 服务 | 说明 | 前端路由 | 后端路由 |
|------|------|---------|---------|
| FBI 通缉犯查询 | 查询 FBI 通缉犯数据库 | `/fbi-wanted` | `fbiWantedRoutes` |
| 安踏防伪查询 | 安踏产品防伪验证 | `/anti-counterfeit` | `antaRoutes` |
| GitHub 账单查询 | GitHub Actions/Copilot 用量与账单 | `/github-billing` | `githubBillingRoutes` |
| LibreChat 监控 | LibreChat 镜像更新监控 | `/librechat` | `libreChatRoutes` |

### 9. 娱乐与游戏

| 游戏 | 说明 | 前端路由 |
|------|------|---------|
| 抽奖系统 | 完整的抽奖活动系统（含管理后台） | `/lottery`, `/admin/lottery` |
| 硬币翻转 | 随机硬币翻转小游戏 | `/coin-flip` |
| 老虎冒险 | 互动冒险小游戏 | `/tiger-adventure` |

### 10. 管理后台

> [!WARNING]
> 管理后台包含命令执行、环境变量修改等高权限操作。请确保 `ADMIN_PASSWORD` 使用强密码，并严格限制管理员账户的分发。

管理员专属功能，需要 `admin` 角色权限。

| 功能 | 说明 | 前端组件 |
|------|------|---------|
| 管理仪表盘 | 系统概览、统计数据、快捷操作 | `AdminDashboard.tsx` |
| 用户管理 | 用户列表、角色分配、封禁/解封 | `UserManagement.tsx` |
| 公告管理 | 系统公告发布与管理（支持 Markdown/HTML） | `AnnouncementManager.tsx` |
| IP 封禁管理 | IP/CIDR 封禁规则管理 | `IPBanManager.tsx` |
| 环境变量管理 | 运行时环境变量查看与修改 | `EnvManager.tsx` |
| 命令执行 | 远程命令执行控制台 | `CommandManager.tsx` |
| 调试控制台 | 系统调试与诊断工具 | `DebugInfoModal.tsx` |
| 数据收集管理 | 采集数据查看与管理 | `DataCollectionManager.tsx` |
| 审计日志 | 操作审计记录查看 | `AuditLogViewer.tsx` |
| 短链管理 | 短链接创建与管理 | `ShortLinkManager.tsx` |
| 指纹管理 | 设备指纹数据管理 | `FingerprintManager.tsx` |
| 系统管理 | 系统配置与维护 | `SystemManager.tsx` |
| 商店管理 | 资源商店后台管理 | `AdminStoreDashboard.tsx` |
| 抽奖管理 | 抽奖活动配置与管理 | `LotteryAdmin.tsx` |
| FBI 数据管理 | FBI 通缉犯数据管理 | `FBIWantedManager.tsx` |
| LibreChat 管理 | LibreChat 集成管理 | `LibreChatAdminPage.tsx` |
| Webhook 管理 | Webhook 事件查看与管理 | `WebhookEventsManager.tsx` |
| 篡改检测演示 | 前端篡改保护演示 | `TamperDetectionDemo.tsx` |

### 11. 网络与集成

| 模块 | 说明 |
|------|------|
| LibreChat 集成 | LibreChat 镜像版本监控与数据同步 |
| Cloudflare Worker | 可选的边缘计算部署（`worker/` 目录） |
| IPFS 集成 | 分布式文件存储上传 |
| Svix Webhook | 企业级 Webhook 事件分发 |
| Resend 邮件 | 现代邮件发送 API 集成 |
| OpenAI API | TTS 语音合成 API 调用 |
| Redis 缓存 | 可选的 Redis 缓存层 |
| 推荐系统 | 内容推荐引擎 |
| 邀请系统 | 用户邀请码机制 |

### 12. UI 演示中心

内置多个 UI 设计演示页面，展示前端组件能力。

| 演示 | 说明 | 前端路由 |
|------|------|---------|
| 演示中心 | 所有演示的入口页面 | `/demo` |
| 小红书风格 | 小红书 App UI 复刻 | `/demo/xiaohongshu` |
| 冥想应用 | 冥想 App UI 设计 | `/demo/meditation` |
| 音乐播放器 | 音乐播放器 UI 设计 | `/demo/music` |
| 金融应用 | 金融 App UI 设计 | `/demo/finance` |

---

## 🛠 技术栈

### 后端

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js 18+ |
| 框架 | Express.js 5.x |
| 语言 | TypeScript 5.9 |
| 数据库 | MongoDB 7 + Mongoose 9 |
| 缓存 | Redis 5 |
| 认证 | JWT (jsonwebtoken) + WebAuthn (@simplewebauthn) + TOTP (speakeasy) |
| AI 集成 | OpenAI SDK 6 |
| 邮件 | Resend API |
| Webhook | Svix |
| 文件处理 | Multer 2, tar, JSZip |
| 验证 | Zod 4, Validator.js |
| 安全 | Helmet 8, CORS, DOMPurify, bcrypt 6 |
| 加密 | CryptoJS, nanoid, uuid |
| 日志 | Winston 3 |
| API 文档 | Swagger (swagger-jsdoc + swagger-ui-express) |
| 爬虫/解析 | Cheerio, JSDOM |
| WebSocket | ws 8 |
| 代码混淆 | javascript-obfuscator 5 |
| 测试 | Jest 30 + Supertest 7 |
| 代码质量 | Biome 2.4 |

### 前端

| 类别 | 技术 |
|------|------|
| 框架 | React 19 |
| 构建工具 | Vite 7 |
| 语言 | TypeScript 5.9 |
| 路由 | React Router 7 |
| 样式 | Tailwind CSS 3 + PostCSS |
| 动画 | Framer Motion 12 |
| UI 组件 | Radix UI, Lucide React, Heroicons, React Icons |
| 图表 | Chart.js 4 + react-chartjs-2 |
| Markdown | react-markdown, marked, KaTeX, Mermaid |
| 代码高亮 | Prism.js, react-syntax-highlighter |
| HTTP 客户端 | Axios |
| 通知 | react-toastify |
| 文档导出 | jsPDF, docx, html2canvas |
| 二维码 | qrcode.react |
| 指纹识别 | @fingerprintjs/fingerprintjs |
| 行为分析 | @microsoft/clarity |
| 测试 | Vitest 4 + Testing Library |

### DevOps

| 类别 | 技术 |
|------|------|
| 容器化 | Docker（多阶段构建）+ Docker Compose |
| 包管理 | pnpm |
| 代码混淆 | javascript-obfuscator |
| 文档站 | Docusaurus |
| 边缘计算 | Cloudflare Workers (Wrangler) |
| CI/CD | GitHub Actions |

---

## 📁 项目结构

```
Synapse/
├── src/                              # 后端源代码
│   ├── app.ts                        # 应用入口（路由注册、中间件配置、服务器启动）
│   ├── config.ts                     # 主配置文件
│   ├── config/                       # 配置模块
│   │   ├── config.ts                 # 应用配置
│   │   ├── env.ts                    # 环境变量解析
│   │   └── index.ts                  # 配置导出
│   ├── controllers/                  # 请求处理器（28 个）
│   │   ├── authController.ts         # 认证控制器
│   │   ├── ttsController.ts          # TTS 控制器
│   │   ├── adminController.ts        # 管理员控制器
│   │   ├── cdkController.ts          # CDK 控制器
│   │   ├── fbiWantedController.ts    # FBI 查询控制器
│   │   ├── lotteryController.ts      # 抽奖控制器
│   │   └── ...                       # 更多控制器
│   ├── routes/                       # API 路由（42 个路由文件）
│   │   ├── authRoutes.ts             # 认证路由
│   │   ├── ttsRoutes.ts              # TTS 路由
│   │   ├── adminRoutes.ts            # 管理路由
│   │   ├── resourceRoutes.ts         # 资源路由
│   │   ├── shortUrlRoutes.ts         # 短链路由
│   │   └── ...                       # 更多路由
│   ├── services/                     # 业务逻辑服务（50+ 个）
│   │   ├── ttsService.ts             # TTS 服务
│   │   ├── userService.ts            # 用户服务
│   │   ├── mongoService.ts           # MongoDB 连接管理
│   │   ├── redisService.ts           # Redis 缓存服务
│   │   ├── passkeyService.ts         # Passkey 认证服务
│   │   ├── smartHumanCheckService.ts # 智能人机验证
│   │   ├── emailService.ts           # 邮件服务
│   │   ├── wsService.ts              # WebSocket 服务
│   │   ├── schedulerService.ts       # 定时任务服务
│   │   └── ...                       # 更多服务
│   ├── middleware/                    # 中间件（22 个）
│   │   ├── authenticateToken.ts      # JWT 认证
│   │   ├── corsMiddleware.ts         # CORS 配置
│   │   ├── wafMiddleware.ts          # WAF 防火墙
│   │   ├── ipBanCheck.ts             # IP 封禁检查
│   │   ├── routeLimiters.ts          # 路由限流器
│   │   ├── tamperProtection.ts       # 篡改保护
│   │   ├── replayProtection.ts       # 重放保护
│   │   └── ...                       # 更多中间件
│   ├── models/                       # Mongoose 数据模型（19 个）
│   ├── types/                        # TypeScript 类型定义
│   ├── utils/                        # 工具函数
│   ├── templates/                    # 邮件模板
│   ├── scripts/                      # 后端脚本
│   └── tests/                        # 后端测试文件（50+ 个）
│
├── frontend/                         # 前端源代码
│   ├── src/
│   │   ├── App.tsx                   # 主应用（路由定义、全局状态）
│   │   ├── main.tsx                  # 入口文件
│   │   ├── components/               # React 组件（100+ 个）
│   │   │   ├── TtsPage.tsx           # TTS 主页面
│   │   │   ├── AdminDashboard.tsx    # 管理仪表盘
│   │   │   ├── LoginPage.tsx         # 登录页
│   │   │   ├── ResourceStoreList.tsx # 资源商店
│   │   │   ├── LotteryPage.tsx       # 抽奖页面
│   │   │   ├── FBIWantedPublic.tsx   # FBI 查询
│   │   │   ├── DemoHub.tsx           # 演示中心
│   │   │   └── ...                   # 更多组件
│   │   ├── hooks/                    # 自定义 Hooks
│   │   ├── api/                      # API 调用封装
│   │   ├── types/                    # TypeScript 类型
│   │   ├── utils/                    # 工具函数
│   │   ├── styles/                   # 样式文件
│   │   └── config/                   # 前端配置
│   ├── docs/                         # Docusaurus 文档站
│   ├── vite.config.ts                # Vite 构建配置
│   ├── tailwind.config.js            # Tailwind CSS 配置
│   ├── vitest.config.ts              # Vitest 测试配置
│   └── package.json
│
├── worker/                           # Cloudflare Worker（可选边缘部署）
│   ├── src/
│   │   ├── index.ts                  # Worker 入口
│   │   ├── routes/                   # Worker 路由
│   │   ├── middleware/               # Worker 中间件
│   │   └── lib/                      # Worker 工具库
│   └── wrangler.toml                 # Wrangler 配置
│
├── data/                             # 运行时数据目录
│   ├── users.json                    # 用户数据（文件存储模式）
│   ├── blocked-ips.json              # IP 封禁列表
│   ├── chat_history.json             # 聊天历史
│   ├── logs/                         # 应用日志
│   ├── exports/                      # 数据导出文件
│   └── sharelogs/                    # 分享日志
│
├── scripts/                          # 运维脚本（40+ 个）
├── secrets/                          # 签名密钥
├── Dockerfile                        # 多阶段 Docker 构建
├── docker-compose.yml                # Docker Compose 编排
├── package.json                      # 后端依赖与脚本
├── tsconfig.json                     # TypeScript 配置
├── jest.config.js                    # Jest 测试配置
├── biome.json                        # Biome 代码质量配置
└── openapi.json                      # OpenAPI 3.0 文档
```

---

## 🚀 快速开始

> [!IMPORTANT]
> 开始之前，请确保已阅读 [LICENSE](LICENSE) 并同意其条款。

### 前置要求

- Node.js 18.20.8+
- pnpm（推荐）或 npm
- MongoDB（可选，支持文件存储模式）
- Redis（可选，用于缓存加速）

### 安装依赖

```bash
# 安装后端依赖
pnpm install

# 安装前端依赖
cd frontend && pnpm install && cd ..

# 安装文档站依赖（可选）
cd frontend/docs && pnpm install && cd ../..
```

### 开发模式

```bash
# 同时启动后端 + 前端开发服务器
pnpm run dev

# 或分别启动
pnpm run dev:backend      # 后端: http://localhost:3000
pnpm run dev:frontend     # 前端: http://localhost:3001（Vite HMR）
pnpm run dev:docs         # 文档站: http://localhost:3002

# 文件存储模式（无需 MongoDB）
pnpm run dev:file
```

### 生产构建

```bash
# 完整构建（后端 + 前端 + 文档站）
pnpm run build

# 简化构建（跳过部分优化）
pnpm run build:simple

# 最小化构建（最快速度）
pnpm run build:minimal

# 仅构建后端（含代码混淆）
pnpm run build:backend

# 仅构建前端
pnpm run build:frontend

# 启动生产服务器
pnpm start
```

### Docker 部署

> [!TIP]
> 推荐使用 Docker Hub 上的预构建镜像 [`happyclo/tts-node:latest`](https://hub.docker.com/r/happyclo/tts-node/tags)，无需本地构建，直接拉取即可运行。

```bash
# 使用 Docker Compose（推荐）
docker-compose up -d

# 手动构建镜像
docker build -t Synapse:latest .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -p 3001:3001 \
  -p 3002:3002 \
  --env-file .env \
  -v ./data:/app/data \
  Synapse:latest

# 查看日志
docker-compose logs -f app
```

Docker 镜像采用 4 阶段构建：
1. **frontend-builder** - 前端 React 应用构建
2. **docs-builder** - Docusaurus 文档站构建
3. **backend-builder** - TypeScript 编译 + 代码混淆 + OpenAPI 生成
4. **production** - 精简运行时镜像（Alpine + 生产依赖）

---

## 🔧 环境配置

> [!CAUTION]
> `.env` 文件包含 API 密钥、数据库凭证等敏感信息，**绝对不要**将其提交到版本控制系统。请确保 `.env` 已添加到 `.gitignore` 中。

### 后端环境变量（`.env`）

```env
# ========== 服务器配置 ==========
NODE_ENV=development              # 运行环境: development | production
PORT=3000                         # 后端端口
TZ=Asia/Shanghai                  # 时区

# ========== OpenAI 配置 ==========
OPENAI_API_KEY=sk-xxx             # OpenAI API 密钥
OPENAI_BASE_URL=https://api.openai.com/v1  # OpenAI API 地址（支持自定义代理）

# ========== 数据库配置 ==========
USER_STORAGE_MODE=mongo           # 存储模式: mongo | mysql | file
MONGO_URI=mongodb://user:pass@host:27017/tts?authSource=admin
# MYSQL_HOST=localhost            # MySQL 配置（当 USER_STORAGE_MODE=mysql 时）
# MYSQL_USER=root
# MYSQL_PASSWORD=xxx
# MYSQL_DATABASE=tts

# ========== Redis 配置（可选） ==========
REDIS_URL=redis://localhost:6379

# ========== 认证配置 ==========
JWT_SECRET=your-jwt-secret        # JWT 签名密钥
ADMIN_USERNAME=admin              # 管理员用户名
ADMIN_PASSWORD=admin              # 管理员密码
SERVER_PASSWORD=1145              # 服务器状态查询密码
GENERATION_CODE=happyclo          # 注册生成码

# ========== WebAuthn/Passkey 配置 ==========
RP_ID=localhost                   # Relying Party ID（域名）
RP_ORIGIN=http://localhost:3001   # Relying Party Origin

# ========== 邮件服务 ==========
RESEND_API_KEY=re_xxx             # Resend API 密钥
RESEND_DOMAIN=example.com         # 发件域名
EMAIL_USER=noreply@example.com    # 发件人地址

# ========== 外部邮件服务 ==========
OUTEMAIL_ENABLED=true             # 是否启用对外邮件
OUTEMAIL_CODE=art                 # 外部邮件验证码
OUTEMAIL_DOMAIN=example.com       # 外部邮件域名
OUTEMAIL_API_KEY=re_xxx           # 外部邮件 API 密钥

# ========== Cloudflare Turnstile ==========
TURNSTILE_SITE_KEY=0x4xxx         # Turnstile 站点密钥
TURNSTILE_SECRET_KEY=0x4xxx       # Turnstile 服务端密钥
CLOUDFLARE_TURNSTILE_SITE_KEY=0x4xxx
CLOUDFLARE_TURNSTILE_SECRET_KEY=0x4xxx

# ========== 安全配置 ==========
AES_KEY=your-aes-key              # AES 加密密钥
SIGNING_KEY=secrets/signing_key.pem  # 签名密钥路径
LOCAL_IPS=127.0.0.1,::1           # 本地 IP 白名单
WAF_ENABLED=true                  # WAF 开关（设为 false 可禁用）

# ========== LibreChat 集成 ==========
CHAT_BASE_URL=https://chat.example.com
CHAT_API_KEY=sk-xxx

# ========== Webhook ==========
WEBHOOK_SECRET=whsec_xxx          # Svix Webhook 密钥

# ========== 抽奖系统 ==========
LOTTERY_STORAGE=mongo             # 抽奖数据存储: mongo | file
```

### 前端环境变量（`frontend/.env`）

```env
VITE_API_URL=http://localhost:3000              # 后端 API 地址
VITE_WS_URL=ws://localhost:3000                 # WebSocket 地址
VITE_NODE_ENV=development                       # 运行环境
VITE_CLOUDFLARE_TURNSTILE_SITE_KEY=0x4xxx       # Turnstile 站点密钥
VITE_ENABLE_TURNSTILE=false                     # 是否启用 Turnstile
VITE_OUTEMAIL_ENABLED=true                      # 是否启用外部邮件功能
```

---

## 📚 API 文档

> [!NOTE]
> API 文档在开发模式下自动从路由注释生成。生产环境使用预生成的 `openapi.json` 文件，可通过 `pnpm run generate:openapi` 更新。

### 在线文档

- **Swagger UI**: `http://localhost:3000/api-docs` — 交互式 API 文档界面
- **OpenAPI JSON**: `http://localhost:3000/openapi.json` — OpenAPI 3.0 规范文件
- **Docusaurus 文档站**: `http://localhost:3002` — 项目详细文档与博客

### 主要 API 端点一览

#### 认证 (`/api/auth`)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/logout` | 用户登出 |
| GET | `/api/auth/me` | 获取当前用户信息 |

#### TOTP 双因素 (`/api/totp`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/totp/status` | 获取 TOTP 启用状态 |
| POST | `/api/totp/setup` | 初始化 TOTP 设置 |
| POST | `/api/totp/verify` | 验证 TOTP 令牌 |

#### Passkey (`/api/passkey`)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/passkey/register/start` | 开始 Passkey 注册 |
| POST | `/api/passkey/register/finish` | 完成 Passkey 注册 |
| POST | `/api/passkey/authenticate/start` | 开始 Passkey 认证 |
| POST | `/api/passkey/authenticate/finish` | 完成 Passkey 认证 |
| GET | `/api/passkey/credentials` | 获取已注册凭证列表 |

#### 文本转语音 (`/api/tts`)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tts/generate` | 生成语音 |
| GET | `/api/tts/history` | 获取生成历史 |

#### 资源商店 (`/api/resources`, `/api/cdks`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/resources` | 获取资源列表 |
| POST | `/api/resources` | 创建资源 |
| PUT | `/api/resources/:id` | 更新资源 |
| DELETE | `/api/resources/:id` | 删除资源 |
| POST | `/api/cdks/redeem` | CDK 兑换 |

#### 管理员 (`/api/admin`)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 获取用户列表 |
| PUT | `/api/admin/users/:id` | 更新用户 |
| DELETE | `/api/admin/users/:id` | 删除用户 |
| GET | `/api/admin/announcement` | 获取系统公告 |

#### 其他常用端点
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（含 MongoDB 状态、WebSocket 连接数） |
| GET | `/ip` | 获取客户端 IP 信息 |
| GET | `/ip-location` | IP 地理位置查询 |
| POST | `/server_status` | 服务器状态（需密码） |
| GET | `/api/frontend-config` | 前端配置 |

### 完整路由模块列表（42 个）

| 路由文件 | 挂载路径 | 功能 |
|---------|---------|------|
| `authRoutes` | `/api/auth` | 用户认证（登录、注册、登出） |
| `ttsRoutes` | `/api/tts` | 文本转语音服务 |
| `adminRoutes` | `/api/admin` | 管理员功能 |
| `passkeyRoutes` | `/api/passkey` | WebAuthn/Passkey 认证 |
| `totpRoutes` | `/api/totp` | TOTP 双因素认证 |
| `apiKeyRoutes` | `/api/apikeys` | API 密钥管理 |
| `resourceRoutes` | `/api` | 资源管理 |
| `cdkRoutes` | `/api/cdks` | CDK 激活码管理 |
| `lotteryRoutes` | `/api/lottery` | 抽奖系统 |
| `shortUrlRoutes` | `/s`, `/api/shorturl` | 短链接服务 |
| `emailRoutes` | `/api/email` | 内部邮件服务 |
| `outemailRoutes` | `/api/outemail` | 外部邮件服务 |
| `turnstileRoutes` | `/api/turnstile` | Turnstile 验证码 |
| `humanCheckRoutes` | `/api/human-check` | 智能人机验证 |
| `dataCollectionRoutes` | `/api/data-collection` | 数据收集 |
| `dataCollectionAdminRoutes` | `/api/data-collection/admin` | 数据收集管理 |
| `dataProcessRoutes` | `/api/data` | 数据处理 |
| `analyticsRoutes` | `/api/analytics` | 分析统计 |
| `networkRoutes` | `/api/network` | 网络工具 |
| `mediaRoutes` | `/api/media` | 媒体管理 |
| `socialRoutes` | `/api/social` | 社交功能 |
| `lifeRoutes` | `/api/life` | 生活工具 |
| `libreChatRoutes` | `/api/libre-chat`, `/api/librechat` | LibreChat 集成 |
| `commandRoutes` | `/api/command` | 命令执行 |
| `debugConsoleRoutes` | `/api/debug-console` | 调试控制台 |
| `logRoutes` | `/api` | 日志管理 |
| `statusRouter` | `/api/status` | 状态检查 |
| `policyRoutes` | `/api/policy` | 服务条款/隐私政策 |
| `tamperRoutes` | `/api/tamper` | 篡改检测 |
| `modlistRoutes` | `/api/modlist` | 模组列表 |
| `imageDataRoutes` | `/api/image-data` | 图片数据 |
| `ipfsRoutes` | `/api/ipfs` | IPFS 上传 |
| `fbiWantedRoutes` | `/api/fbi-wanted` | FBI 通缉犯查询 |
| `antaRoutes` | `/api/anta` | 安踏防伪查询 |
| `githubBillingRoutes` | `/api/github-billing` | GitHub 账单查询 |
| `miniapiRoutes` | `/api/miniapi` | 迷你 API 集合 |
| `recommendationRoutes` | `/api/recommendations` | 推荐系统 |
| `auditLogRoutes` | `/api/admin/audit-logs` | 审计日志 |
| `invitationRoutes` | `/api/invitations` | 邀请系统 |
| `workspaceRoutes` | `/api/workspaces` | 工作区管理 |
| `webhookRoutes` | `/api/webhooks` | Webhook 接收 |
| `webhookEventRoutes` | `/api/webhook-events` | Webhook 事件管理 |

---

## 👨‍💻 开发指南

### 项目脚本

```bash
# ========== 开发 ==========
pnpm run dev                # 同时启动后端 + 前端
pnpm run dev:backend        # 仅启动后端（nodemon 热重载）
pnpm run dev:frontend       # 仅启动前端（Vite HMR）
pnpm run dev:docs           # 启动文档站开发服务器
pnpm run dev:file           # 文件存储模式启动

# ========== 构建 ==========
pnpm run build              # 完整构建（后端 + 前端 + 文档站）
pnpm run build:simple       # 简化构建
pnpm run build:minimal      # 最小化构建
pnpm run build:backend      # 后端编译 + 代码混淆
pnpm run build:frontend     # 前端 Vite 构建

# ========== 测试 ==========
pnpm run test               # 运行所有后端测试
pnpm run test:coverage      # 生成测试覆盖率报告
pnpm run test:watch         # 监听模式测试
pnpm run test:verbose       # 详细输出测试
pnpm run test:auth          # 仅测试认证模块
pnpm run test:ci            # CI 环境测试

# ========== 代码质量 ==========
pnpm run generate:openapi   # 生成 OpenAPI 文档
pnpm run check:api-docs     # 检查 API 文档完整性
pnpm run check:openapi-json # 检查 openapi.json 有效性
pnpm run check:unused-deps  # 检查未使用的依赖
pnpm run check:tree-shaking # 检查 Tree Shaking 效果

# ========== 分析 ==========
pnpm run analyze:bundle     # 后端打包体积分析
pnpm run analyze:frontend   # 前端打包体积分析
pnpm run analyze:full       # 完整打包分析

# ========== Docker ==========
pnpm run docker:build       # 构建 Docker 镜像（Linux/macOS）
pnpm run docker:build:win   # 构建 Docker 镜像（Windows）
pnpm run docker:build:simple   # 简化 Docker 构建（4GB 内存限制）
pnpm run docker:build:minimal  # 最小化 Docker 构建（2GB 内存限制）

# ========== 生产 ==========
pnpm run prod               # 构建并启动生产服务器
pnpm start                  # 启动生产服务器（后端 + 前端静态 + 文档站）
```

### 前端脚本

```bash
cd frontend

pnpm run dev                # Vite 开发服务器
pnpm run build              # 生产构建
pnpm run build:analyze      # 构建并生成 Bundle 分析
pnpm run preview            # 预览构建产物
pnpm run test               # Vitest 测试
pnpm run analyze:bundle     # Bundle 体积分析
```

### 常见开发任务

#### 添加新的 API 端点

1. 在 `src/routes/` 中创建路由文件，定义 HTTP 方法和路径
2. 在 `src/controllers/` 中创建控制器，处理请求逻辑
3. 在 `src/services/` 中实现业务逻辑（可选）
4. 在 `src/models/` 中定义 Mongoose 数据模型（如需数据库）
5. 在 `src/app.ts` 中注册路由并绑定限流器
6. 运行 `pnpm run generate:openapi` 更新 API 文档

#### 添加新的前端页面

1. 在 `frontend/src/components/` 中创建页面组件
2. 在 `frontend/src/App.tsx` 中添加懒加载导入和 `<Route>` 定义
3. 在 `routeConfig.titles` 中添加页面标题映射
4. 如需导航入口，在 `MobileNav` 组件中添加链接

#### 添加数据库模型

1. 在 `src/models/` 中定义 Mongoose Schema 和 Model
2. 在对应的 Service 中引入并使用模型
3. MongoDB 连接由 `mongoService.ts` 统一管理

### 数据模型一览（19 个）

| 模型 | 说明 |
|------|------|
| `accessTokenModel` | 访问令牌 |
| `apiKeyModel` | API 密钥 |
| `archiveModel` | 归档数据 |
| `auditLogModel` | 审计日志 |
| `cdkModel` | CDK 激活码 |
| `collaborationSessionModel` | 协作会话 |
| `fbiWantedModel` | FBI 通缉犯数据 |
| `invitationModel` | 邀请码 |
| `ipBanModel` | IP 封禁记录 |
| `policyConsentModel` | 政策同意记录 |
| `recommendationHistoryModel` | 推荐历史 |
| `resourceModel` | 资源数据 |
| `shortUrlModel` | 短链接 |
| `tempFingerprintModel` | 临时指纹 |
| `userPreferencesModel` | 用户偏好 |
| `verificationTokenModel` | 验证令牌 |
| `versionModel` | 版本控制 |
| `voiceProjectModel` | 语音项目 |
| `workspaceModel` | 工作区 |

---

## 🔐 安全特性

> [!WARNING]
> 生产环境部署前，请务必修改所有默认密码（`ADMIN_PASSWORD`、`SERVER_PASSWORD`、`JWT_SECRET`、`AES_KEY`），并启用 WAF（`WAF_ENABLED=true`）。使用默认凭证部署将导致严重安全风险。

### 多层防护架构

```
请求 → IP 封禁检查 → WAF 防火墙 → 速率限制 → CORS 校验 → JWT 认证 → 业务逻辑
                                                                    ↓
                                                              篡改检测 / 重放保护
```

| 安全层 | 技术实现 | 说明 |
|-------|---------|------|
| HTTPS/TLS | Helmet HSTS | 强制 HTTPS，HSTS 预加载 |
| 安全头 | Helmet | CSP、X-Frame-Options、X-Content-Type-Options 等 |
| CORS | 自定义中间件 | 严格的跨域资源共享策略，按路由差异化配置 |
| WAF | `wafMiddleware.ts` | Web 应用防火墙，检测 SQL 注入、XSS 等攻击 |
| IP 封禁 | `ipBanCheck.ts` + Redis | 自动/手动 IP 封禁，支持 CIDR 段，Redis 同步 |
| 速率限制 | express-rate-limit | 37 个独立限流器，按路由粒度配置 |
| JWT 认证 | jsonwebtoken | Token 签发与验证，支持可选认证 |
| 密码加密 | bcrypt | 密码哈希存储 |
| 输入验证 | Zod + Validator.js | 请求参数校验与清理 |
| XSS 防护 | DOMPurify | HTML 内容净化 |
| 篡改检测 | `tamperProtection.ts` | 前端关键元素完整性保护 |
| 重放保护 | `replayProtection.ts` + Nonce | 防止请求重放攻击 |
| 代码混淆 | javascript-obfuscator | 生产环境后端代码混淆 |
| 信息隐藏 | 移除 X-Powered-By/Server 头 | 隐藏服务器技术栈信息 |

---

## 📊 监控与日志

### 日志系统

- **日志库**: Winston 3
- **日志目录**: `data/logs/`（按日期分文件）、`logs/`（combined + error）
- **日志级别**: error → warn → info → debug
- **请求日志**: 所有请求自动记录（开发环境含完整 headers/body）

### 健康检查

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "uptime": 3600,
  "mongo": "connected",
  "wsConnections": 5,
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

### 性能监控

| 工具 | 说明 |
|------|------|
| Microsoft Clarity | 前端用户行为分析（自动初始化，后端配置） |
| Bundle 分析 | `pnpm run analyze:frontend` / `pnpm run analyze:bundle` |
| 服务器状态 | `POST /server_status`（CPU、内存、运行时间） |
| WebSocket 监控 | 实时连接数统计 |

### 定时任务

`schedulerService.ts` 提供定时任务调度，服务器启动时自动运行。

---

## 🐳 部署

> [!TIP]
> 最快的部署方式：直接使用 Docker Hub 预构建镜像，无需本地编译。
> ```bash
> docker pull happyclo/tts-node:latest
> ```

### Docker Compose 部署（推荐）

```yaml
# docker-compose.yml
version: "3.8"
services:
  app:
    image: happyclo/tts-node:latest
    ports:
      - "3000:3000"   # 后端 API
      - "3001:3001"   # 前端静态文件
      - "3002:3002"   # 文档站
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENAI_BASE_URL=${OPENAI_BASE_URL}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

```bash
docker-compose up -d
```

### 端口说明

| 端口 | 服务 |
|------|------|
| 3000 | 后端 API + Swagger UI |
| 3001 | 前端 React 应用（serve 静态文件） |
| 3002 | Docusaurus 文档站 |

### Cloudflare Worker 部署（可选）

> [!NOTE]
> Cloudflare Worker 为可选的边缘部署方案，适用于需要全球低延迟访问的场景。需要 Cloudflare 账户和 Wrangler CLI。

```bash
cd worker
npm install
npx wrangler dev     # 本地开发
npx wrangler deploy  # 部署到 Cloudflare
```

---

## 📝 许可证

> [!CAUTION]
> 本项目采用自定义许可证，**并非** MIT 或其他常见开源许可证。使用、修改或分发本项目代码前，请务必完整阅读 [LICENSE](LICENSE) 文件。违反许可证条款的行为，由使用者自行承担全部法律责任。

[Self-written License](LICENSE)

---

## 👥 贡献

欢迎提交 Issue 和 Pull Request。

## 📞 支持

- 🐛 Bug 报告: [GitHub Issues](../../issues)
- 💬 讨论: [GitHub Discussions](../../discussions)

---

**版本**: 1771430945717