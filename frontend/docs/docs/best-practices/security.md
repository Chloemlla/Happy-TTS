---
title: 安全最佳实践
sidebar_position: 2
---

# 安全最佳实践

## 简介

本章节专门介绍 Synapse 的安全最佳实践，包括 API 密钥管理、输入验证、访问控制等安全相关建议。

## API 密钥管理

### 1. 密钥存储

#### 环境变量配置

```bash
# .env 文件（不要提交到版本控制）
TTS_API_KEY=your_secret_api_key_here
TTS_API_URL=https://api.hapxs.com
TTS_ENVIRONMENT=production
```

```javascript
// 使用环境变量
const config = {
  apiKey: process.env.TTS_API_KEY,
  apiUrl: process.env.TTS_API_URL,
  environment: process.env.TTS_ENVIRONMENT || "development",
};

// 验证配置
if (!config.apiKey) {
  throw new Error("TTS_API_KEY 环境变量未设置");
}
```

#### 密钥轮换策略

```javascript
class APIKeyManager {
  constructor() {
    this.keys = process.env.TTS_API_KEYS?.split(",") || [];
    this.currentIndex = 0;
    this.lastRotation = Date.now();
  }

  getCurrentKey() {
    return this.keys[this.currentIndex];
  }

  rotateKey() {
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    this.lastRotation = Date.now();
  }

  // 自动轮换（每24小时）
  shouldRotate() {
    return Date.now() - this.lastRotation > 24 * 60 * 60 * 1000;
  }

  async callWithRetry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        if (this.shouldRotate()) {
          this.rotateKey();
        }
        return await fn(this.getCurrentKey());
      } catch (error) {
        if (error.status === 401 && i < maxRetries - 1) {
          this.rotateKey();
          continue;
        }
        throw error;
      }
    }
  }
}
```

### 2. 密钥权限控制

```javascript
class SecureTTSClient {
  constructor(apiKey, permissions = {}) {
    this.apiKey = apiKey;
    this.permissions = {
      maxTextLength: permissions.maxTextLength || 4000,
      allowedModels: permissions.allowedModels || ["tts-1"],
      allowedVoices: permissions.allowedVoices || ["alloy", "echo", "fable"],
      rateLimit: permissions.rateLimit || 100,
      ...permissions,
    };
  }

  validatePermissions(text, options = {}) {
    // 检查文本长度
    if (text.length > this.permissions.maxTextLength) {
      throw new Error(`文本长度超过限制: ${this.permissions.maxTextLength}`);
    }

    // 检查模型权限
    if (
      options.model &&
      !this.permissions.allowedModels.includes(options.model)
    ) {
      throw new Error(`不允许使用模型: ${options.model}`);
    }

    // 检查发音人权限
    if (
      options.voice &&
      !this.permissions.allowedVoices.includes(options.voice)
    ) {
      throw new Error(`不允许使用发音人: ${options.voice}`);
    }
  }
}
```

## 输入验证与清理

### 1. 文本内容验证

```javascript
class TextValidator {
  static validateText(text) {
    if (!text || typeof text !== "string") {
      throw new Error("文本内容不能为空");
    }

    if (text.length > 4000) {
      throw new Error("文本长度不能超过4000字符");
    }

    // 检查危险内容
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^>]*>/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(text)) {
        throw new Error("文本包含不允许的内容");
      }
    }

    return text.trim();
  }

  static sanitizeText(text) {
    return text
      .replace(/[<>]/g, "") // 移除尖括号
      .replace(/javascript:/gi, "") // 移除 javascript:
      .replace(/data:/gi, "") // 移除 data:
      .replace(/vbscript:/gi, "") // 移除 vbscript:
      .replace(/on\w+\s*=/gi, "") // 移除事件处理器
      .trim();
  }
}
```

### 2. 参数验证

```javascript
class ParameterValidator {
  static validateOptions(options = {}) {
    const validated = {};

    // 模型验证
    const allowedModels = ["tts-1", "tts-1-hd"];
    if (options.model && !allowedModels.includes(options.model)) {
      throw new Error(`不支持的模型: ${options.model}`);
    }
    validated.model = options.model || "tts-1";

    // 发音人验证
    const allowedVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    if (options.voice && !allowedVoices.includes(options.voice)) {
      throw new Error(`不支持的发音人: ${options.voice}`);
    }
    validated.voice = options.voice || "alloy";

    // 语速验证
    if (options.speed !== undefined) {
      const speed = parseFloat(options.speed);
      if (isNaN(speed) || speed < 0.25 || speed > 4.0) {
        throw new Error("语速必须在 0.25 到 4.0 之间");
      }
      validated.speed = speed;
    }

    // 格式验证
    const allowedFormats = ["mp3", "wav", "flac", "opus"];
    if (
      options.output_format &&
      !allowedFormats.includes(options.output_format)
    ) {
      throw new Error(`不支持的格式: ${options.output_format}`);
    }
    validated.output_format = options.output_format || "mp3";

    return validated;
  }
}
```

## 访问控制

### 1. 速率限制

