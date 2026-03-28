---
title: Rust SDK 使用说明
sidebar_position: 7
---

# Rust SDK 使用说明

## 简介

本 SDK 文档介绍如何在 Rust 项目中通过 HTTP API 调用 Synapse 文本转语音（TTS）服务，适用于需要在 Rust 后端或工具中集成 TTS 功能的场景。

## 依赖

建议使用 reqwest 和 serde_json 进行 HTTP 请求和 JSON 处理。

```toml
# Cargo.toml
[dependencies]
reqwest = { version = "0.11", features = ["json"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
```

## 主要接口

通过 HTTP POST 请求调用 TTS 服务接口。

### 请求参数

| 参数          | 类型   | 说明               |
| ------------- | ------ | ------------------ |
| text          | String | 要合成的文本       |
| model         | String | 语音模型           |
| voice         | String | 发音人             |
| output_format | String | 输出格式（mp3 等） |
| speed         | f64    | 语速               |
| userId        | String | 用户 ID（可选）    |
| isAdmin       | bool   | 是否管理员（可选） |

### 返回值

- fileName：音频文件名
- audioUrl：音频文件访问地址
- isDuplicate：是否为重复内容

## 典型用法

```rust
use reqwest::Client;
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new();
    let payload = json!({
        "text": "你好，世界！",
        "model": "tts-1",
        "voice": "alloy",
        "output_format": "mp3",
        "speed": 1.0,
        "userId": "user123"
    });
    let res = client.post("http://your-api-server/tts/generate")
        .json(&payload)
        .send()
        .await?;
    let body = res.text().await?;
    println!("{}", body);
    Ok(())
}
```

## 注意事项

- 请根据实际部署地址修改 API URL
- 用户重复提交相同内容会被临时封禁 24 小时
- 需保证请求参数完整且合法
