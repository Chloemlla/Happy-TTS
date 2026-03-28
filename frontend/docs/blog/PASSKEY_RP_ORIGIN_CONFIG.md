---
title: Passkey RP_ORIGIN 动态配置指南
date: 2025-11-06
slug: passkey-rp-origin-configuration
tags: [passkey, configuration, rp-origin, deployment]
---

# Passkey RP_ORIGIN 动态配置指南

## 概述

Synapse 的 Passkey（无密码认证）功能现已支持从用户浏览器地址栏**自动获取 RP_ORIGIN**，这使得应用能够在多域名部署场景中无缝工作。

## 核心改进

### 前端改进

- `frontend/src/api/passkey.ts` 新增 `getClientOrigin()` 函数
- 所有 Passkey API 调用自动从浏览器获取当前域名并发送到后端
- 格式：`https://domain.com` 或 `http://localhost:3000`

### 后端改进

- `src/config/env.ts` 新增 `RP_ORIGIN_MODE` 和 `ALLOWED_ORIGINS` 配置
- `src/services/passkeyService.ts` 支持动态 RP_ORIGIN 处理
- 所有 Passkey 方法（generateRegistrationOptions、verifyRegistration、generateAuthenticationOptions、verifyAuthentication）现支持 `clientOrigin` 参数
- `src/routes/passkeyRoutes.ts` 所有路由已更新以传递 `clientOrigin`

## 配置模式

### 模式 1: 固定 RP_ORIGIN（推荐用于单域名部署）

**环境变量配置：**

```bash
RP_ID=tts.hapx.one
RP_ORIGIN=https://tts.hapx.one
RP_ORIGIN_MODE=fixed  # 或不设置（默认）
```

**行为：**

- 后端忽略客户端发送的 `clientOrigin`
- 始终使用配置的 `RP_ORIGIN` 值
- 所有用户使用相同的域名进行认证

### 模式 2: 动态 RP_ORIGIN（推荐用于多域名部署）

**环境变量配置：**

```bash
RP_ID=tts.hapx.one  # 必须与所有 origin 中的域名部分匹配
RP_ORIGIN=https://tts.hapx.one  # 默认值（fallback）
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=https://tts.hapx.one,https://tts.example.com,http://localhost:3000
```

**行为：**

- 后端验证客户端发送的 `clientOrigin` 是否在 `ALLOWED_ORIGINS` 列表中
- 如果验证通过，使用 `clientOrigin`
- 如果验证失败，回退到配置的 `RP_ORIGIN`
- 支持多个域名同时运行应用

## 环境变量说明

| 变量名            | 默认值                 | 说明                                                     |
| ----------------- | ---------------------- | -------------------------------------------------------- |
| `RP_ID`           | `tts.hapx.one`         | Relying Party ID，必须与所有允许的 origin 的域名部分匹配 |
| `RP_ORIGIN`       | `https://tts.hapx.one` | 固定的 RP Origin 或默认回退值                            |
| `RP_ORIGIN_MODE`  | `fixed`                | 模式选择：`fixed` 或 `dynamic`                           |
| `ALLOWED_ORIGINS` | 与 `RP_ORIGIN` 相同    | 允许的 origin 列表（动态模式），逗号分隔                 |

## API 变更

### 前端 API 层（`frontend/src/api/passkey.ts`）

所有 API 调用现在自动包含 `clientOrigin`：

```typescript
// 自动从浏览器获取
const clientOrigin = getClientOrigin(); // 例如: "https://example.com"

// 所有调用现在传递 clientOrigin
passkeyApi.startRegistration(credentialName); // POST { credentialName, clientOrigin }
passkeyApi.finishRegistration(credentialName, response); // POST { credentialName, response, clientOrigin }
passkeyApi.startAuthentication(username); // POST { username, clientOrigin }
passkeyApi.finishAuthentication(username, response); // POST { username, response, clientOrigin }
```

### 后端 API 路由（`src/routes/passkeyRoutes.ts`）

所有路由现在接受并处理 `clientOrigin`：

```
POST /api/passkey/register/start
  Body: { credentialName, clientOrigin? }

POST /api/passkey/register/finish
  Body: { credentialName, response, clientOrigin? }

POST /api/passkey/authenticate/start
  Body: { username, clientOrigin? }

POST /api/passkey/authenticate/finish
  Body: { username, response, clientOrigin? }
```

### 后端 Service 方法（`src/services/passkeyService.ts`）

关键方法签名更新：

```typescript
// 方法 1: 生成注册选项
static async generateRegistrationOptions(
    user: User,
    credentialName: string,
    clientOrigin?: string  // 新增参数
): Promise<...>

// 方法 2: 验证注册
static async verifyRegistration(
    user: User,
    response: any,
    credentialName: string,
    clientOrigin?: string,  // 新增参数
    requestOrigin?: string
): Promise<VerifiedRegistrationResponse>

// 方法 3: 生成认证选项
static async generateAuthenticationOptions(
    user: User,
    clientOrigin?: string  // 新增参数
): Promise<...>

// 方法 4: 验证认证
static async verifyAuthentication(
    user: User,
    response: any,
    clientOrigin?: string,  // 新增参数
    requestOrigin?: string,
    retryCount?: number
): Promise<VerifiedAuthenticationResponse>
```

## 使用示例

### 示例 1: 单域名部署

