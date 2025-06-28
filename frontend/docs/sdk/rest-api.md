---
title: REST API 文档
sidebar_position: 3
slug: rest-api
---

# REST API 文档

## 简介

Synapse 提供了标准的 RESTful API 接口，支持通过 HTTP 请求进行文本转语音（TTS）操作，适用于各种语言和平台的集成。

## 主要接口

### POST /tts/generate

#### 请求参数（JSON）

| 参数          | 类型     | 说明               |
| ------------- | -------- | ------------------ |
| text          | string   | 要合成的文本       |
| model         | string   | 语音模型           |
| voice         | string   | 发音人             |
| output_format | string   | 输出格式（mp3 等） |
| speed         | number   | 语速               |
| userId        | string?  | 用户 ID（可选）    |
| isAdmin       | boolean? | 是否管理员（可选） |

#### 响应参数（JSON）

| 字段        | 类型    | 说明             |
| ----------- | ------- | ---------------- |
| fileName    | string  | 音频文件名       |
| audioUrl    | string  | 音频文件访问地址 |
| isDuplicate | boolean | 是否为重复内容   |

#### 请求示例

```bash
curl -X POST http://your-api-server/tts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，世界！",
    "model": "tts-1",
    "voice": "alloy",
    "output_format": "mp3",
    "speed": 1.0,
    "userId": "user123"
  }'
```

#### 响应示例

```json
{
  "fileName": "xxxxxx.mp3",
  "audioUrl": "http://your-api-server/static/audio/xxxxxx.mp3",
  "isDuplicate": false
}
```

## 注意事项

- 请根据实际部署地址修改 API URL
- 用户重复提交相同内容会被临时封禁 24 小时
- 需保证请求参数完整且合法

---

如需更多接口说明，请参考主项目 API 文档。
