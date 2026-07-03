---
title: "对外邮件 API Rust 调用文档"
sidebar_position: 12
---

# 对外邮件 API Rust 调用文档

本文档说明 Rust 应用如何调用 Synapse 已配置好的对外邮件发信能力。外部应用不需要直接保存 Resend 邮箱账号或 Resend API Key，只需要使用管理员在前端配置的对外邮件 API 鉴权信息。

## 1. 前置配置

管理员需要先在前端完成配置：

```text
frontend/src/components/EnvManager.tsx -> 对外邮件 API 鉴权设置
```

每条配置支持：

| 配置项 | 说明 |
| --- | --- |
| 域名 | 可留空表示默认域名，也可填写指定发信域名 |
| 外部 API Key | 推荐给外部应用使用的鉴权令牌 |
| 兼容校验码 | 旧调用方使用的 `code`，新应用建议改用外部 API Key |

后端需要已经启用对外邮件，并配置可用的对外发信域名和邮件 provider API Key。

## 2. 接口地址

假设服务地址为：

```text
https://tts.chloemlla.com
```

对外邮件 API 前缀为：

```text
https://tts.chloemlla.com/api/outemail
```

## 3. 鉴权方式

推荐使用 Bearer Token：

```http
Authorization: Bearer <OUTEMAIL_API_KEY>
```

也支持以下请求头：

```http
X-Outemail-Api-Key: <OUTEMAIL_API_KEY>
X-API-Key: <OUTEMAIL_API_KEY>
```

旧调用方仍可在请求体中传：

```json
{
  "code": "legacy-code"
}
```

新 Rust 应用不建议继续使用 `code`，避免把校验码散落在请求体日志中。

## 4. Cargo 依赖

```toml
[dependencies]
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## 5. 查询服务状态

接口：

```text
GET /api/outemail/status
```

响应示例：

```json
{
  "success": true,
  "available": true,
  "error": "",
  "domain": "chloemlla.com",
  "authConfigured": true
}
```

Rust 示例：

```rust
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OutEmailStatus {
    success: bool,
    available: bool,
    error: Option<String>,
    domain: Option<String>,
    auth_configured: Option<bool>,
}

async fn get_outemail_status(base_url: &str) -> Result<OutEmailStatus, reqwest::Error> {
    let url = format!("{}/api/outemail/status", base_url.trim_end_matches('/'));
    Client::new()
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json::<OutEmailStatus>()
        .await
}
```

## 6. 发送单封邮件

接口：

```text
POST /api/outemail/send
```

请求体字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `to` | 是 | 收件人邮箱，单封接口建议只传字符串 |
| `subject` | 是 | 邮件标题 |
| `content` | 是 | HTML 内容 |
| `from` | 否 | 发件人前缀，例如 `noreply`，最终由后端组装为 `noreply@domain` |
| `displayName` | 否 | 发件人显示名 |
| `domain` | 否 | 指定发信域名；不传则使用默认对外发信域名 |
| `attachments` | 否 | 附件列表，最多 10 个 |

成功响应：

```json
{
  "success": true,
  "messageId": "email-message-id"
}
```

失败响应：

```json
{
  "error": "鉴权失败"
}
```

Rust 客户端示例：

```rust
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct OutEmailClient {
    base_url: String,
    api_key: String,
    http: Client,
}

impl OutEmailClient {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
            http: Client::new(),
        }
    }

    pub async fn send_email(&self, request: SendEmailRequest<'_>) -> Result<SendEmailResponse, String> {
        let url = format!("{}/api/outemail/send", self.base_url);
        let response = self
            .http
            .post(url)
            .bearer_auth(&self.api_key)
            .json(&request)
            .send()
            .await
            .map_err(|error| format!("请求发送失败: {error}"))?;

        parse_send_response(response.status(), response.text().await).await
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailRequest<'a> {
    pub to: &'a str,
    pub subject: &'a str,
    pub content: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<EmailAttachment<'a>>>,
}

#[derive(Debug, Serialize)]
pub struct EmailAttachment<'a> {
    pub filename: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_id: Option<&'a str>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailResponse {
    pub success: Option<bool>,
    pub message_id: Option<String>,
    pub error: Option<String>,
}

