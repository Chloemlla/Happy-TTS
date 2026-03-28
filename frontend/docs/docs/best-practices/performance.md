---
title: 最佳实践
sidebar_position: 1
---

# 最佳实践

## 简介

本章节提供使用 Synapse 的最佳实践指南，包括性能优化、安全考虑、错误处理等方面的建议。

## 性能优化

### 1. 缓存策略

#### 客户端缓存

```javascript
// 使用浏览器缓存存储已生成的音频
class TTSCache {
  constructor() {
    this.cache = new Map();
  }

  async generateSpeech(text, options = {}) {
    const cacheKey = this.generateCacheKey(text, options);

    // 检查缓存
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 调用 API
    const result = await this.callTTSAPI(text, options);

    // 存储到缓存
    this.cache.set(cacheKey, result);
    return result;
  }

  generateCacheKey(text, options) {
    return `${text}-${options.model}-${options.voice}-${options.speed}`;
  }
}
```

#### 服务端缓存

```python
import redis
import hashlib
import json

class TTSCache:
    def __init__(self):
        self.redis_client = redis.Redis(host='localhost', port=6379, db=0)

    def generate_cache_key(self, text, options):
        content = f"{text}-{json.dumps(options, sort_keys=True)}"
        return hashlib.md5(content.encode()).hexdigest()

    async def get_or_generate(self, text, options):
        cache_key = self.generate_cache_key(text, options)

        # 检查缓存
        cached_result = self.redis_client.get(cache_key)
        if cached_result:
            return json.loads(cached_result)

        # 生成新音频
        result = await self.call_tts_api(text, options)

        # 存储到缓存（设置过期时间）
        self.redis_client.setex(cache_key, 3600, json.dumps(result))
        return result
```

### 2. 批量处理

#### 并发控制

```javascript
class BatchTTSProcessor {
  constructor(maxConcurrent = 5) {
    this.maxConcurrent = maxConcurrent;
    this.queue = [];
    this.running = 0;
  }

  async processBatch(texts, options = {}) {
    const results = [];
    const chunks = this.chunkArray(texts, this.maxConcurrent);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map((text) =>
        this.generateSpeech(text, options)
      );
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

### 3. 音频格式选择

#### 根据使用场景选择格式

```javascript
const formatRecommendations = {
  web: {
    format: "mp3",
    reason: "兼容性好，文件小，适合网页播放",
  },
  mobile: {
    format: "mp3",
    reason: "移动端支持良好，流量友好",
  },
  highQuality: {
    format: "wav",
    reason: "无损音质，适合专业用途",
  },
  streaming: {
    format: "opus",
    reason: "文件最小，适合实时流媒体",
  },
};

function getOptimalFormat(useCase) {
  return formatRecommendations[useCase]?.format || "mp3";
}
```

## 安全最佳实践

### 1. API 密钥管理

#### 环境变量配置

```bash
# .env 文件
TTS_API_KEY=your_api_key_here
TTS_API_URL=https://api.hapxs.com
```

```javascript
// 使用环境变量
const config = {
  apiKey: process.env.TTS_API_KEY,
  apiUrl: process.env.TTS_API_URL,
  timeout: parseInt(process.env.TTS_TIMEOUT) || 30000,
};
```

#### 密钥轮换

```javascript
class APIKeyManager {
  constructor() {
    this.keys = process.env.TTS_API_KEYS?.split(",") || [];
    this.currentIndex = 0;
  }

  getCurrentKey() {
    return this.keys[this.currentIndex];
  }

  rotateKey() {
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
  }

