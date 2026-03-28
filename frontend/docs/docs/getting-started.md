---
id: getting-started
title: 快速开始
sidebar_position: 2
---

# 快速开始

本指南将帮助您快速上手 Synapse API，包括注册账户、获取认证令牌和发送第一个请求。

## 用户注册

- **接口地址**：`POST /auth/register`
- **描述**：注册新用户，获取访问令牌。
- **请求参数**（JSON）：

  | 字段     | 类型   | 必填 | 说明   |
  | -------- | ------ | ---- | ------ |
  | username | string | 是   | 用户名 |
  | password | string | 是   | 密码   |

- **请求示例**：

  ```bash
  curl -X POST https://api.hapxs.com/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username": "your_username", "password": "your_password"}'
  ```

- **响应示例**：

  ```json
  {
    "success": true,
    "message": "注册成功"
  }
  ```

- **错误码**：
  - 429：注册频率过高
  - 400：参数错误

---

## 用户登录

- **接口地址**：`POST /auth/login`
- **描述**：用户登录，获取 JWT 令牌。
- **请求参数**（JSON）：

  | 字段     | 类型   | 必填 | 说明   |
  | -------- | ------ | ---- | ------ |
  | username | string | 是   | 用户名 |
  | password | string | 是   | 密码   |

- **请求示例**：

  ```bash
  curl -X POST https://api.hapxs.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "your_username", "password": "your_password"}'
  ```

- **响应示例**：

  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_id",
      "username": "your_username"
    }
  }
  ```

- **错误码**：
  - 401：用户名或密码错误
  - 429：登录频率过高

---

## 获取当前用户信息

- **接口地址**：`GET /auth/me`
- **描述**：获取当前登录用户信息。
- **请求头**：

  - `Authorization: Bearer <token>`

- **响应示例**：

  ```json
  {
    "id": "user_id",
    "username": "your_username",
    "createdAt": "2024-01-01T12:00:00Z"
  }
  ```

---

## 生成语音

- **接口地址**：`POST /tts/generate`
- **描述**：提交文本生成语音，需携带认证令牌。
- **请求头**：

  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`

- **请求参数**（JSON）：

  | 字段           | 类型   | 必填 | 说明                                             | 默认值 |
  | -------------- | ------ | ---- | ------------------------------------------------ | ------ |
  | text           | string | 是   | 要转换的文本内容                                 | -      |
  | model          | string | 否   | 语音模型 (tts-1, tts-1-hd)                       | tts-1  |
  | voice          | string | 否   | 发音人 (alloy, echo, fable, onyx, nova, shimmer) | alloy  |
  | outputFormat   | string | 否   | 输出格式 (mp3, opus, aac, flac)                  | mp3    |
  | speed          | number | 否   | 语速 (0.25-4.0)                                  | 1.0    |
  | customFileName | string | 否   | 自定义文件名                                     | -      |

- **请求示例**：

  ```bash
  curl -X POST https://api.hapxs.com/api/tts/generate \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "text": "你好，欢迎使用 Synapse！",
      "model": "tts-1",
      "voice": "alloy",
      "outputFormat": "mp3",
      "speed": 1.0
    }'
  ```

- **响应示例**：

  ```json
  {
    "success": true,
    "filePath": "/static/audio/abc123.mp3"
  }
  ```

- **错误码**：
  - 400：缺少必要参数
  - 401：未认证或令牌无效
  - 429：请求频率超限
  - 500：服务器内部错误

---

## 获取语音生成历史

- **接口地址**：`GET /tts/history`
- **描述**：获取当前用户最近生成的语音记录。
- **请求头**：

  - `Authorization: Bearer <token>`

- **响应示例**：

  ```json
  {
    "records": [
      {
        "text": "你好，欢迎使用 Synapse！",
        "fileName": "abc123.mp3",
        "timestamp": "2024-01-01T12:00:00Z"
      }
    ]
  }
  ```

---

## 错误码说明

| 状态码 | 说明            |
| ------ | --------------- |
| 200    | 请求成功        |
| 400    | 请求参数错误    |
| 401    | 认证失败/未登录 |
| 403    | 权限不足        |
| 429    | 请求频率超限    |
| 500    | 服务器内部错误  |

---

## 常见问题

- **Q: 如何获取 API Token？**
  A: 通过注册并登录，获取返回的 token 字段。

- **Q: 支持哪些语音模型和发音人？**
  A: 详见[API 文档](/docs/intro)首页表格。

- **Q: 如何自定义输出文件名？**
  A: 在生成语音时传递 customFileName 字段。

---

如需更多帮助，请联系 support@hapxs.com 或访问 [GitHub Issues](https://github.com/hapxscom/Synapse/issues)。
