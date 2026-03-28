# Synapse 后端 API 文档

## 概述

Synapse 是一个基于 Node.js 和 Express 的文本转语音服务，提供完整的用户认证、TTS 生成、双因素认证等功能。本文档详细介绍了所有可用的 API 接口。

## 基础信息

- **基础 URL**: `https://tts.hapx.one` 或 `http://localhost:3001` (开发环境)
- **API 前缀**: `/api`
- **认证方式**: JWT Token (Bearer Token)
- **内容类型**: `application/json`

## 认证

大部分 API 需要 JWT 认证，请在请求头中包含：

```
Authorization: Bearer <your-jwt-token>
```

## 错误响应格式

所有 API 在发生错误时都会返回统一格式：

```json
{
  "error": "错误描述",
  "details": "详细错误信息（可选）"
}
```

## 限流说明

系统对不同类型的接口实施了限流保护：

- **TTS 生成**: 每分钟 10 次
- **认证接口**: 每分钟 30 次
- **TOTP 操作**: 每 5 分钟 20 次
- **Passkey 操作**: 每 5 分钟 30 次
- **管理员操作**: 每分钟 50 次

## API 接口分类

### 1. 用户认证 (Authentication)

#### 1.1 用户注册

**接口**: `POST /api/auth/register`

**描述**: 注册新用户账户

**请求参数**:

```json
{
  "username": "用户名",
  "password": "密码"
}
```

**响应示例**:

```json
{
  "success": true,
  "message": "注册成功",
  "user": {
    "id": "用户ID",
    "username": "用户名",
    "role": "user"
  }
}
```

**使用示例**:

```javascript
const response = await fetch("/api/auth/register", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    username: "testuser",
    password: "password123",
  }),
});
```

#### 1.2 用户登录

**接口**: `POST /api/auth/login`

**描述**: 用户登录获取 JWT 令牌

**请求参数**:

```json
{
  "username": "用户名",
  "password": "密码"
}
```

**响应示例**:

```json
{
  "success": true,
  "token": "jwt-token-here",
  "user": {
    "id": "用户ID",
    "username": "用户名",
    "role": "user"
  }
}
```

**使用示例**:

```javascript
const response = await fetch("/api/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    username: "testuser",
    password: "password123",
  }),
});

const { token } = await response.json();
// 保存token用于后续请求
localStorage.setItem("token", token);
```

#### 1.3 获取当前用户信息

**接口**: `GET /api/auth/me`

**描述**: 获取当前登录用户的详细信息

**认证**: 需要 JWT Token

**响应示例**:

