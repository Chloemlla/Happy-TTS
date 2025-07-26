---
sidebar_position: 2
---

# TTS 接口文档

Synapse 提供完整的文本转语音 API 接口，支持多种语音模型和发音人选择。

## 生成语音

将文本转换为语音文件。

### 请求信息

- **接口地址**: `POST /api/tts/generate`
- **认证方式**: Bearer Token
- **内容类型**: `application/json`

### 请求参数

| 参数             | 类型   | 必需 | 描述             | 默认值  | 示例           |
| ---------------- | ------ | ---- | ---------------- | ------- | -------------- |
| `text`           | string | ✅   | 要转换的文本内容 | -       | "你好，世界！" |
| `model`          | string | ❌   | 语音模型         | "tts-1" | "tts-1-hd"     |
| `voice`          | string | ❌   | 发音人           | "alloy" | "echo"         |
| `output_format`  | string | ❌   | 输出格式         | "mp3"   | "opus"         |
| `speed`          | number | ❌   | 语速 (0.25-4.0)  | 1.0     | 1.2            |
| `generationCode` | string | ✅   | 生成码           | -       | "wmy"          |

### 语音模型

| 模型       | 描述         | 适用场景             |
| ---------- | ------------ | -------------------- |
| `tts-1`    | 标准语音模型 | 一般用途，响应速度快 |
| `tts-1-hd` | 高清语音模型 | 高质量需求，音质更好 |

### 发音人

| 发音人    | 语言   | 特点               | 适用场景 |
| --------- | ------ | ------------------ | -------- |
| `alloy`   | 多语言 | 中性声音，清晰自然 | 通用场景 |
| `echo`    | 英语   | 清晰明亮，富有活力 | 新闻播报 |
| `fable`   | 英语   | 温暖友好，亲切自然 | 故事讲述 |
| `onyx`    | 英语   | 深沉有力，权威感强 | 正式场合 |
| `nova`    | 英语   | 年轻活力，充满朝气 | 年轻群体 |
| `shimmer` | 英语   | 柔和优雅，温柔细腻 | 情感表达 |

### 输出格式

| 格式   | 描述      | 文件大小 | 音质 |
| ------ | --------- | -------- | ---- |
| `mp3`  | MP3 格式  | 较小     | 良好 |
| `opus` | Opus 格式 | 最小     | 优秀 |
| `aac`  | AAC 格式  | 小       | 很好 |
| `flac` | FLAC 格式 | 大       | 最佳 |

### 请求示例

```bash
curl -X POST https://api.hapxs.com/api/tts/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "欢迎使用 Synapse 文本转语音服务！",
    "model": "tts-1",
    "voice": "alloy",
    "output_format": "mp3",
    "speed": 1.0,
    "generationCode": "wmy"
  }'
```

### 响应示例

```json
{
  "audioUrl": "https://api.hapxs.com/static/audio/abc123def456.mp3",
  "fileName": "abc123def456.mp3",
  "signature": "signed_content_hash_for_verification"
}
```

### 响应字段说明

| 字段        | 类型   | 描述                         |
| ----------- | ------ | ---------------------------- |
| `audioUrl`  | string | 音频文件的完整下载地址       |
| `fileName`  | string | 音频文件名                   |
| `signature` | string | 内容签名，用于验证文件完整性 |

## 获取历史记录

获取用户最近的语音生成记录。

### 请求信息

- **接口地址**: `GET /api/tts/history`
- **认证方式**: Bearer Token
- **内容类型**: `application/json`

### 查询参数

| 参数          | 类型   | 必需 | 描述         | 默认值    |
| ------------- | ------ | ---- | ------------ | --------- |
| `fingerprint` | string | ❌   | 设备指纹     | "unknown" |
| `limit`       | number | ❌   | 返回记录数量 | 10        |

### 请求示例

