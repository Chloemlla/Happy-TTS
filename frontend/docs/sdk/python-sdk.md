---
title: Python SDK 使用说明
sidebar_position: 2
slug: python-sdk
---

# Python SDK 使用说明

## 简介

本 SDK 提供了通过 Python 语言调用 Synapse 文本转语音（TTS）服务的能力，适用于需要在 Python 项目中集成 TTS 功能的场景。

## 安装

建议通过 HTTP API 方式调用，无需单独安装 SDK，只需安装 requests 库：

```bash
pip install requests
```

## 主要接口

### `tts_generate_speech`

通过 HTTP POST 请求调用 TTS 服务接口。

#### 参数说明

| 参数          | 类型  | 说明               |
| ------------- | ----- | ------------------ |
| text          | str   | 要合成的文本       |
| model         | str   | 语音模型           |
| voice         | str   | 发音人             |
| output_format | str   | 输出格式（mp3 等） |
| speed         | float | 语速               |
| userId        | str   | 用户 ID（可选）    |
| isAdmin       | bool  | 是否管理员（可选） |

#### 返回值

- `fileName`：音频文件名
- `audioUrl`：音频文件访问地址
- `isDuplicate`：是否为重复内容

#### 异常

- 文本内容为空会抛出异常
- 用户违规会抛出异常（如 24 小时内重复提交相同内容）

## 典型用法

```python
import requests

API_URL = "http://your-api-server/tts/generate"

payload = {
    "text": "你好，世界！",
    "model": "tts-1",
    "voice": "alloy",
    "output_format": "mp3",
    "speed": 1.0,
    "userId": "user123"
}

response = requests.post(API_URL, json=payload)
result = response.json()
print(result["audioUrl"])
```

## 注意事项

- 请根据实际部署地址修改 API_URL
- 需保证网络可访问 API 服务
- 用户重复提交相同内容会被临时封禁 24 小时

---

如需更高级的 Python 封装，可参考 requests 的用法自行封装类或函数。