```json
{
  "id": "用户ID",
  "username": "用户名",
  "role": "user",
  "totpEnabled": false,
  "passkeyEnabled": false,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

**使用示例**:

```javascript
const response = await fetch("/api/auth/me", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### 2. TTS 语音生成

#### 2.1 生成语音

**接口**: `POST /api/tts/generate`

**描述**: 将文本转换为语音

**认证**: 需要 JWT Token

**请求参数**:

```json
{
  "text": "要转换的文本内容",
  "model": "tts-1",
  "voice": "alloy",
  "outputFormat": "mp3",
  "speed": 1.0
}
```

**参数说明**:

- `text`: 要转换的文本（必填）
- `model`: 语音模型，默认 "tts-1"
- `voice`: 发音人，可选值: "alloy", "echo", "fable", "onyx", "nova", "shimmer"
- `outputFormat`: 输出格式，可选值: "mp3", "opus", "aac", "flac"
- `speed`: 语速，范围 0.25-4.0，默认 1.0

**响应示例**:

```json
{
  "success": true,
  "audioUrl": "/static/audio/filename.mp3",
  "signature": "文件签名",
  "filename": "生成的文件名"
}
```

**使用示例**:

```javascript
const response = await fetch("/api/tts/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    text: "你好，世界！",
    voice: "alloy",
    speed: 1.0,
  }),
});

const { audioUrl } = await response.json();
// 播放音频
const audio = new Audio(audioUrl);
audio.play();
```

#### 2.2 获取生成历史

**接口**: `GET /api/tts/history`

**描述**: 获取用户最近的语音生成记录

**认证**: 需要 JWT Token

**响应示例**:

```json
{
  "records": [
    {
      "id": "记录ID",
      "text": "生成的文本",
      "voice": "alloy",
      "audioUrl": "/static/audio/filename.mp3",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 3. 双因素认证 (TOTP)

#### 3.1 生成 TOTP 设置

**接口**: `POST /api/totp/generate-setup`

**描述**: 生成 TOTP 二维码和设置信息

**认证**: 需要 JWT Token

**响应示例**:

```json
{
  "qrCode": "data:image/png;base64,...",
  "secret": "TOTP密钥",
  "setupUrl": "otpauth://totp/..."
}
```

#### 3.2 验证并启用 TOTP

**接口**: `POST /api/totp/verify-and-enable`

**描述**: 验证 TOTP 令牌并启用双因素认证

**认证**: 需要 JWT Token

**请求参数**:

```json
{
  "token": "6位数字令牌"
}
```

#### 3.3 验证 TOTP 令牌

**接口**: `POST /api/totp/verify-token`

**描述**: 验证 TOTP 令牌（登录时使用）

**请求参数**:

```json
{
  "username": "用户名",
  "token": "6位数字令牌"
}
```

#### 3.4 禁用 TOTP

**接口**: `POST /api/totp/disable`

**描述**: 禁用双因素认证

**认证**: 需要 JWT Token

#### 3.5 获取 TOTP 状态

**接口**: `GET /api/totp/status`

**描述**: 获取当前用户的 TOTP 启用状态

**认证**: 需要 JWT Token

**响应示例**:

```json
{
  "enabled": true,
  "backupCodesRemaining": 8
}
```

#### 3.6 获取备用恢复码

**接口**: `GET /api/totp/backup-codes`

**描述**: 获取备用恢复码列表

**认证**: 需要 JWT Token

#### 3.7 重新生成备用恢复码

**接口**: `POST /api/totp/regenerate-backup-codes`

**描述**: 重新生成备用恢复码

**认证**: 需要 JWT Token

### 4. Passkey 认证

#### 4.1 获取 Passkey 凭证列表

**接口**: `GET /api/passkey/credentials`

**描述**: 获取用户已注册的 Passkey 凭证

**认证**: 需要 JWT Token

#### 4.2 开始注册 Passkey

**接口**: `POST /api/passkey/register/start`

**描述**: 开始 Passkey 注册流程

**认证**: 需要 JWT Token

**请求参数**:

```json
{
  "credentialName": "认证器名称"
}
```

#### 4.3 完成注册 Passkey

**接口**: `POST /api/passkey/register/finish`

**描述**: 完成 Passkey 注册

**认证**: 需要 JWT Token

**请求参数**:

```json
{
  "credentialName": "认证器名称",
  "response": "WebAuthn响应对象"
}
```

#### 4.4 开始 Passkey 认证

**接口**: `POST /api/passkey/authenticate/start`

**描述**: 开始 Passkey 认证流程

**请求参数**:

```json
{
  "username": "用户名"
}
```

#### 4.5 完成 Passkey 认证

**接口**: `POST /api/passkey/authenticate/finish`

**描述**: 完成 Passkey 认证

**请求参数**:

```json
{
  "username": "用户名",
  "response": "WebAuthn响应对象"
}
```

### 5. 管理员接口

#### 5.1 获取用户列表

**接口**: `GET /api/admin/users`

**描述**: 获取所有用户列表

**认证**: 需要管理员权限

#### 5.2 创建用户

**接口**: `POST /api/admin/users`

**描述**: 创建新用户

**认证**: 需要管理员权限

**请求参数**:

```json
{
  "username": "用户名",
  "password": "密码"
}
```

#### 5.3 更新用户

**接口**: `PUT /api/admin/users/:id`

**描述**: 更新指定用户信息

**认证**: 需要管理员权限

#### 5.4 删除用户

**接口**: `DELETE /api/admin/users/:id`

**描述**: 删除指定用户

**认证**: 需要管理员权限

### 6. 系统状态

#### 6.1 服务状态检查

**接口**: `GET /api/status`

**描述**: 检查服务运行状态

**认证**: 需要管理员权限

**响应示例**:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 7. 命令执行

#### 7.1 添加命令

**接口**: `POST /api/command/y`

**描述**: 添加待执行的命令

**请求参数**:

```json
{
  "command": "要执行的命令",
  "password": "管理员密码"
}
```

#### 7.2 获取下一个命令

**接口**: `GET /api/command/q`

**描述**: 获取队列中的下一个命令

#### 7.3 移除命令

**接口**: `POST /api/command/p`

**描述**: 从队列中移除指定命令

**请求参数**:

```json
{
  "command": "要移除的命令"
}
```

#### 7.4 执行命令

**接口**: `POST /api/command/execute`

**描述**: 直接执行命令

**请求参数**:

```json
{
  "command": "要执行的命令",
  "password": "管理员密码"
}
```

#### 7.5 获取服务器状态

**接口**: `POST /api/command/status`

**描述**: 获取服务器系统状态

**请求参数**:

```json
{
  "password": "管理员密码"
}
```

### 8. LibreChat 集成

#### 8.1 获取最新镜像信息

**接口**: `GET /api/libre-chat/lc`

**描述**: 获取 LibreChat 最新镜像信息

**响应示例**:

```json
{
  "update_time": "2024-01-01T00:00:00.000Z",
  "image_name": "镜像名称"
}
```

#### 8.2 发送聊天消息

**接口**: `POST /api/libre-chat/send`

**描述**: 发送消息到 LibreChat 服务

**请求参数**:

```json
{
  "token": "用户认证token",
  "message": "聊天消息"
}
```

#### 8.3 获取聊天历史

**接口**: `GET /api/libre-chat/history`

**描述**: 获取聊天历史记录

**查询参数**:

- `token`: 用户认证 token
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20）

#### 8.4 清除聊天历史

**接口**: `DELETE /api/libre-chat/clear`

**描述**: 清除聊天历史

**请求参数**:

```json
{
  "token": "用户认证token"
}
```

### 9. 数据收集

#### 9.1 数据收集

**接口**: `POST /api/data-collection/collect_data`

**描述**: 通用数据收集接口，支持多种 HTTP 方法

**请求参数**: 任意 JSON 数据

**响应示例**:

```json
{
  "status": "success",
  "message": "Data received via POST method."
}
```

### 10. 日志管理

#### 10.1 上传日志文件

**接口**: `POST /api/sharelog`

**描述**: 上传日志文件

**认证**: 需要管理员密码

**请求参数**:

- `file`: 文件（multipart/form-data）
- `adminPassword`: 管理员密码

**响应示例**:

```json
{
  "id": "文件ID",
  "link": "访问链接",
  "ext": ".log"
}
```

#### 10.2 查询日志文件

**接口**: `POST /api/sharelog/:id`

**描述**: 查询指定 ID 的日志文件内容

**认证**: 需要管理员密码

**请求参数**:

```json
{
  "adminPassword": "管理员密码"
}
```

### 11. 防篡改检测

#### 11.1 上报篡改事件

**接口**: `POST /api/tamper/report-tampering`

**描述**: 上报客户端检测到的篡改事件

**请求参数**: 任意 JSON 数据

**响应示例**:

```json
{
  "message": "篡改报告已记录"
}
```

### 12. 其他接口

#### 12.1 获取 IP 信息

**接口**: `GET /ip`

**描述**: 获取客户端 IP 信息

**响应示例**:

```json
{
  "ip": "客户端IP",
  "location": "地理位置",
  "isp": "网络服务商"
}
```

#### 12.2 上报公网 IP

**接口**: `POST /api/report-ip`

**描述**: 前端上报公网 IP 地址

**请求参数**:

```json
{
  "ip": "公网IP",
  "userAgent": "用户代理",
  "url": "当前URL",
  "referrer": "来源页面",
  "timestamp": "时间戳"
}
```

## 接入教程

### 1. 前端集成示例

#### 1.1 基础认证流程

```javascript
class TTSClient {
  constructor(baseUrl = "https://tts.hapx.one") {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem("token");
  }

  // 设置认证token
  setToken(token) {
    this.token = token;
    localStorage.setItem("token", token);
  }

  // 登录
  async login(username, password) {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (data.success) {
      this.setToken(data.token);
    }
    return data;
  }

  // 生成语音
  async generateSpeech(text, options = {}) {
    const response = await fetch(`${this.baseUrl}/api/tts/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        text,
        voice: options.voice || "alloy",
        speed: options.speed || 1.0,
        ...options,
      }),
    });

    return await response.json();
  }

  // 获取用户信息
  async getCurrentUser() {
    const response = await fetch(`${this.baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    return await response.json();
  }
}

// 使用示例
const client = new TTSClient();

// 登录
await client.login("username", "password");

// 生成语音
const result = await client.generateSpeech("你好，世界！", {
  voice: "alloy",
  speed: 1.0,
});

// 播放音频
if (result.success) {
  const audio = new Audio(result.audioUrl);
  audio.play();
}
```

#### 1.2 TOTP 双因素认证集成

```javascript
class TOTPManager {
  constructor(baseUrl = "https://tts.hapx.one") {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem("token");
  }

  // 生成TOTP设置
  async generateSetup() {
    const response = await fetch(`${this.baseUrl}/api/totp/generate-setup`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    return await response.json();
  }

  // 验证并启用TOTP
  async verifyAndEnable(token) {
    const response = await fetch(`${this.baseUrl}/api/totp/verify-and-enable`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ token }),
    });

    return await response.json();
  }

  // 验证TOTP令牌
  async verifyToken(username, token) {
    const response = await fetch(`${this.baseUrl}/api/totp/verify-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, token }),
    });

    return await response.json();
  }
}
```

#### 1.3 Passkey 集成

```javascript
class PasskeyManager {
  constructor(baseUrl = "https://tts.hapx.one") {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem("token");
  }

  // 开始注册Passkey
  async startRegistration(credentialName) {
    const response = await fetch(`${this.baseUrl}/api/passkey/register/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ credentialName }),
    });

    const { options } = await response.json();

    // 使用WebAuthn API创建凭证
    const credential = await navigator.credentials.create({
      publicKey: options,
    });

    return credential;
  }

  // 完成注册
  async finishRegistration(credentialName, credential) {
    const response = await fetch(
      `${this.baseUrl}/api/passkey/register/finish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          credentialName,
          response: {
            id: credential.id,
            rawId: Array.from(new Uint8Array(credential.rawId)),
            response: {
              clientDataJSON: Array.from(
                new Uint8Array(credential.response.clientDataJSON)
              ),
              attestationObject: Array.from(
                new Uint8Array(credential.response.attestationObject)
              ),
            },
            type: credential.type,
          },
        }),
      }
    );

    return await response.json();
  }

  // 开始认证
  async startAuthentication(username) {
    const response = await fetch(
      `${this.baseUrl}/api/passkey/authenticate/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      }
    );

    const { options } = await response.json();

    // 使用WebAuthn API获取凭证
    const assertion = await navigator.credentials.get({
      publicKey: options,
    });

    return assertion;
  }

  // 完成认证
  async finishAuthentication(username, assertion) {
    const response = await fetch(
      `${this.baseUrl}/api/passkey/authenticate/finish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          response: {
            id: assertion.id,
            rawId: Array.from(new Uint8Array(assertion.rawId)),
            response: {
              clientDataJSON: Array.from(
                new Uint8Array(assertion.response.clientDataJSON)
              ),
              authenticatorData: Array.from(
                new Uint8Array(assertion.response.authenticatorData)
              ),
              signature: Array.from(
                new Uint8Array(assertion.response.signature)
              ),
              userHandle: assertion.response.userHandle
                ? Array.from(new Uint8Array(assertion.response.userHandle))
                : null,
            },
            type: assertion.type,
          },
        }),
      }
    );

    return await response.json();
  }
}
```

### 2. 错误处理

```javascript
class APIError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.details = details;
  }
}

async function handleAPIResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(
      errorData.error || "请求失败",
      response.status,
      errorData.details
    );
  }
  return await response.json();
}

// 使用示例
try {
  const result = await handleAPIResponse(
    await fetch("/api/tts/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: "测试文本" }),
    })
  );
  console.log("成功:", result);
} catch (error) {
  if (error instanceof APIError) {
    console.error("API错误:", error.message, error.status, error.details);
  } else {
    console.error("网络错误:", error);
  }
}
```

### 3. 限流处理

```javascript
class RateLimitHandler {
  constructor() {
    this.retryDelays = [1000, 2000, 5000, 10000]; // 重试延迟时间
  }

  async handleRateLimit(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error.status === 429) {
          // 限流错误
          if (i < maxRetries - 1) {
            const delay =
              this.retryDelays[i] ||
              this.retryDelays[this.retryDelays.length - 1];
            console.log(`请求被限流，${delay}ms后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
        throw error;
      }
    }
  }
}