```bash
curl -X GET https://api.hapxs.com/api/tts/history \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 响应示例

```json
{
  "records": [
    {
      "text": "欢迎使用 Synapse 文本转语音服务！",
      "fileName": "abc123def456.mp3",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "model": "tts-1",
      "voice": "alloy",
      "output_format": "mp3",
      "speed": 1.0
    },
    {
      "text": "这是第二条测试记录",
      "fileName": "def456ghi789.mp3",
      "timestamp": "2024-01-01T11:30:00.000Z",
      "model": "tts-1-hd",
      "voice": "echo",
      "output_format": "opus",
      "speed": 1.2
    }
  ]
}
```

### 响应字段说明

| 字段                      | 类型   | 描述                |
| ------------------------- | ------ | ------------------- |
| `records`                 | array  | 生成记录数组        |
| `records[].text`          | string | 原始文本内容        |
| `records[].fileName`      | string | 音频文件名          |
| `records[].timestamp`     | string | 生成时间 (ISO 8601) |
| `records[].model`         | string | 使用的语音模型      |
| `records[].voice`         | string | 使用的发音人        |
| `records[].output_format` | string | 输出格式            |
| `records[].speed`         | number | 语速设置            |

## 使用限制

### 请求频率限制

- **TTS 生成**: 每分钟最多 10 次请求
- **历史记录**: 每分钟最多 20 次请求
- **本地 IP**: 不受频率限制

### 内容限制

- **文本长度**: 单次请求最大 4096 个字符
- **违禁内容**: 系统会自动检测并拒绝包含违禁内容的请求
- **重复内容**: 未登录用户不能重复生成相同内容

### 用户限制

- **未登录用户**: 每次会话只能生成一次
- **登录用户**: 每日有使用次数限制
- **管理员**: 无使用限制

## 错误处理

### 常见错误码

| 状态码 | 错误信息                                         | 原因                    | 解决方案           |
| ------ | ------------------------------------------------ | ----------------------- | ------------------ |
| 400    | 文本内容不能为空                                 | text 参数为空或未提供   | 提供有效的文本内容 |
| 400    | 文本长度不能超过 4096 个字符                     | 文本过长                | 缩短文本内容       |
| 400    | 文本包含违禁内容，请修改后重试                   | 内容违规                | 修改文本内容       |
| 400    | 您已经生成过相同的内容，请登录以获取更多使用次数 | 重复内容                | 登录账户或修改文本 |
| 401    | 认证失败                                         | 令牌无效或过期          | 重新登录获取新令牌 |
| 403    | 生成码无效                                       | generationCode 参数错误 | 检查生成码是否正确 |
| 429    | 请求过于频繁，请稍后再试                         | 超过频率限制            | 降低请求频率       |
| 429    | 您今日的使用次数已达上限                         | 超过使用限制            | 等待次日或升级账户 |
| 500    | 生成语音失败                                     | 服务器内部错误          | 稍后重试或联系支持 |

### 错误响应格式

```json
{
  "error": "错误描述信息"
}
```

## 最佳实践

### 1. 文本预处理

```javascript
// 文本预处理函数
function preprocessText(text) {
  // 移除多余空格
  text = text.trim().replace(/\s+/g, " ");

  // 检查长度
  if (text.length > 4096) {
    throw new Error("文本长度不能超过4096个字符");
  }

  // 检查是否为空
  if (!text) {
    throw new Error("文本内容不能为空");
  }

  return text;
}
```

### 2. 批量处理

```javascript
// 批量生成语音
async function batchGenerateSpeech(texts, options = {}) {
  const results = [];

  for (const text of texts) {
    try {
      // 添加延迟避免频率限制
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await generateSpeech(text, options);
      results.push({ success: true, data: result });
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  return results;
}
```

### 3. 错误重试

```javascript
// 带重试的请求函数
async function generateSpeechWithRetry(text, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await generateSpeech(text, options);
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        // 频率限制，等待后重试
        await new Promise((resolve) => setTimeout(resolve, 60000));
        continue;
      }
      throw error;
    }
  }
}
```

### 4. 音频文件处理

```javascript
// 下载音频文件
async function downloadAudio(audioUrl, filename) {
  const response = await fetch(audioUrl);
  const blob = await response.blob();

  // 创建下载链接
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
```

## 性能优化

### 1. 选择合适的模型

- **快速响应**: 使用 `tts-1` 模型
- **高质量**: 使用 `tts-1-hd` 模型
- **小文件**: 使用 `opus` 格式
- **兼容性**: 使用 `mp3` 格式

### 2. 缓存策略

```javascript
// 简单的缓存机制
const audioCache = new Map();

async function generateSpeechWithCache(text, options = {}) {
  const cacheKey = `${text}_${JSON.stringify(options)}`;

  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey);
  }

  const result = await generateSpeech(text, options);
  audioCache.set(cacheKey, result);

  return result;
}
```

---

**下一步** → [语音管理接口](./voice-management.md)