async fn parse_send_response(
    status: StatusCode,
    body_result: Result<String, reqwest::Error>,
) -> Result<SendEmailResponse, String> {
    let body = body_result.map_err(|error| format!("读取响应失败: {error}"))?;
    let parsed: SendEmailResponse =
        serde_json::from_str(&body).map_err(|error| format!("响应 JSON 解析失败: {error}; body={body}"))?;

    if status.is_success() && parsed.success == Some(true) {
        Ok(parsed)
    } else {
        Err(parsed.error.unwrap_or_else(|| format!("邮件发送失败，HTTP 状态码: {status}")))
    }
}
```

调用示例：

```rust
#[tokio::main]
async fn main() -> Result<(), String> {
    let client = OutEmailClient::new(
        "https://tts.chloemlla.com",
        std::env::var("OUTEMAIL_API_KEY").map_err(|_| "缺少 OUTEMAIL_API_KEY 环境变量")?,
    );

    let response = client
        .send_email(SendEmailRequest {
            to: "user@example.com",
            subject: "测试邮件",
            content: "<h1>你好</h1><p>这是一封来自 Rust 应用的测试邮件。</p>",
            from: Some("noreply"),
            display_name: Some("Synapse"),
            domain: None,
            attachments: None,
        })
        .await?;

    println!("发送成功: {:?}", response.message_id);
    Ok(())
}
```

## 7. 批量发送邮件

接口：

```text
POST /api/outemail/batch-send
```

限制：

- 单次最多 100 条消息。
- 批量接口不支持附件。
- 每条消息都需要 `to`、`subject`、`content`。
- `to` 可以是字符串，也可以是字符串数组。

请求体示例：

```json
{
  "messages": [
    {
      "to": "a@example.com",
      "subject": "第一封",
      "content": "<p>Hello A</p>"
    },
    {
      "to": ["b@example.com", "c@example.com"],
      "subject": "第二封",
      "content": "<p>Hello B and C</p>"
    }
  ],
  "from": "noreply",
  "displayName": "Synapse"
}
```

Rust 示例：

```rust
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchSendRequest<'a> {
    messages: Vec<BatchMessage<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    from: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    domain: Option<&'a str>,
}

#[derive(Debug, Serialize)]
struct BatchMessage<'a> {
    to: Recipients<'a>,
    subject: &'a str,
    content: &'a str,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum Recipients<'a> {
    One(&'a str),
    Many(Vec<&'a str>),
}

#[derive(Debug, Deserialize)]
struct BatchSendResponse {
    success: Option<bool>,
    ids: Option<Vec<String>>,
    error: Option<String>,
}

async fn send_batch(
    base_url: &str,
    api_key: &str,
    request: BatchSendRequest<'_>,
) -> Result<BatchSendResponse, String> {
    let url = format!("{}/api/outemail/batch-send", base_url.trim_end_matches('/'));
    let response = Client::new()
        .post(url)
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|error| format!("请求发送失败: {error}"))?;

    let status: StatusCode = response.status();
    let body = response.text().await.map_err(|error| format!("读取响应失败: {error}"))?;
    let parsed: BatchSendResponse =
        serde_json::from_str(&body).map_err(|error| format!("响应 JSON 解析失败: {error}; body={body}"))?;

    if status.is_success() && parsed.success == Some(true) {
        Ok(parsed)
    } else {
        Err(parsed.error.unwrap_or_else(|| format!("批量发送失败，HTTP 状态码: {status}")))
    }
}
```

## 8. 查询配额和默认域名

查询每日配额：

```text
GET /api/outemail/quota
```

响应：

```json
{
  "success": true,
  "used": 12,
  "total": 100,
  "resetAt": "2026-07-04T16:00:00.000Z"
}
```

查询默认对外发信域名：

```text
GET /api/outemail/domain
```

响应：

```json
{
  "success": true,
  "domain": "chloemlla.com"
}
```

## 9. 常见错误

| 错误 | 含义 | 处理建议 |
| --- | --- | --- |
| `缺少鉴权信息` | 没有传 Bearer Token、API Key 请求头或旧 `code` | 检查请求头 |
| `鉴权失败` | API Key 或 `code` 不匹配 | 到 EnvManager 核对配置 |
| `对外邮件鉴权未配置` | 后端没有可用的外部 API Key 或兼容校验码 | 管理员需要先配置鉴权 |
| `对外邮件服务未启用` | 对外邮件功能未启用 | 管理员需要启用对外邮件 |
| `未配置有效的对外邮件 API Key（re_ 开头）` | 邮件 provider API Key 不可用 | 管理员需要检查邮件系统配置 |
| `当前一分钟可发送剩余额度不足` | 命中分钟级限额 | 降低发送频率并重试 |
| `今日可发送剩余额度不足` | 命中每日配额 | 等待次日重置或调整配额 |

## 10. 安全建议

- Rust 应用应从环境变量或密钥管理系统读取 `OUTEMAIL_API_KEY`，不要写进源码。
- 生产环境只使用 HTTPS。
- 不要把完整请求头、请求体或 API Key 写入业务日志。
- 多个外部应用建议使用不同域名配置或不同 API Key，便于后续轮换。
- 轮换 API Key 时，可以先在 EnvManager 保存新 Key，再更新调用方配置。