  async callWithRetry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
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

### 2. 输入验证

#### 文本内容验证

```javascript
class TextValidator {
  static validateText(text) {
    if (!text || typeof text !== "string") {
      throw new Error("文本内容不能为空");
    }

    if (text.length > 4000) {
      throw new Error("文本长度不能超过4000字符");
    }

    // 检查特殊字符
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:/gi,
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
      .trim();
  }
}
```

### 3. 速率限制

#### 客户端速率限制

```javascript
class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }

  async checkLimit() {
    const now = Date.now();

    // 清理过期的请求记录
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.timeWindow
    );

    if (this.requests.length >= this.maxRequests) {
      throw new Error("速率限制：请求过于频繁");
    }

    this.requests.push(now);
  }

  async executeWithLimit(fn) {
    await this.checkLimit();
    return await fn();
  }
}
```

## 错误处理

### 1. 统一错误处理

```javascript
class TTSError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "TTSError";
    this.code = code;
    this.details = details;
  }
}

class TTSClient {
  async generateSpeech(text, options = {}) {
    try {
      // 输入验证
      const validatedText = TextValidator.validateText(text);

      // 速率限制检查
      await this.rateLimiter.checkLimit();

      // 调用 API
      const response = await this.callAPI(validatedText, options);

      return response;
    } catch (error) {
      // 错误分类和处理
      if (error instanceof TTSError) {
        throw error;
      }

      if (error.code === "NETWORK_ERROR") {
        throw new TTSError("网络连接失败", "NETWORK_ERROR", {
          originalError: error,
        });
      }

      if (error.status === 429) {
        throw new TTSError("请求过于频繁，请稍后重试", "RATE_LIMIT_EXCEEDED");
      }

      if (error.status === 401) {
        throw new TTSError("API 密钥无效", "UNAUTHORIZED");
      }

      throw new TTSError("语音生成失败", "UNKNOWN_ERROR", {
        originalError: error,
      });
    }
  }
}
```

### 2. 重试机制

```javascript
class RetryManager {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithRetry(fn, shouldRetry = this.defaultShouldRetry) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === this.maxRetries || !shouldRetry(error)) {
          throw error;
        }

        // 指数退避
        const delay = this.baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
  }

  defaultShouldRetry(error) {
    // 只对网络错误和服务器错误重试
    return (
      error.code === "NETWORK_ERROR" ||
      (error.status >= 500 && error.status < 600)
    );
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

## 监控与日志

### 1. 性能监控

```javascript
class TTSMonitor {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  async trackRequest(fn) {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      const result = await fn();
      this.metrics.successfulRequests++;
      this.updateResponseTime(Date.now() - startTime);
      return result;
    } catch (error) {
      this.metrics.failedRequests++;
      throw error;
    }
  }

  updateResponseTime(responseTime) {
    const { totalRequests, averageResponseTime } = this.metrics;
    this.metrics.averageResponseTime =
      (averageResponseTime * (totalRequests - 1) + responseTime) /
      totalRequests;
  }

  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.successfulRequests / this.metrics.totalRequests,
      cacheHitRate:
        this.metrics.cacheHits /
        (this.metrics.cacheHits + this.metrics.cacheMisses),
    };
  }
}
```

### 2. 日志记录

```javascript
class TTSLogger {
  constructor(level = "info") {
    this.level = level;
  }

  log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
    };

    console.log(JSON.stringify(logEntry));

    // 可以发送到日志服务
    this.sendToLogService(logEntry);
  }

  info(message, data) {
    this.log("info", message, data);
  }

  error(message, error) {
    this.log("error", message, {
      error: error.message,
      stack: error.stack,
      code: error.code,
    });
  }

  warn(message, data) {
    this.log("warn", message, data);
  }
}
```

## 配置管理

### 1. 环境配置

```javascript
class TTSConfig {
  constructor() {
    this.config = {
      api: {
        url: process.env.TTS_API_URL || "https://api.hapxs.com",
        key: process.env.TTS_API_KEY,
        timeout: parseInt(process.env.TTS_TIMEOUT) || 30000,
      },
      cache: {
        enabled: process.env.TTS_CACHE_ENABLED === "true",
        ttl: parseInt(process.env.TTS_CACHE_TTL) || 3600,
      },
      rateLimit: {
        maxRequests: parseInt(process.env.TTS_RATE_LIMIT_MAX) || 10,
        timeWindow: parseInt(process.env.TTS_RATE_LIMIT_WINDOW) || 60000,
      },
      retry: {
        maxRetries: parseInt(process.env.TTS_RETRY_MAX) || 3,
        baseDelay: parseInt(process.env.TTS_RETRY_DELAY) || 1000,
      },
    };
  }

  get(key) {
    return key.split(".").reduce((obj, k) => obj?.[k], this.config);
  }

  validate() {
    const required = ["api.url", "api.key"];
    for (const key of required) {
      if (!this.get(key)) {
        throw new Error(`缺少必需的配置: ${key}`);
      }
    }
  }
}
```

## 最佳实践总结

### 1. 性能优化要点

- ✅ 使用缓存减少重复请求
- ✅ 批量处理提高效率
- ✅ 选择合适的音频格式
- ✅ 实施并发控制

### 2. 安全要点

- ✅ 安全存储 API 密钥
- ✅ 验证和清理输入内容
- ✅ 实施速率限制
- ✅ 监控异常使用

### 3. 错误处理要点

- ✅ 统一错误分类
- ✅ 实施重试机制
- ✅ 提供有意义的错误信息
- ✅ 记录详细错误日志

### 4. 监控要点

- ✅ 跟踪关键指标
- ✅ 记录详细日志
- ✅ 设置告警机制
- ✅ 定期分析性能

## 下一步

- 🛠️ 查看 [集成示例](../tutorials/integration-examples.md)
- 📖 学习 [高级功能](../tutorials/advanced-features.md)
- 🔧 探索 [API 参考](../api/tts-endpoints.md)
