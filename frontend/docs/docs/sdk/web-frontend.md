---
title: Web 前端调用示例
sidebar_position: 6
---

# Web 前端调用示例

## 简介

本示例介绍如何在 Web 前端（如 React/Vue/原生 JS）中通过 HTTP API 调用 Synapse 文本转语音（TTS）服务。

## 主要接口

通过 HTTP POST 请求调用 TTS 服务接口。

### 请求参数

| 参数          | 类型    | 说明               |
| ------------- | ------- | ------------------ |
| text          | string  | 要合成的文本       |
| model         | string  | 语音模型           |
| voice         | string  | 发音人             |
| output_format | string  | 输出格式（mp3 等） |
| speed         | number  | 语速               |
| userId        | string  | 用户 ID（可选）    |
| isAdmin       | boolean | 是否管理员（可选） |

## 用法示例

### fetch 示例

```js
fetch("http://your-api-server/tts/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    text: "你好，世界！",
    model: "tts-1",
    voice: "alloy",
    output_format: "mp3",
    speed: 1.0,
    userId: "user123",
  }),
})
  .then((res) => res.json())
  .then((data) => {
    console.log(data.audioUrl);
    // 可直接设置 audio 标签 src 播放
    // document.getElementById('audio').src = data.audioUrl;
  });
```

### axios 示例

```js
import axios from "axios";

axios
  .post("http://your-api-server/tts/generate", {
    text: "你好，世界！",
    model: "tts-1",
    voice: "alloy",
    output_format: "mp3",
    speed: 1.0,
    userId: "user123",
  })
  .then((res) => {
    console.log(res.data.audioUrl);
  });
```

## 注意事项

- 请根据实际部署地址修改 API URL
- 跨域（CORS）需后端允许前端域名访问
- 用户重复提交相同内容会被临时封禁 24 小时
- 建议对用户输入做安全校验
