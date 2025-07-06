# Synapse API 快速入门

## 简介

本文档将帮助您快速了解和使用 Synapse 的核心 API 接口。

## 基础配置

### 1. 设置基础 URL

```javascript
const BASE_URL = "https://tts.hapx.one"; // 生产环境
// const BASE_URL = 'http://localhost:3001'; // 开发环境
```

### 2. 认证 Token

大部分 API 需要 JWT 认证，请在请求头中包含：

```javascript
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
};
```

## 核心功能

### 1. 用户认证

#### 注册新用户

```javascript
async function register(username, password) {
  const response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return await response.json();
}

// 使用示例
const result = await register("myuser", "mypassword");
console.log(result);
```

#### 用户登录

```javascript
async function login(username, password) {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();

  if (data.success) {
    // 保存 token
    localStorage.setItem("token", data.token);
  }

  return data;
}

// 使用示例
const loginResult = await login("myuser", "mypassword");
```

### 2. 文本转语音

#### 生成语音

```javascript
async function generateSpeech(text, options = {}) {
  const token = localStorage.getItem("token");

  const response = await fetch(`${BASE_URL}/api/tts/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

// 使用示例
const speechResult = await generateSpeech("你好，世界！", {
  voice: "alloy",
  speed: 1.0,
});

if (speechResult.success) {
  // 播放音频
  const audio = new Audio(speechResult.audioUrl);
  audio.play();
}
```

#### 获取生成历史

```javascript
async function getHistory() {
  const token = localStorage.getItem("token");

  const response = await fetch(`${BASE_URL}/api/tts/history`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return await response.json();
}

// 使用示例
const history = await getHistory();
console.log("生成历史:", history.records);
```

### 3. 双因素认证 (TOTP)

#### 启用 TOTP

```javascript
async function enableTOTP() {
  const token = localStorage.getItem("token");

  // 1. 生成设置信息
  const setupResponse = await fetch(`${BASE_URL}/api/totp/generate-setup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const setupData = await setupResponse.json();

  // 2. 显示二维码给用户扫描
  console.log("TOTP 二维码:", setupData.qrCode);

  // 3. 用户输入验证码后验证
  return setupData;
}

async function verifyTOTP(token) {
  const authToken = localStorage.getItem("token");

  const response = await fetch(`${BASE_URL}/api/totp/verify-and-enable`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ token }),
  });

  return await response.json();
}

// 使用示例
const setup = await enableTOTP();
// 用户扫描二维码后输入6位数字
const verifyResult = await verifyTOTP("123456");
```

#### 登录时验证 TOTP

```javascript
async function loginWithTOTP(username, password, totpToken) {
  // 1. 先进行普通登录
  const loginResult = await login(username, password);

  if (loginResult.success && loginResult.user.totpEnabled) {
    // 2. 验证 TOTP
    const totpResponse = await fetch(`${BASE_URL}/api/totp/verify-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, token: totpToken }),
    });

    const totpResult = await totpResponse.json();

    if (totpResult.success) {
      return { ...loginResult, totpVerified: true };
    } else {
      throw new Error("TOTP 验证失败");
    }
  }

  return loginResult;
}
```

### 4. Passkey 认证

#### 注册 Passkey

```javascript
async function registerPasskey(credentialName) {
  const token = localStorage.getItem("token");

  // 1. 开始注册
  const startResponse = await fetch(`${BASE_URL}/api/passkey/register/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ credentialName }),
  });

  const { options } = await startResponse.json();

  // 2. 使用 WebAuthn API 创建凭证
  const credential = await navigator.credentials.create({
    publicKey: options,
  });

  // 3. 完成注册
  const finishResponse = await fetch(
    `${BASE_URL}/api/passkey/register/finish`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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

  return await finishResponse.json();
}
```

#### 使用 Passkey 登录

```javascript
async function loginWithPasskey(username) {
  // 1. 开始认证
  const startResponse = await fetch(
    `${BASE_URL}/api/passkey/authenticate/start`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username }),
    }
  );

  const { options } = await startResponse.json();

  // 2. 使用 WebAuthn API 获取凭证
  const assertion = await navigator.credentials.get({
    publicKey: options,
  });

  // 3. 完成认证
  const finishResponse = await fetch(
    `${BASE_URL}/api/passkey/authenticate/finish`,
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
            signature: Array.from(new Uint8Array(assertion.response.signature)),
            userHandle: assertion.response.userHandle
              ? Array.from(new Uint8Array(assertion.response.userHandle))
              : null,
          },
          type: assertion.type,
        },
      }),
    }
  );

  const result = await finishResponse.json();

  if (result.success) {
    localStorage.setItem("token", result.token);
  }

  return result;
}
```

## 完整示例

### 简单的 TTS 应用

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Synapse 示例</title>
  </head>
  <body>
    <h1>Synapse 文本转语音</h1>

    <div>
      <input type="text" id="username" placeholder="用户名" />
      <input type="password" id="password" placeholder="密码" />
      <button onclick="login()">登录</button>
    </div>

    <div>
      <textarea id="text" placeholder="输入要转换的文本"></textarea>
      <select id="voice">
        <option value="alloy">Alloy</option>
        <option value="echo">Echo</option>
        <option value="fable">Fable</option>
        <option value="onyx">Onyx</option>
        <option value="nova">Nova</option>
        <option value="shimmer">Shimmer</option>
      </select>
      <button onclick="generateSpeech()">生成语音</button>
    </div>

    <div id="result"></div>

    <script>
      const BASE_URL = "https://tts.hapx.one";

      async function login() {
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;

        try {
          const result = await fetch(`${BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
          });

          const data = await result.json();

          if (data.success) {
            localStorage.setItem("token", data.token);
            alert("登录成功！");
          } else {
            alert("登录失败：" + data.error);
          }
        } catch (error) {
          alert("登录失败：" + error.message);
        }
      }

      async function generateSpeech() {
        const text = document.getElementById("text").value;
        const voice = document.getElementById("voice").value;
        const token = localStorage.getItem("token");

        if (!token) {
          alert("请先登录");
          return;
        }

        if (!text) {
          alert("请输入文本");
          return;
        }

        try {
          const result = await fetch(`${BASE_URL}/api/tts/generate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ text, voice }),
          });

          const data = await result.json();

          if (data.success) {
            const audio = new Audio(data.audioUrl);
            audio.play();
            document.getElementById("result").innerHTML = "语音生成成功！";
          } else {
            document.getElementById("result").innerHTML =
              "生成失败：" + data.error;
          }
        } catch (error) {
          document.getElementById("result").innerHTML =
            "请求失败：" + error.message;
        }
      }
    </script>
  </body>
</html>
```

## 错误处理

### 通用错误处理函数

```javascript
async function handleAPIRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API 请求失败:", error);
    throw error;
  }
}

// 使用示例
try {
  const result = await handleAPIRequest(`${BASE_URL}/api/tts/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: "测试文本" }),
  });
  console.log("成功:", result);
} catch (error) {
  console.error("失败:", error.message);
}
```

### 限流处理

```javascript
async function handleRateLimit(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes("429") || error.message.includes("限流")) {
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000; // 指数退避
          console.log(`请求被限流，${delay}ms 后重试...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
}
```

## 最佳实践

1. **Token 管理**: 妥善保存和更新 JWT token
2. **错误处理**: 始终处理 API 错误和网络异常
3. **用户体验**: 在请求过程中显示加载状态
4. **安全性**: 不要在客户端代码中硬编码敏感信息
5. **性能**: 合理使用缓存和限流处理

## 下一步

- 查看完整的 [API 文档](./backend-api.md) 了解所有可用接口
- 参考 [SDK 文档](../sdk/) 获取更多编程语言的示例
- 查看 [最佳实践](../best-practices/) 了解安全和使用建议
