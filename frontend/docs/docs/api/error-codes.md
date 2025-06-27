---
sidebar_position: 5
---

# 错误代码参考

本文档详细列出了 Synapse API 中可能遇到的所有错误代码及其解决方案。

## HTTP 状态码

### 2xx - 成功

| 状态码 | 描述         |
| ------ | ------------ |
| 200    | 请求成功     |
| 201    | 资源创建成功 |

### 4xx - 客户端错误

| 状态码 | 描述         | 常见原因                     |
| ------ | ------------ | ---------------------------- |
| 400    | 请求参数错误 | 参数格式不正确、缺少必需参数 |
| 401    | 认证失败     | 令牌无效、过期或未提供       |
| 403    | 权限不足     | 没有访问权限、生成码错误     |
| 404    | 资源不存在   | 接口地址错误、用户不存在     |
| 409    | 资源冲突     | 用户名已存在                 |
| 429    | 请求频率超限 | 超过频率限制、使用次数达上限 |

### 5xx - 服务器错误

| 状态码 | 描述           | 常见原因             |
| ------ | -------------- | -------------------- |
| 500    | 服务器内部错误 | 系统异常、服务不可用 |
| 502    | 网关错误       | 上游服务不可用       |
| 503    | 服务不可用     | 系统维护、过载       |

## 详细错误信息

### 认证相关错误

#### 400 - 用户名或密码格式错误

**错误信息**: `用户名或密码格式错误`

**原因**: 输入的用户名或密码不符合格式要求

**解决方案**:

- 用户名: 3-20 个字符，只能包含字母、数字、下划线
- 密码: 6-50 个字符

**示例**:

```json
{
  "error": "用户名或密码格式错误"
}
```

#### 400 - 用户名已存在

**错误信息**: `用户名已存在`

**原因**: 注册时使用的用户名已被其他用户使用

**解决方案**: 选择其他用户名

**示例**:

```json
{
  "error": "用户名已存在"
}
```

#### 401 - 用户名或密码错误

**错误信息**: `用户名或密码错误`

**原因**: 登录时提供的凭据不正确

**解决方案**: 检查用户名和密码是否正确

**示例**:

```json
{
  "error": "用户名或密码错误"
}
```

#### 401 - 令牌无效或已过期

**错误信息**: `令牌无效或已过期`

**原因**: JWT 令牌无效、过期或格式错误

**解决方案**: 重新登录获取新的令牌

**示例**:

```json
{
  "error": "令牌无效或已过期"
}
```

#### 403 - 权限不足

**错误信息**: `权限不足`

**原因**: 用户没有访问该资源的权限

**解决方案**: 联系管理员获取相应权限

**示例**:

```json
{
  "error": "权限不足"
}
```

### TTS 相关错误

#### 400 - 文本内容不能为空

**错误信息**: `文本内容不能为空`

**原因**: 请求中缺少 text 参数或参数为空

**解决方案**: 提供有效的文本内容

**示例**:

```json
{
  "error": "文本内容不能为空"
}
```

#### 400 - 文本长度不能超过 4096 个字符

**错误信息**: `文本长度不能超过4096个字符`

**原因**: 提供的文本内容超过最大长度限制

**解决方案**: 缩短文本内容或分段处理

**示例**:

```json
{
  "error": "文本长度不能超过4096个字符"
}
```

#### 400 - 文本包含违禁内容，请修改后重试

**错误信息**: `文本包含违禁内容，请修改后重试`

**原因**: 文本内容包含系统检测到的违禁词汇

**解决方案**: 修改文本内容，避免使用违禁词汇

**示例**:

```json
{
  "error": "文本包含违禁内容，请修改后重试"
}
```

#### 400 - 您已经生成过相同的内容，请登录以获取更多使用次数

**错误信息**: `您已经生成过相同的内容，请登录以获取更多使用次数`

**原因**: 未登录用户尝试重复生成相同内容

**解决方案**: 登录账户或修改文本内容

**示例**:

```json
{
  "error": "您已经生成过相同的内容，请登录以获取更多使用次数"
}
```

#### 403 - 生成码无效

**错误信息**: `生成码无效`

**原因**: generationCode 参数错误或未提供

**解决方案**: 检查并修正 generationCode 参数

**示例**:

```json
{
  "error": "生成码无效"
}
```

### 频率限制错误

#### 429 - 请求过于频繁，请稍后再试

**错误信息**: `请求过于频繁，请稍后再试`

**原因**: 请求频率超过系统限制

**解决方案**: 降低请求频率，等待一段时间后重试

**示例**:

```json
{
  "error": "请求过于频繁，请稍后再试"
}
```

#### 429 - 登录尝试次数过多，请 15 分钟后再试

**错误信息**: `登录尝试次数过多，请15分钟后再试`

**原因**: 短时间内登录失败次数过多

**解决方案**: 等待 15 分钟后重试

**示例**:

```json
{
  "error": "登录尝试次数过多，请15分钟后再试"
}
```

#### 429 - 注册尝试次数过多，请稍后再试

**错误信息**: `注册尝试次数过多，请稍后再试`

**原因**: 短时间内注册尝试次数过多

**解决方案**: 等待 1 小时后重试

**示例**:

```json
{
  "error": "注册尝试次数过多，请稍后再试"
}
```

#### 429 - 您今日的使用次数已达上限

