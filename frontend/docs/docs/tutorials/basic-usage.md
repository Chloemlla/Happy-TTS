---
sidebar_position: 1
---

# 基础使用教程

本教程将指导您完成 Synapse 的基础使用流程，从注册账户到生成第一个语音文件。

## 准备工作

### 1. 环境要求

- **浏览器**: 支持现代浏览器的 Fetch API
- **网络**: 稳定的互联网连接
- **账户**: Synapse 用户账户

### 2. 获取 API 信息

- **基础 URL**: `https://api.hapxs.com`
- **生成码**: `wmy` (固定值)
- **认证方式**: JWT Bearer Token

## 第一步：注册账户

### 创建用户账户

首先，您需要注册一个 Synapse 账户：

```javascript
async function registerUser(username, password) {
  try {
    const response = await fetch(
      "https://api.hapxs.com/api/auth/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username,
          password: password,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    console.log("注册成功:", data);
    return data;
  } catch (error) {
    console.error("注册失败:", error.message);
    throw error;
  }
}

// 使用示例
registerUser("myusername", "mypassword123")
  .then((data) => console.log("用户创建成功"))
  .catch((error) => console.error("注册失败:", error.message));
```

### 验证注册结果

注册成功后，您应该看到类似以下的响应：

```json
{
  "message": "注册成功",
  "user": {
    "id": "user_123456",
    "username": "myusername"
  }
}
```

## 第二步：登录获取令牌

### 用户登录

使用注册的凭据登录获取访问令牌：

```javascript
async function loginUser(username, password) {
  try {
    const response = await fetch("https://api.hapxs.com/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
        password: password,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    console.log("登录成功:", data);
    return data;
  } catch (error) {
    console.error("登录失败:", error.message);
    throw error;
  }
}

// 使用示例
loginUser("myusername", "mypassword123")
  .then((data) => {
    // 保存令牌
    localStorage.setItem("auth_token", data.token);
    console.log("令牌已保存");
  })
  .catch((error) => console.error("登录失败:", error.message));
```

### 令牌管理

登录成功后，您会获得一个 JWT 令牌，需要妥善保存：

```javascript
// 保存令牌
function saveToken(token) {
  localStorage.setItem("auth_token", token);
}

// 获取令牌
function getToken() {
  return localStorage.getItem("auth_token");
}

// 删除令牌
function removeToken() {
  localStorage.removeItem("auth_token");
}

// 检查令牌是否存在
function hasToken() {
  return !!getToken();
}
```

## 第三步：生成语音

### 基本语音生成

使用获取到的令牌生成语音：

```javascript
async function generateSpeech(text, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("请先登录获取令牌");
  }

  const requestBody = {
    text: text,
    model: options.model || "tts-1",
    voice: options.voice || "alloy",
    output_format: options.output_format || "mp3",
    speed: options.speed || 1.0,
    generationCode: "wmy",
  };

  try {
    const response = await fetch("https://api.hapxs.com/api/tts/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    console.log("语音生成成功:", data);
    return data;
  } catch (error) {
    console.error("语音生成失败:", error.message);
    throw error;
  }
}

// 使用示例
generateSpeech("你好，欢迎使用 Synapse！")
  .then((result) => {
    console.log("音频文件地址:", result.audioUrl);
    // 播放音频
    playAudio(result.audioUrl);
  })
  .catch((error) => console.error("生成失败:", error.message));
```

### 播放音频

生成语音后，您可以播放或下载音频文件：

```javascript
// 播放音频
function playAudio(audioUrl) {
  const audio = new Audio(audioUrl);
  audio.play().catch((error) => {
    console.error("播放失败:", error);
  });
}

// 下载音频
function downloadAudio(audioUrl, filename) {
  const link = document.createElement("a");
  link.href = audioUrl;
  link.download = filename || "speech.mp3";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
```

## 第四步：获取历史记录

### 查看生成历史

获取您最近的语音生成记录：