// 使用示例
const rateLimitHandler = new RateLimitHandler();

await rateLimitHandler.handleRateLimit(async () => {
  return await client.generateSpeech("测试文本");
});
```

## 安全注意事项

1. **Token 安全**: JWT token 应妥善保存，不要暴露在前端代码中
2. **HTTPS**: 生产环境必须使用 HTTPS
3. **输入验证**: 客户端应验证所有输入数据
4. **错误处理**: 不要向用户暴露敏感的错误信息
5. **限流**: 客户端应处理 429 限流响应
6. **TOTP**: 备用恢复码应安全保存
7. **Passkey**: 确保在安全的环境中使用 WebAuthn API

## 常见问题

### Q: 如何处理认证失败？

A: 检查 JWT token 是否有效，如果过期需要重新登录

### Q: 语音生成失败怎么办？

A: 检查文本内容是否符合要求，确认账户有足够的配额

### Q: TOTP 验证失败？

A: 确保时间同步正确，检查 6 位数字令牌是否正确

### Q: Passkey 不工作？

A: 确保浏览器支持 WebAuthn，检查是否在 HTTPS 环境下

### Q: 遇到限流怎么办？

A: 等待一段时间后重试，或联系管理员提高限制

## 更新日志

- **v1.0.0**: 初始版本，包含基础 TTS 功能
- **v1.1.0**: 添加 TOTP 双因素认证
- **v1.2.0**: 添加 Passkey 支持
- **v1.3.0**: 添加管理员功能
- **v1.4.0**: 添加 LibreChat 集成
- **v1.5.0**: 添加防篡改检测