**错误信息**: `您今日的使用次数已达上限`

**原因**: 用户当日 TTS 使用次数已达到限制

**解决方案**: 等待次日或联系管理员提升限制

**示例**:

```json
{
  "error": "您今日的使用次数已达上限"
}
```

### 管理员接口错误

#### 403 - 需要管理员权限

**错误信息**: `需要管理员权限`

**原因**: 非管理员用户尝试访问管理员接口

**解决方案**: 使用管理员账户登录

**示例**:

```json
{
  "error": "需要管理员权限"
}
```

#### 404 - 用户不存在

**错误信息**: `用户不存在`

**原因**: 管理员接口中指定的用户 ID 不存在

**解决方案**: 检查用户 ID 是否正确

**示例**:

```json
{
  "error": "用户不存在"
}
```

### 系统错误

#### 500 - 生成语音失败

**错误信息**: `生成语音失败`

**原因**: 服务器内部错误，TTS 服务异常

**解决方案**: 稍后重试或联系技术支持

**示例**:

```json
{
  "error": "生成语音失败"
}
```

#### 500 - 违禁词检测服务暂时不可用，请稍后重试

**错误信息**: `违禁词检测服务暂时不可用，请稍后重试`

**原因**: 违禁词检测服务暂时不可用

**解决方案**: 稍后重试

**示例**:

```json
{
  "error": "违禁词检测服务暂时不可用，请稍后重试"
}
```

## 错误处理最佳实践

### 1. 统一的错误处理函数

```javascript
// 统一的错误处理函数
function handleApiError(response) {
  if (response.ok) {
    return response.json();
  }

  return response.json().then((errorData) => {
    const error = new Error(errorData.error || "请求失败");
    error.status = response.status;
    error.data = errorData;
    throw error;
  });
}

// 使用示例
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return await handleApiError(response);
  } catch (error) {
    console.error("API 请求失败:", error);
    throw error;
  }
}
```

### 2. 错误分类处理

```javascript
// 错误分类处理
function handleErrorByType(error) {
  const status = error.status;

  switch (status) {
    case 400:
      handleBadRequest(error);
      break;
    case 401:
      handleUnauthorized(error);
      break;
    case 403:
      handleForbidden(error);
      break;
    case 429:
      handleRateLimit(error);
      break;
    case 500:
      handleServerError(error);
      break;
    default:
      handleUnknownError(error);
  }
}

// 处理不同类型的错误
function handleBadRequest(error) {
  const message = error.data?.error || "请求参数错误";
  showMessage(message, "warning");
}

function handleUnauthorized(error) {
  const message = error.data?.error || "认证失败";
  showMessage(message, "error");

  // 清除本地存储的令牌
  localStorage.removeItem("auth_token");

  // 重定向到登录页面
  setTimeout(() => {
    window.location.href = "/login";
  }, 2000);
}

function handleForbidden(error) {
  const message = error.data?.error || "权限不足";
  showMessage(message, "error");
}

function handleRateLimit(error) {
  const message = error.data?.error || "请求过于频繁";
  showMessage(message, "warning");

  // 显示重试倒计时
  showRetryCountdown();
}

function handleServerError(error) {
  const message = error.data?.error || "服务器内部错误";
  showMessage(message, "error");

  // 记录错误日志
  logError(error);
}
```

### 3. 重试机制

```javascript
// 带重试的请求函数
async function apiRequestWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (response.ok) {
        return await response.json();
      }

      const errorData = await response.json();

      // 对于某些错误不进行重试
      if (
        response.status === 400 ||
        response.status === 401 ||
        response.status === 403
      ) {
        throw new Error(errorData.error);
      }

      // 对于频率限制，等待后重试
      if (response.status === 429) {
        const waitTime = Math.pow(2, i) * 1000; // 指数退避
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      throw new Error(errorData.error);
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
```

### 4. 用户友好的错误提示

```javascript
// 用户友好的错误提示
function showUserFriendlyError(error) {
  const errorMessages = {
    文本内容不能为空: "请输入要转换的文本内容",
    文本长度不能超过4096个字符: "文本内容过长，请缩短后重试",
    文本包含违禁内容: "文本内容包含敏感词汇，请修改后重试",
    您已经生成过相同的内容: "请登录账户或修改文本内容",
    生成码无效: "系统配置错误，请联系管理员",
    请求过于频繁: "操作过于频繁，请稍后再试",
    您今日的使用次数已达上限: "今日使用次数已用完，请明天再试",
  };

  const message = errorMessages[error.message] || error.message;
  showMessage(message, "warning");
}
```

## 调试建议

### 1. 启用详细日志

```javascript
// 启用详细日志
const DEBUG = true;

function logApiRequest(url, options) {
  if (DEBUG) {
    console.log("API 请求:", {
      url,
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
    });
  }
}

function logApiResponse(response, data) {
  if (DEBUG) {
    console.log("API 响应:", {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      data,
    });
  }
}
```

### 2. 错误监控

```javascript
// 错误监控
function reportError(error, context = {}) {
  const errorReport = {
    message: error.message,
    stack: error.stack,
    status: error.status,
    data: error.data,
    context,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: window.location.href,
  };

  // 发送错误报告到服务器
  fetch("/api/error-report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(errorReport),
  }).catch(console.error);
}
```

---

**下一步** → [教程](./tutorials/basic-usage.md)
