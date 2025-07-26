---
sidebar_position: 4
---

# 用户管理接口

Synapse 提供完整的用户管理功能，包括用户注册、登录、信息查询等接口。

## 用户注册

创建新的用户账户。

### 请求信息

- **接口地址**: `POST /api/auth/register`
- **认证方式**: 无需认证
- **内容类型**: `application/json`

### 请求参数

| 参数       | 类型   | 必需 | 描述   | 验证规则                                |
| ---------- | ------ | ---- | ------ | --------------------------------------- |
| `username` | string | ✅   | 用户名 | 3-20 个字符，只能包含字母、数字、下划线 |
| `password` | string | ✅   | 密码   | 6-50 个字符                             |

### 请求示例

```bash
curl -X POST https://api.hapxs.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "password123"
  }'
```

### 响应示例

```json
{
  "message": "注册成功",
  "user": {
    "id": "user_123456",
    "username": "newuser"
  }
}
```

### 响应字段说明

| 字段            | 类型   | 描述         |
| --------------- | ------ | ------------ |
| `message`       | string | 操作结果消息 |
| `user.id`       | string | 用户唯一标识 |
| `user.username` | string | 用户名       |

## 用户登录

用户登录获取访问令牌。

### 请求信息

- **接口地址**: `POST /api/auth/login`
- **认证方式**: 无需认证
- **内容类型**: `application/json`

### 请求参数

| 参数       | 类型   | 必需 | 描述   |
| ---------- | ------ | ---- | ------ |
| `username` | string | ✅   | 用户名 |
| `password` | string | ✅   | 密码   |

### 请求示例

```bash
curl -X POST https://api.hapxs.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "password": "password123"
  }'
```

### 响应示例

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyXzEyMzQ1NiIsInVzZXJuYW1lIjoibmV3dXNlciIsImlhdCI6MTYzNTcyOTYwMCwiZXhwIjoxNjM1ODE2MDAwfQ.signature",
  "user": {
    "id": "user_123456",
    "username": "newuser"
  }
}
```

### 响应字段说明

| 字段            | 类型   | 描述         |
| --------------- | ------ | ------------ |
| `token`         | string | JWT 访问令牌 |
| `user.id`       | string | 用户唯一标识 |
| `user.username` | string | 用户名       |

## 获取当前用户信息

获取当前登录用户的详细信息。

### 请求信息

- **接口地址**: `GET /api/auth/me`
- **认证方式**: Bearer Token
- **内容类型**: `application/json`

### 请求示例

```bash
curl -X GET https://api.hapxs.com/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 响应示例

```json
{
  "user": {
    "id": "user_123456",
    "username": "newuser",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "lastLoginAt": "2024-01-01T12:30:00.000Z",
    "usageCount": 15,
    "dailyLimit": 100
  }
}
```

### 响应字段说明

| 字段               | 类型   | 描述         |
| ------------------ | ------ | ------------ |
| `user.id`          | string | 用户唯一标识 |
| `user.username`    | string | 用户名       |
| `user.createdAt`   | string | 账户创建时间 |
| `user.lastLoginAt` | string | 最后登录时间 |
| `user.usageCount`  | number | 今日使用次数 |
| `user.dailyLimit`  | number | 每日使用限制 |

## 管理员接口

### 获取用户列表

获取所有用户的基本信息（仅管理员）。

### 请求信息

- **接口地址**: `GET /api/admin/users`
- **认证方式**: Bearer Token (管理员权限)
- **内容类型**: `application/json`

### 请求示例

```bash
curl -X GET https://api.hapxs.com/api/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### 响应示例

```json
{
  "users": [
    {
      "id": "user_123456",
      "username": "user1",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "lastLoginAt": "2024-01-01T12:30:00.000Z",
      "usageCount": 15,
      "dailyLimit": 100,
      "isActive": true
    },
    {
      "id": "user_789012",
      "username": "user2",
      "createdAt": "2024-01-02T10:00:00.000Z",
      "lastLoginAt": "2024-01-02T11:00:00.000Z",
      "usageCount": 5,
      "dailyLimit": 100,
      "isActive": true
    }
  ],
  "total": 2
}
```

### 创建用户

创建新用户（仅管理员）。

### 请求信息

- **接口地址**: `POST /api/admin/users`
- **认证方式**: Bearer Token (管理员权限)
- **内容类型**: `application/json`

### 请求参数

| 参数         | 类型   | 必需 | 描述         |
| ------------ | ------ | ---- | ------------ |
| `username`   | string | ✅   | 用户名       |
| `password`   | string | ✅   | 密码         |
| `dailyLimit` | number | ❌   | 每日使用限制 |

### 请求示例

```bash
curl -X POST https://api.hapxs.com/api/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newadminuser",
    "password": "securepassword",
    "dailyLimit": 200
  }'
```

### 响应示例

```json
{
  "message": "用户创建成功",
  "user": {
    "id": "user_345678",
    "username": "newadminuser",
    "dailyLimit": 200,
    "createdAt": "2024-01-01T13:00:00.000Z"
  }
}
```

### 更新用户

更新用户信息（仅管理员）。

### 请求信息

- **接口地址**: `PUT /api/admin/users/{id}`
- **认证方式**: Bearer Token (管理员权限)
- **内容类型**: `application/json`

### 路径参数

| 参数 | 类型   | 必需 | 描述    |
| ---- | ------ | ---- | ------- |
| `id` | string | ✅   | 用户 ID |

### 请求参数

| 参数         | 类型    | 必需 | 描述         |
| ------------ | ------- | ---- | ------------ |
| `username`   | string  | ❌   | 新用户名     |
| `password`   | string  | ❌   | 新密码       |
| `dailyLimit` | number  | ❌   | 每日使用限制 |
| `isActive`   | boolean | ❌   | 是否激活     |

### 请求示例

```bash
curl -X PUT https://api.hapxs.com/api/admin/users/user_123456 \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dailyLimit": 150,
    "isActive": true
  }'
