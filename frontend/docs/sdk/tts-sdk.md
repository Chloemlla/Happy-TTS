---
title: TTS SDK 使用说明
sidebar_position: 1
slug: tts-sdk
---

# TTS SDK 使用说明

## 简介

本 SDK 提供了文本转语音（TTS）能力，支持多种音频格式，集成了 OpenAI 语音模型，适用于 Node.js 服务端环境。可用于快速将文本内容合成为高质量语音音频。

## 安装

```bash
npm install openai dotenv
```

> 注意：本 SDK 依赖 openai 官方包和 dotenv 环境变量管理。

## 主要接口

### `generateSpeech(request: TtsRequest): Promise<{ fileName: string, audioUrl: string, isDuplicate: boolean }> `

#### 参数说明

| 参数          | 类型     | 说明               |
| ------------- | -------- | ------------------ |
| text          | string   | 要合成的文本       |
| model         | string   | 语音模型           |
| voice         | string   | 发音人             |
| output_format | string   | 输出格式（mp3 等） |
| speed         | number   | 语速               |
| userId        | string?  | 用户 ID（可选）    |
| isAdmin       | boolean? | 是否管理员（可选） |

#### 返回值

- `fileName`：音频文件名
- `audioUrl`：音频文件访问地址
- `isDuplicate`：是否为重复内容

#### 异常

- 文本内容为空会抛出异常
- 用户违规会抛出异常（如 24 小时内重复提交相同内容）

## 典型用法

```ts
import { TtsService } from "路径/ttsService";

const tts = new TtsService();

const result = await tts.generateSpeech({
  text: "你好，世界！",
  model: "tts-1",
  voice: "alloy",
  output_format: "mp3",
  speed: 1.0,
  userId: "user123",
});

console.log(result.audioUrl);
```

## 支持的音频格式

- mp3
- opus
- aac
- flac
- wav
- pcm

## 注意事项

- 用户重复提交相同内容会被临时封禁 24 小时
- 需配置 OpenAI API Key 和相关环境变量（如 `.env` 文件）
- 生成的音频文件会保存在配置的音频目录下
- 需保证服务器有写入音频文件的权限