```javascript
async function getHistory() {
  const token = getToken();

  if (!token) {
    throw new Error("请先登录获取令牌");
  }

  try {
    const response = await fetch("https://api.hapxs.com/api/tts/history", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    console.log("历史记录:", data);
    return data;
  } catch (error) {
    console.error("获取历史记录失败:", error.message);
    throw error;
  }
}

// 使用示例
getHistory()
  .then((data) => {
    data.records.forEach((record) => {
      console.log(`文本: ${record.text}`);
      console.log(`文件: ${record.fileName}`);
      console.log(`时间: ${record.timestamp}`);
    });
  })
  .catch((error) => console.error("获取失败:", error.message));
```

## 完整示例

### 完整的应用流程

```javascript
// 完整的 Synapse 使用流程
class SynapseClient {
  constructor() {
    this.baseUrl = "https://api.hapxs.com";
    this.token = localStorage.getItem("auth_token");
  }

  // 注册用户
  async register(username, password) {
    const response = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  // 用户登录
  async login(username, password) {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    const data = await response.json();
    this.token = data.token;
    localStorage.setItem("auth_token", data.token);
    return data;
  }

  // 生成语音
  async generateSpeech(text, options = {}) {
    if (!this.token) {
      throw new Error("请先登录");
    }

    const response = await fetch(`${this.baseUrl}/api/tts/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        text,
        model: options.model || "tts-1",
        voice: options.voice || "alloy",
        output_format: options.output_format || "mp3",
        speed: options.speed || 1.0,
        generationCode: "wmy",
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  // 获取历史记录
  async getHistory() {
    if (!this.token) {
      throw new Error("请先登录");
    }

    const response = await fetch(`${this.baseUrl}/api/tts/history`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error);
    }

    return await response.json();
  }

  // 登出
  logout() {
    this.token = null;
    localStorage.removeItem("auth_token");
  }
}

// 使用示例
async function main() {
  const client = new SynapseClient();

  try {
    // 1. 注册用户（如果还没有账户）
    console.log("正在注册用户...");
    await client.register("newuser", "password123");
    console.log("注册成功");

    // 2. 登录
    console.log("正在登录...");
    await client.login("newuser", "password123");
    console.log("登录成功");

    // 3. 生成语音
    console.log("正在生成语音...");
    const result = await client.generateSpeech("你好，这是测试语音！");
    console.log("语音生成成功:", result.audioUrl);

    // 4. 播放音频
    playAudio(result.audioUrl);

    // 5. 获取历史记录
    console.log("正在获取历史记录...");
    const history = await client.getHistory();
    console.log("历史记录:", history.records);
  } catch (error) {
    console.error("操作失败:", error.message);
  }
}

// 运行示例
main();
```

## 常见问题

### Q: 为什么注册失败？

**A**: 可能的原因：

- 用户名已存在
- 用户名或密码格式不正确
- 注册频率限制

### Q: 登录时提示"用户名或密码错误"

**A**: 请检查：

- 用户名和密码是否正确
- 是否已经注册账户
- 账户是否被锁定

### Q: 生成语音失败

**A**: 可能的原因：

- 令牌过期，需要重新登录
- 文本内容为空或过长
- 包含违禁内容
- 使用次数达上限

### Q: 如何选择合适的语音模型？

**A**:

- **tts-1**: 适合一般用途，响应速度快
- **tts-1-hd**: 适合高质量需求，音质更好

### Q: 如何选择合适的发音人？

**A**:

- **alloy**: 通用场景，多语言支持
- **echo**: 新闻播报，清晰明亮
- **fable**: 故事讲述，温暖友好
- **onyx**: 正式场合，深沉有力
- **nova**: 年轻群体，充满活力
- **shimmer**: 情感表达，柔和优雅

## 下一步

- 📖 学习 [高级功能](./advanced-features.md)
- 🛠️ 查看 [集成示例](./integration-examples.md)
- 📊 了解 [最佳实践](../best-practices/performance.md)

---

**继续学习** → [高级功能](./advanced-features.md)
