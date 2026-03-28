---
sidebar_position: 1
---

# 认证机制

Synapse API 使用 JWT (JSON Web Token) 进行身份认证。本文档详细介绍了认证流程和令牌管理。

## 认证流程

### 1. 用户注册

首先需要注册一个账户：

```bash
curl -X POST https://api.hapxs.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

**请求参数：**

| 参数       | 类型   | 必需 | 描述                     |
| ---------- | ------ | ---- | ------------------------ |
| `username` | string | ✅   | 用户名，长度 3-20 个字符 |
| `password` | string | ✅   | 密码，长度 6-50 个字符   |

**响应示例：**

```json
{
  "message": "注册成功",
  "user": {
    "id": "user_id",
    "username": "your_username"
  }
}
```

### 2. 用户登录

使用注册的凭据登录获取访问令牌：

```bash
curl -X POST https://api.hapxs.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

**响应示例：**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyX2lkIiwidXNlcm5hbWUiOiJ5b3VyX3VzZXJuYW1lIiwiaWF0IjoxNjM1NzI5NjAwLCJleHAiOjE2MzU4MTYwMDB9.signature",
  "user": {
    "id": "user_id",
    "username": "your_username"
  }
}
```

### 3. 使用令牌

在后续的 API 请求中，将令牌添加到请求头：

```bash
curl -X POST https://api.hapxs.com/api/tts/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello World",
    "generationCode": "wmy"
  }'
```

## 令牌管理

### 令牌格式

Synapse 使用标准的 JWT 格式，包含以下信息：

- **Header**: 算法信息
- **Payload**: 用户信息和过期时间
- **Signature**: 数字签名

### 令牌有效期

- **默认有效期**: 24 小时
- **自动续期**: 不支持自动续期
- **过期处理**: 令牌过期后需要重新登录

### 令牌刷新

当令牌过期时，需要重新登录获取新的令牌：

```javascript
// 检查令牌是否过期
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch (error) {
    return true;
  }
}

// 重新登录获取新令牌
async function refreshToken(username, password) {
  const response = await fetch("https://api.hapxs.com/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  return data.token;
}
```

## 安全措施

### 密码安全

- **加密存储**: 密码使用 bcrypt 加密存储
- **盐值轮数**: 使用 12 轮盐值加密
- **强度要求**: 密码长度至少 6 个字符

### 登录限制

为了防止暴力破解，系统实施了以下限制：

- **登录尝试限制**: 15 分钟内最多 5 次失败尝试
- **注册限制**: 1 小时内最多 3 次注册尝试
- **IP 限制**: 基于 IP 地址的请求频率限制

### 令牌安全

- **HTTPS 传输**: 所有令牌传输都通过 HTTPS 加密
- **短期有效**: 令牌有效期为 24 小时
- **签名验证**: 使用 HMAC-SHA256 算法签名

## 错误处理

### 认证相关错误

| 状态码 | 错误信息             | 原因               | 解决方案           |
| ------ | -------------------- | ------------------ | ------------------ |
| 400    | 用户名或密码格式错误 | 输入格式不符合要求 | 检查输入格式       |
| 401    | 用户名或密码错误     | 凭据不正确         | 检查用户名和密码   |
| 401    | 令牌无效或已过期     | 令牌无效或过期     | 重新登录获取新令牌 |
| 429    | 登录尝试次数过多     | 超过登录限制       | 等待 15 分钟后重试 |
| 429    | 注册尝试次数过多     | 超过注册限制       | 等待 1 小时后重试  |

### 错误响应格式

```json
{
  "error": "错误描述信息"
}
```

## 最佳实践

### 1. 令牌存储

```javascript
// 安全存储令牌
class TokenManager {
  constructor() {
    this.tokenKey = "happy_tts_token";
  }

  // 保存令牌
  saveToken(token) {
    localStorage.setItem(this.tokenKey, token);
  }

  // 获取令牌
  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  // 删除令牌
  removeToken() {
    localStorage.removeItem(this.tokenKey);
  }

  // 检查令牌是否存在
  hasToken() {
    return !!this.getToken();
  }
}
```

### 2. 自动重试机制

```javascript
// 带自动重试的 API 请求
async function apiRequest(url, options = {}) {
  const tokenManager = new TokenManager();
  const token = tokenManager.getToken();

  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  try {
    const response = await fetch(url, options);

    if (response.status === 401) {
      // 令牌过期，清除本地存储
      tokenManager.removeToken();
      throw new Error("令牌已过期，请重新登录");
    }

    return response;
  } catch (error) {
    throw error;
  }
}
```

### 3. 错误处理

```javascript
// 统一的错误处理
function handleAuthError(error) {
  if (error.status === 401) {
    // 重定向到登录页面
    window.location.href = "/login";
  } else if (error.status === 429) {
    // 显示限流提示
    showMessage("请求过于频繁，请稍后再试");
  } else {
    // 显示通用错误
    showMessage("认证失败，请检查您的凭据");
  }
}
```

## 管理员认证

### 管理员权限

管理员账户具有额外的权限，可以访问管理接口：

- 用户管理
- 系统统计
- 日志查看
- 配置管理

### 管理员登录

管理员使用相同的登录接口，但需要管理员凭据：

```bash
curl -X POST https://api.hapxs.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin_password"
  }'
```

管理员令牌具有更高的权限，可以访问 `/api/admin/*` 接口。

## 后端安全与认证实现补充说明

### 二次校验（TOTP/Passkey）

- 所有环境（包括开发环境）下，只要用户开启了 TOTP 或 Passkey，登录时都必须进行二次校验。
- 不再因本地 IP、内网 IP、白名单 IP 等跳过二次校验，防止被绕过。
- 二次校验接口（如 `/api/totp/status`、`/api/passkey/credentials`）禁止缓存，服务端强制返回最新状态，防止 304 响应导致安全绕过。
- 前端每次都强制刷新二次校验状态，确保安全。

### 本地 IP 自动登录限制

- 仅生产环境下允许本地 IP 自动获取管理员信息，开发环境（`NODE_ENV=development`）下该功能失效，防止开发调试时被本地 IP 绕过权限。
- 相关代码已在 `src/app.ts` 和 `src/controllers/authController.ts` 中实现。

### API 限流与防刷

- 所有敏感 API（如登录、注册、TTS 生成、管理操作等）均有基于 IP 的限流保护，防止暴力破解和接口滥用。
- 本地 IP 在开发环境下不再跳过限流，生产环境可配置白名单。

### 日志与审计

- 所有认证、二次校验、管理操作等均有详细日志，便于安全审计和问题追踪。
- 日志内容包括 IP、请求头、操作类型、时间戳等。

### 其它安全措施

- 严格校验所有用户输入，防止类型错误和注入攻击。
- 生产环境与开发环境安全策略保持一致，避免因调试便利导致安全隐患。
- 所有二次认证相关逻辑均有详细日志，便于安全审计和问题追踪。

---

**下一步** → [TTS 接口文档](./tts-endpoints.md)