```

### 响应示例

```json
{
  "message": "用户更新成功",
  "user": {
    "id": "user_123456",
    "username": "user1",
    "dailyLimit": 150,
    "isActive": true,
    "updatedAt": "2024-01-01T14:00:00.000Z"
  }
}
```

### 删除用户

删除用户账户（仅管理员）。

### 请求信息

- **接口地址**: `DELETE /api/admin/users/{id}`
- **认证方式**: Bearer Token (管理员权限)

### 路径参数

| 参数 | 类型   | 必需 | 描述    |
| ---- | ------ | ---- | ------- |
| `id` | string | ✅   | 用户 ID |

### 请求示例

```bash
curl -X DELETE https://api.hapxs.com/api/admin/users/user_123456 \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

### 响应示例

```json
{
  "message": "用户删除成功"
}
```

## 使用限制

### 注册限制

- **频率限制**: 1 小时内最多 3 次注册尝试
- **用户名长度**: 3-20 个字符
- **密码长度**: 6-50 个字符
- **用户名格式**: 只能包含字母、数字、下划线

### 登录限制

- **频率限制**: 15 分钟内最多 5 次失败尝试
- **账户锁定**: 超过限制后账户暂时锁定
- **IP 限制**: 基于 IP 地址的请求频率限制

### 用户权限

- **普通用户**: 可以访问基本的 TTS 功能
- **管理员**: 可以访问所有功能，包括用户管理
- **未登录用户**: 只能使用有限的 TTS 功能

## 错误处理

### 认证相关错误

| 状态码 | 错误信息             | 原因               | 解决方案           |
| ------ | -------------------- | ------------------ | ------------------ |
| 400    | 用户名或密码格式错误 | 输入格式不符合要求 | 检查输入格式       |
| 400    | 用户名已存在         | 用户名已被注册     | 选择其他用户名     |
| 401    | 用户名或密码错误     | 凭据不正确         | 检查用户名和密码   |
| 401    | 令牌无效或已过期     | 令牌无效或过期     | 重新登录获取新令牌 |
| 403    | 权限不足             | 没有访问权限       | 联系管理员         |
| 429    | 注册尝试次数过多     | 超过注册限制       | 等待 1 小时后重试  |
| 429    | 登录尝试次数过多     | 超过登录限制       | 等待 15 分钟后重试 |

### 管理员接口错误

| 状态码 | 错误信息       | 原因                 | 解决方案       |
| ------ | -------------- | -------------------- | -------------- |
| 403    | 需要管理员权限 | 非管理员用户访问     | 使用管理员账户 |
| 404    | 用户不存在     | 用户 ID 无效         | 检查用户 ID    |
| 409    | 用户名已存在   | 创建用户时用户名重复 | 选择其他用户名 |

## 最佳实践

### 1. 用户注册流程

```javascript
// 用户注册流程
async function registerUser(username, password) {
  try {
    // 验证输入
    if (!isValidUsername(username)) {
      throw new Error("用户名格式不正确");
    }

    if (!isValidPassword(password)) {
      throw new Error("密码格式不正确");
    }

    // 发送注册请求
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("注册失败:", error.message);
    throw error;
  }
}

// 验证用户名
function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

// 验证密码
function isValidPassword(password) {
  return password.length >= 6 && password.length <= 50;
}
```

### 2. 登录状态管理

```javascript
// 登录状态管理
class AuthManager {
  constructor() {
    this.tokenKey = "auth_token";
    this.userKey = "user_info";
  }

  // 登录
  async login(username, password) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error("登录失败");
    }

    const data = await response.json();

    // 保存令牌和用户信息
    localStorage.setItem(this.tokenKey, data.token);
    localStorage.setItem(this.userKey, JSON.stringify(data.user));

    return data;
  }

  // 登出
  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  // 获取令牌
  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  // 获取用户信息
  getUser() {
    const userStr = localStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  // 检查是否已登录
  isLoggedIn() {
    return !!this.getToken();
  }
}
```

### 3. 自动令牌刷新

```javascript
// 自动令牌刷新
class TokenRefresher {
  constructor(authManager) {
    this.authManager = authManager;
    this.refreshThreshold = 5 * 60 * 1000; // 5分钟
  }

  // 检查令牌是否需要刷新
  shouldRefreshToken() {
    const token = this.authManager.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      const now = Date.now();
      const expiresAt = payload.exp * 1000;

      return expiresAt - now < this.refreshThreshold;
    } catch (error) {
      return true;
    }
  }

  // 刷新令牌
  async refreshToken(username, password) {
    try {
      await this.authManager.login(username, password);
      return true;
    } catch (error) {
      console.error("令牌刷新失败:", error);
      return false;
    }
  }
}
```

### 4. 错误处理

```javascript
// 统一的错误处理
function handleAuthError(error, status) {
  switch (status) {
    case 400:
      if (error.includes("用户名已存在")) {
        showMessage("用户名已被注册，请选择其他用户名");
      } else if (error.includes("格式错误")) {
        showMessage("输入格式不正确，请检查后重试");
      } else {
        showMessage(error);
      }
      break;

    case 401:
      if (error.includes("令牌")) {
        // 重定向到登录页面
        window.location.href = "/login";
      } else {
        showMessage("用户名或密码错误");
      }
      break;

    case 429:
      showMessage("请求过于频繁，请稍后再试");
      break;

    default:
      showMessage("操作失败，请稍后重试");
  }
}
```

---

**下一步** → [错误代码参考](./error-codes.md)
