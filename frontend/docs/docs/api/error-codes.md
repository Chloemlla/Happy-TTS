---
sidebar_position: 5
---

# Synapse API 错误代码参考

本文档列出了 Synapse API 中可能遇到的所有错误代码及其解决方案。

## HTTP 状态码

### 2xx - 成功

- **200 OK**: 请求成功
- **201 Created**: 资源创建成功

### 4xx - 客户端错误

#### 400 Bad Request

请求参数错误或格式不正确

**常见原因**:

- 缺少必需参数
- 参数类型错误
- 参数格式不正确
- 请求体格式错误

**解决方案**:

```javascript
// 检查请求参数
const requiredParams = ["username", "password"];
for (const param of requiredParams) {
  if (!data[param]) {
    throw new Error(`缺少必需参数: ${param}`);
  }
}
```

#### 401 Unauthorized

未认证或认证失败

**常见原因**:

- 未提供 JWT token
- JWT token 已过期
- JWT token 格式错误
- 用户名或密码错误

**解决方案**:

```javascript
// 检查 token 是否存在
if (!token) {
  // 重新登录
  await login(username, password);
}

// 检查 token 是否过期
try {
  const decoded = jwt.verify(token, secret);
} catch (error) {
  // token 过期，重新登录
  await login(username, password);
}
```

#### 403 Forbidden

权限不足

**常见原因**:

- 用户角色权限不足
- 管理员密码错误
- IP 被封禁
- 账户被禁用

**解决方案**:

```javascript
// 检查用户权限
const user = await getCurrentUser();
if (user.role !== "admin") {
  throw new Error("需要管理员权限");
}

// 检查 IP 是否被封禁
if (response.status === 403 && response.data.error.includes("封禁")) {
  // 等待一段时间后重试
  await new Promise((resolve) => setTimeout(resolve, 60000));
}
```

#### 404 Not Found

资源不存在

**常见原因**:

- API 路径错误
- 用户不存在
- 文件不存在
- 记录不存在

**解决方案**:

```javascript
// 检查 API 路径
const validPaths = ["/api/auth/login", "/api/tts/generate"];
if (!validPaths.includes(path)) {
  throw new Error("API 路径不存在");
}

// 检查用户是否存在
const user = await getUser(username);
if (!user) {
  throw new Error("用户不存在");
}
```

#### 429 Too Many Requests

请求过于频繁（限流）

**常见原因**:

- 超过接口调用频率限制
- 短时间内发送过多请求

**解决方案**:

```javascript
// 指数退避重试
async function handleRateLimit(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429) {
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
}
```

### 5xx - 服务器错误

#### 500 Internal Server Error

服务器内部错误

**常见原因**:

- 服务器配置错误
- 数据库连接失败
- 第三方服务异常
- 代码逻辑错误

**解决方案**:

