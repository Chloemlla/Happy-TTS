---
title: Go SDK 使用说明
sidebar_position: 5
---

# Go SDK 使用说明

## 简介

本 SDK 文档介绍如何在 Go 项目中通过 HTTP API 调用 Synapse 文本转语音（TTS）服务，适用于需要在 Go 后端或工具中集成 TTS 功能的场景。

## 依赖

建议使用标准库 net/http 和 encoding/json。

## 主要接口

通过 HTTP POST 请求调用 TTS 服务接口。

### 请求参数

| 参数          | 类型   | 说明               |
| ------------- | ------ | ------------------ |
| text          | string | 要合成的文本       |
| model         | string | 语音模型           |
| voice         | string | 发音人             |
| output_format | string | 输出格式（mp3 等） |
| speed         | float  | 语速               |
| userId        | string | 用户 ID（可选）    |
| isAdmin       | bool   | 是否管理员（可选） |

### 返回值

- fileName：音频文件名
- audioUrl：音频文件访问地址
- isDuplicate：是否为重复内容

## 典型用法

```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "io/ioutil"
    "net/http"
)

func main() {
    url := "http://your-api-server/tts/generate"
    payload := map[string]interface{}{
        "text": "你好，世界！",
        "model": "tts-1",
        "voice": "alloy",
        "output_format": "mp3",
        "speed": 1.0,
        "userId": "user123",
    }
    b, _ := json.Marshal(payload)
    resp, err := http.Post(url, "application/json", bytes.NewBuffer(b))
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()
    body, _ := ioutil.ReadAll(resp.Body)
    fmt.Println(string(body))
}
```

## 注意事项

- 请根据实际部署地址修改 API URL
- 用户重复提交相同内容会被临时封禁 24 小时
- 需保证请求参数完整且合法
