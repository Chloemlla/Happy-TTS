---
title: FLAC 转 MP3 音频转换 API 文档
date: 2025-07-07
slug: flac-to-mp3-api
tags: [api, audio, flac, mp3, convert]
---

# FLAC 转 MP3 音频转换 API 文档

## 概述

FLAC 转 MP3 音频转换 API 提供专业的音频格式转换服务，将 FLAC 格式的音频文件转换为 MP3 格式。该功能通过转发请求到外部服务实现，支持异步处理和多种返回格式。

## 接口信息

- **接口地址**: `GET /api/network/flactomp3`
- **功能描述**: 将 FLAC 格式音频文件转换为 MP3 格式
- **实现方式**: 转发请求到外部音频转换服务

## 请求参数

| 参数名 | 类型   | 必填 | 说明                                                                        |
| ------ | ------ | ---- | --------------------------------------------------------------------------- |
| url    | string | 是   | 需要转换的 FLAC 文件 URL                                                    |
| return | string | 否   | 返回类型，支持：json(返回 JSON 数据) 或 302(重定向到 MP3 文件)，默认为 json |

### 支持的返回类型

- **json**: 返回 JSON 格式的转换结果，包含 MP3 文件 URL 和请求 ID
- **302**: 直接重定向到转换后的 MP3 文件 URL

## 请求示例

### cURL

```bash
# JSON返回
curl -X GET "http://localhost:3000/api/network/flactomp3?url=https://example.com/audio.flac&return=json"

# 302重定向
curl -X GET "http://localhost:3000/api/network/flactomp3?url=https://example.com/audio.flac&return=302"
```

### JavaScript (axios)

```javascript
const axios = require("axios");

// JSON返回
const jsonResponse = await axios.get(
  "http://localhost:3000/api/network/flactomp3",
  {
    params: {
      url: "https://example.com/audio.flac",
      return: "json",
    },
  }
);

// 302重定向
const redirectResponse = await axios.get(
  "http://localhost:3000/api/network/flactomp3",
  {
    params: {
      url: "https://example.com/audio.flac",
      return: "302",
    },
    maxRedirects: 0, // 不自动跟随重定向
  }
);

console.log(jsonResponse.data);
console.log(redirectResponse.headers.location); // 重定向URL
```

### Python

```python
import requests

# JSON返回
json_response = requests.get('http://localhost:3000/api/network/flactomp3', {
    'url': 'https://example.com/audio.flac',
    'return': 'json'
})

# 302重定向
redirect_response = requests.get('http://localhost:3000/api/network/flactomp3', {
    'url': 'https://example.com/audio.flac',
    'return': '302'
}, allow_redirects=False)

print(json_response.json())
print(redirect_response.headers.get('Location'))  # 重定向URL
```

## 响应格式

### JSON 返回格式 (200)

```json
{
  "success": true,
  "message": "FLAC转MP3转换完成",
  "data": {
    "code": 200,
    "msg": "数据请求成功",
    "data": "https://cdn.xxhzm.cn/v2api/cache/tmp/eccff0986cfb04e146db63e6d108b35e88fb1dff.mp3",
    "request_id": "6ed78b93988a3305ab75649f"
  }
}
```

### 302 重定向格式

当 `return=302` 时，API 会直接返回 302 重定向响应，Location 头包含转换后的 MP3 文件 URL。

### 参数错误 (400)

```json
{
  "success": false,
  "error": "URL参数不能为空"
}
```

### 服务器错误 (500)

```json
{
  "success": false,
  "error": "FLAC转MP3转换失败: 服务器内部错误"
}
```

## 响应字段说明

| 字段名          | 类型    | 说明                      |
| --------------- | ------- | ------------------------- |
| success         | boolean | 请求是否成功              |
| message         | string  | 成功时的消息              |
| error           | string  | 错误时的错误信息          |
| data.code       | integer | 响应状态码                |
| data.msg        | string  | 响应消息                  |
| data.data       | string  | 转换后的 MP3 文件 URL     |
| data.request_id | string  | 请求 ID，用于追踪转换任务 |

## 测试用例

### 1. 基本转换测试

- **输入**: `url=https://example.com/audio.flac&return=json`
- **期望输出**: JSON 格式的转换结果，包含 MP3 文件 URL

### 2. 重定向测试

- **输入**: `url=https://example.com/audio.flac&return=302`
- **期望输出**: 302 重定向到 MP3 文件

### 3. 默认返回类型测试

- **输入**: `url=https://example.com/audio.flac`
- **期望输出**: JSON 格式的转换结果（默认 return=json）

## 错误处理

### 常见错误类型

1. **参数错误**

   - URL 参数为空
   - URL 格式不正确
   - return 参数值不在支持范围内

2. **网络错误**

   - 外部转换服务无响应
   - 请求超时（60 秒）
   - 网络连接失败

3. **转换错误**
   - 外部服务返回错误
   - 文件格式不支持
   - 转换失败

### 错误响应示例

```json
{
  "success": false,
  "error": "FLAC转MP3转换失败: 500 - 服务器内部错误"
}
```

## 使用建议

1. **URL 要求**:

   - 确保 FLAC 文件 URL 可公开访问
   - 建议使用 HTTPS 协议
   - 文件大小建议不超过 100MB

2. **返回类型选择**:

   - 使用 `json` 返回类型获取转换结果和请求 ID
   - 使用 `302` 返回类型直接下载转换后的文件

3. **错误处理**:

   - 音频转换可能需要较长时间，建议设置适当的超时时间
   - 处理转换失败的情况，提供用户友好的错误提示

4. **性能优化**:
   - 对于大文件，建议使用异步处理
   - 可以缓存转换结果，避免重复转换

## 注意事项

1. **转换时间**: 音频转换时间取决于文件大小和服务器负载，可能需要几秒到几分钟
2. **文件格式**: 确保输入文件为有效的 FLAC 格式
3. **存储限制**: 转换后的 MP3 文件可能有存储时间限制
4. **带宽消耗**: 大文件转换会消耗较多带宽

## 相关链接

- [FLAC 音频格式说明](https://en.wikipedia.org/wiki/FLAC)
- [MP3 音频格式说明](https://en.wikipedia.org/wiki/MP3)
- [音频转换最佳实践](https://en.wikipedia.org/wiki/Audio_conversion)