```javascript
class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = new Map(); // 按用户ID存储请求记录
  }

  async checkLimit(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];

    // 清理过期的请求记录
    const validRequests = userRequests.filter(
      (timestamp) => now - timestamp < this.timeWindow
    );

    if (validRequests.length >= this.maxRequests) {
      throw new Error("速率限制：请求过于频繁，请稍后重试");
    }

    validRequests.push(now);
    this.requests.set(userId, validRequests);
  }

  async executeWithLimit(userId, fn) {
    await this.checkLimit(userId);
    return await fn();
  }
}
```

### 2. 用户认证

```javascript
class AuthMiddleware {
  constructor(apiKeys) {
    this.apiKeys = new Set(apiKeys);
  }

  authenticate(request) {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new Error("缺少认证头");
    }

    const token = authHeader.replace("Bearer ", "");

    if (!this.apiKeys.has(token)) {
      throw new Error("无效的 API 密钥");
    }

    return { apiKey: token };
  }

  // Express 中间件
  middleware() {
    return (req, res, next) => {
      try {
        const auth = this.authenticate(req);
        req.user = auth;
        next();
      } catch (error) {
        res.status(401).json({ error: error.message });
      }
    };
  }
}
```

## 数据传输安全

### 1. HTTPS 强制

```javascript
class SecureTTSClient {
  constructor(apiUrl) {
    // 强制使用 HTTPS
    if (!apiUrl.startsWith("https://")) {
      throw new Error("API URL 必须使用 HTTPS");
    }

    this.apiUrl = apiUrl;
  }

  async makeRequest(endpoint, data) {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "User-Agent": "Synapse-Client/1.0",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
}
```

### 2. 请求签名

```javascript
class RequestSigner {
  constructor(secretKey) {
    this.secretKey = secretKey;
  }

  signRequest(data, timestamp) {
    const payload = JSON.stringify(data) + timestamp;
    const signature = crypto
      .createHmac("sha256", this.secretKey)
      .update(payload)
      .digest("hex");

    return signature;
  }

  verifySignature(data, timestamp, signature) {
    const expectedSignature = this.signRequest(data, timestamp);
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  }
}
```

## 日志与监控

### 1. 安全日志

```javascript
class SecurityLogger {
  constructor() {
    this.logger = console; // 可以替换为专业的日志服务
  }

  logSecurityEvent(event, details = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      details,
      severity: this.getSeverity(event),
    };

    this.logger.log(JSON.stringify(logEntry));

    // 对于高严重性事件，可以发送告警
    if (logEntry.severity === "high") {
      this.sendAlert(logEntry);
    }
  }

  getSeverity(event) {
    const severityMap = {
      invalid_api_key: "high",
      rate_limit_exceeded: "medium",
      malicious_content: "high",
      unauthorized_access: "high",
    };

    return severityMap[event] || "low";
  }

  sendAlert(logEntry) {
    // 发送到监控系统或邮件
    console.warn("安全告警:", logEntry);
  }
}
```

### 2. 异常检测

```javascript
class AnomalyDetector {
  constructor() {
    this.requestPatterns = new Map();
    this.alertThreshold = 10; // 异常请求阈值
  }

  detectAnomaly(userId, request) {
    const userPattern = this.requestPatterns.get(userId) || {
      requestCount: 0,
      lastRequest: null,
      suspiciousPatterns: 0,
    };

    const now = Date.now();

    // 检测请求频率异常
    if (userPattern.lastRequest && now - userPattern.lastRequest < 1000) {
      // 1秒内多次请求
      userPattern.suspiciousPatterns++;
    }

    // 检测文本内容异常
    if (this.isSuspiciousContent(request.text)) {
      userPattern.suspiciousPatterns++;
    }

    userPattern.requestCount++;
    userPattern.lastRequest = now;

    this.requestPatterns.set(userId, userPattern);

    // 触发告警
    if (userPattern.suspiciousPatterns >= this.alertThreshold) {
      this.triggerAlert(userId, userPattern);
    }
  }

  isSuspiciousContent(text) {
    // 检测可疑内容模式
    const suspiciousPatterns = [
      /[<>]/g, // 包含HTML标签
      /javascript:/gi,
      /eval\s*\(/gi,
      /document\./gi,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(text));
  }

  triggerAlert(userId, pattern) {
    console.warn(`检测到异常行为 - 用户: ${userId}`, pattern);
  }
}
```

## 最佳实践总结

### 1. 密钥管理要点

- ✅ 使用环境变量存储密钥
- ✅ 定期轮换 API 密钥
- ✅ 实施最小权限原则
- ✅ 监控密钥使用情况

### 2. 输入验证要点

- ✅ 验证所有输入参数
- ✅ 清理和过滤危险内容
- ✅ 设置合理的长度限制
- ✅ 使用白名单验证

### 3. 访问控制要点

- ✅ 实施速率限制
- ✅ 验证用户身份
- ✅ 记录访问日志
- ✅ 监控异常行为

### 4. 传输安全要点

- ✅ 强制使用 HTTPS
- ✅ 验证 SSL 证书
- ✅ 实施请求签名
- ✅ 保护敏感数据

## 下一步

- 📊 了解 [性能优化](./performance.md)
- 🛠️ 查看 [集成示例](../tutorials/integration-examples.md)
- 🔧 探索 [API 参考](../api/tts-endpoints.md)