**.env 配置：**

```
RP_ID=app.example.com
RP_ORIGIN=https://app.example.com
RP_ORIGIN_MODE=fixed
```

**访问方式：**

```
https://app.example.com  -> 使用 RP_ORIGIN=https://app.example.com
```

### 示例 2: 多域名部署

**.env 配置：**

```
RP_ID=example.com
RP_ORIGIN=https://app.example.com
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=https://app.example.com,https://app2.example.com,https://staging.example.com,http://localhost:3000
```

**访问方式：**

```
https://app.example.com    -> 客户端发送 clientOrigin=https://app.example.com -> 验证通过，使用它
https://app2.example.com   -> 客户端发送 clientOrigin=https://app2.example.com -> 验证通过，使用它
https://staging.example.com -> 客户端发送 clientOrigin=https://staging.example.com -> 验证通过，使用它
http://localhost:3000      -> 客户端发送 clientOrigin=http://localhost:3000 -> 验证通过，使用它
https://evil.com          -> 客户端发送 clientOrigin=https://evil.com -> 验证失败，回退到默认 RP_ORIGIN
```

### 示例 3: Docker 容器部署

**docker-compose.yml 示例：**

```yaml
version: "3.8"
services:
  app:
    image: Synapse:latest
    environment:
      RP_ID: example.com
      RP_ORIGIN: https://app.example.com
      RP_ORIGIN_MODE: dynamic
      ALLOWED_ORIGINS: https://app.example.com,https://staging.example.com
    ports:
      - "3000:3000"
```

## 日志输出

### 固定模式日志

```
[Passkey] 生成注册选项成功 { userId: 'user1', ... }
```

### 动态模式日志 - 验证通过

```
[Passkey] 使用动态 RP_ORIGIN { clientOrigin: 'https://app.example.com' }
```

### 动态模式日志 - 验证失败

```
[Passkey] 客户端提交的 origin 不在允许列表中，使用默认值 {
  clientOrigin: 'https://evil.com',
  allowedOrigins: 'https://app.example.com,https://app2.example.com'
}
```

## 安全考虑

1. **白名单验证**：在动态模式下，只有在 `ALLOWED_ORIGINS` 列表中的 origin 才会被接受
2. **协议验证**：origin 必须包括协议（http:// 或 https://）
3. **端口验证**：端口被认为是 origin 的一部分，不同的端口需要单独配置
4. **回退机制**：验证失败时自动回退到配置的 `RP_ORIGIN`，确保安全性

## 迁移指南

### 从旧版本升级

1. **更新代码**：使用最新的 `passkeyService.ts` 和路由文件
2. **前端无需改动**：前端 API 调用自动支持新功能
3. **配置环境变量**（可选）：
   - 保持原配置：无需修改，使用固定模式
   - 启用多域名：设置 `RP_ORIGIN_MODE=dynamic` 并配置 `ALLOWED_ORIGINS`

## 测试

### 本地测试

```bash
# 固定模式
RP_ORIGIN_MODE=fixed RP_ORIGIN=http://localhost:3000 npm run dev

# 动态模式
RP_ORIGIN_MODE=dynamic ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 npm run dev
```

### 测试多域名

使用 `/etc/hosts` 配置本地测试：

```
127.0.0.1 localhost.test
127.0.0.1 staging.test
```

然后访问：

- `http://localhost.test:3000`
- `http://staging.test:3000`

## 常见问题

### Q: RP_ID 和 RP_ORIGIN 有什么区别？

**A:**

- `RP_ID` 是域名部分（无协议无端口），例如 `example.com`
- `RP_ORIGIN` 是完整的协议+域名+端口，例如 `https://example.com` 或 `http://localhost:3000`
- 在 Passkey 规范中，RP_ID 必须是 RP_ORIGIN 中的域名部分

### Q: 如何支持 HTTP 和 HTTPS？

**A:** 在 `ALLOWED_ORIGINS` 中分别列出，例如：

```
ALLOWED_ORIGINS=https://app.example.com,http://localhost:3000
```

### Q: 如果客户端发送的 origin 不在列表中会怎样？

**A:** 系统会记录警告日志，并回退到配置的 `RP_ORIGIN` 值。这提供了安全的降级方案。

### Q: 如何在生产环境中启用动态模式？

**A:**

1. 设置 `RP_ORIGIN_MODE=dynamic`
2. 在 `ALLOWED_ORIGINS` 中列出所有生产环境的 origin
3. 确保 `RP_ID` 与所有 origin 的域名部分一致
4. 在生产服务器上设置这些环境变量

## 代码示例

### 前端调用示例

```typescript
import { passkeyApi, getClientOrigin } from "@/api/passkey";

// 查看当前的 clientOrigin
console.log("Current client origin:", getClientOrigin());

// 注册 Passkey（自动包含 clientOrigin）
const result = await passkeyApi.startRegistration("My Passkey");

// 认证（自动包含 clientOrigin）
const authResult = await passkeyApi.startAuthentication("username");
```

### 后端日志调试

启用调试模式查看详细日志：

```
LOG_LEVEL=debug npm run dev
```

查看 Passkey 相关日志：

```bash
grep -i passkey logs/combined.log | grep "动态\|dynamic\|ALLOWED_ORIGINS"
```

## 联系支持

如有问题或建议，请提交 GitHub Issue 或联系维护团队。