```javascript
// 重试机制
async function retryOnError(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 500 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

## 业务错误码

### 认证相关错误

#### AUTH_001 - 用户名已存在

**错误信息**: "用户名已存在"
**解决方案**: 使用其他用户名注册

#### AUTH_002 - 用户名或密码错误

**错误信息**: "用户名或密码错误"
**解决方案**: 检查用户名和密码是否正确

#### AUTH_003 - Token 已过期

**错误信息**: "Token 已过期"
**解决方案**: 重新登录获取新的 token

#### AUTH_004 - 用户不存在

**错误信息**: "用户不存在"
**解决方案**: 检查用户名是否正确，或先注册用户

### TTS 相关错误

#### TTS_001 - 文本内容为空

**错误信息**: "文本内容不能为空"
**解决方案**: 提供有效的文本内容

#### TTS_002 - 文本内容过长

**错误信息**: "文本内容过长"
**解决方案**: 缩短文本内容（通常限制在 4000 字符以内）

#### TTS_003 - 不支持的语音模型

**错误信息**: "不支持的语音模型"
**解决方案**: 使用支持的语音模型（如 "tts-1"）

#### TTS_004 - 不支持的发音人

**错误信息**: "不支持的发音人"
**解决方案**: 使用支持的发音人（alloy, echo, fable, onyx, nova, shimmer）

#### TTS_005 - 语速超出范围

**错误信息**: "语速超出范围"
**解决方案**: 使用 0.25-4.0 范围内的语速值

### TOTP 相关错误

#### TOTP_001 - TOTP 已启用

**错误信息**: "TOTP 已启用"
**解决方案**: 如需重新设置，先禁用当前 TOTP

#### TOTP_002 - TOTP 未启用

**错误信息**: "TOTP 未启用"
**解决方案**: 先启用 TOTP 功能

#### TOTP_003 - 验证码错误

**错误信息**: "验证码错误"
**解决方案**: 检查 6 位数字验证码是否正确

#### TOTP_004 - 验证码已过期

**错误信息**: "验证码已过期"
**解决方案**: 重新生成验证码

#### TOTP_005 - 备用恢复码无效

**错误信息**: "备用恢复码无效"
**解决方案**: 使用有效的备用恢复码

### Passkey 相关错误

#### PASSKEY_001 - Passkey 未启用

**错误信息**: "用户未启用 Passkey"
**解决方案**: 先注册 Passkey

#### PASSKEY_002 - 无可用凭证

**错误信息**: "没有注册的凭证"
**解决方案**: 先注册 Passkey 凭证

#### PASSKEY_003 - 认证失败

**错误信息**: "Passkey 认证失败"
**解决方案**: 检查认证器是否正常工作

#### PASSKEY_004 - 凭证名称重复

**错误信息**: "凭证名称已存在"
**解决方案**: 使用其他凭证名称

### 管理员相关错误

#### ADMIN_001 - 权限不足

**错误信息**: "需要管理员权限"
**解决方案**: 使用管理员账户登录

#### ADMIN_002 - 管理员密码错误

**错误信息**: "管理员密码错误"
**解决方案**: 提供正确的管理员密码

#### ADMIN_003 - 用户已存在

**错误信息**: "用户已存在"
**解决方案**: 使用其他用户名

#### ADMIN_004 - 用户不存在

**错误信息**: "用户不存在"
**解决方案**: 检查用户 ID 是否正确

### 系统相关错误

#### SYS_001 - 服务不可用

**错误信息**: "服务暂时不可用"
**解决方案**: 稍后重试

#### SYS_002 - 数据库连接失败

**错误信息**: "数据库连接失败"
**解决方案**: 联系管理员

#### SYS_003 - 文件上传失败

**错误信息**: "文件上传失败"
**解决方案**: 检查文件大小和格式

#### SYS_004 - 命令执行失败

**错误信息**: "命令执行失败"
**解决方案**: 检查命令语法和权限

## 错误处理最佳实践

### 1. 统一错误处理

```javascript
class APIError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function handleAPIResponse(response) {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new APIError(
      errorData.error || "请求失败",
      response.status,
      errorData.code,
      errorData.details
    );
  }
  return await response.json();
}
```

### 2. 错误重试机制

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 || error.status === 500) {
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000;
          console.log(`请求失败，${delay}ms 后重试...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
}
```

### 3. 用户友好的错误提示

```javascript
function getUserFriendlyMessage(error) {
  const errorMessages = {
    AUTH_001: "用户名已被使用，请选择其他用户名",
    AUTH_002: "用户名或密码错误，请检查后重试",
    AUTH_003: "登录已过期，请重新登录",
    TTS_001: "请输入要转换的文本内容",
    TTS_002: "文本内容过长，请缩短后重试",
    TOTP_003: "验证码错误，请重新输入",
    PASSKEY_003: "认证失败，请检查认证器",
    ADMIN_001: "需要管理员权限才能执行此操作",
    SYS_001: "服务暂时不可用，请稍后重试",
  };

  return errorMessages[error.code] || error.message || "操作失败，请稍后重试";
}
```

### 4. 错误日志记录

```javascript
function logError(error, context = {}) {
  console.error("API 错误:", {
    message: error.message,
    status: error.status,
    code: error.code,
    details: error.details,
    context,
    timestamp: new Date().toISOString(),
  });

  // 可以发送到错误监控服务
  if (error.status >= 500) {
    // 发送到监控服务
    sendToErrorMonitoring(error, context);
  }
}
```

## 常见问题解决

### Q: 如何处理 429 限流错误？

A: 实现指数退避重试机制，或降低请求频率

### Q: Token 过期怎么办？

A: 捕获 401 错误，自动重新登录获取新 token

### Q: 如何处理网络错误？

A: 实现重试机制和离线检测

### Q: 用户输入错误如何处理？

A: 在前端进行输入验证，提供清晰的错误提示

### Q: 服务器错误如何排查？

A: 查看错误日志，联系技术支持

## 联系支持

如果您遇到未在此文档中列出的错误，请：

1. 记录完整的错误信息
2. 提供复现步骤
3. 包含相关的请求和响应数据
4. 联系技术支持团队

---

**下一步** → [教程](./tutorials/basic-usage.md)
