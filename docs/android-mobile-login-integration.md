# Android Mobile Login Integration

本文档用于安卓客户端对接 Synapse 登录系统的扫码登录和客户端登录令牌能力。后端接口均挂载在同一站点 API 下，示例路径以 `/api/auth/mobile-login` 开头。
API 地址：https://tts.chloemlla.com
## 登录能力

安卓端需要支持两类登录凭证：

- 标准 JWT：由现有 `/api/auth/login`、TOTP/Passkey 二次验证或客户端令牌兑换接口返回，放入 `Authorization: Bearer <token>`。
- 客户端登录令牌：`sml_` 前缀的长期设备令牌，仅用于安卓端静默换取标准 JWT 或确认网页扫码登录。服务端落盘时只保存哈希。

网页扫码登录由 Web 端创建短期挑战，安卓端扫描二维码并确认，Web 端轮询拿到标准 JWT 后进入登录态。

## 二维码 Payload

Web 登录页调用创建挑战接口后，二维码内容是一个 deep link：

```text
synapse://mobile-login?sessionId=<sessionId>&scanToken=<scanToken>&apiBaseUrl=<apiBaseUrl>&expiresAt=<ISO8601>
```

字段含义：

- `sessionId`：扫码登录会话 ID。
- `scanToken`：安卓端确认扫码会话时必须提交的一次性证明。
- `apiBaseUrl`：当前 Web 所在后端 API Origin，例如 `https://tts.chloemlla.com`。
- `expiresAt`：二维码过期时间。当前有效期为 3 分钟。

安卓端扫描后应校验 scheme 为 `synapse://mobile-login`，再展示账号、设备和目标站点确认页。

## 接口

### Web 创建扫码挑战

`POST /api/auth/mobile-login/challenge`

响应：

```json
{
  "success": true,
  "sessionId": "string",
  "pollToken": "string",
  "qrPayload": "synapse://mobile-login?...",
  "expiresAt": "2026-07-04T12:00:00.000Z",
  "pollIntervalMs": 2000
}
```

`pollToken` 只给 Web 端保存，不能进入二维码。

### 安卓标记已扫码

`POST /api/auth/mobile-login/challenge/scan`

请求：

```json
{
  "sessionId": "string",
  "scanToken": "string"
}
```

响应中的 `status` 通常为 `scanned`。

### 安卓确认网页登录

安卓端可用当前 JWT 或客户端登录令牌确认。

方式 A：使用 JWT。

```http
POST /api/auth/mobile-login/challenge/confirm
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "sessionId": "string",
  "scanToken": "string"
}
```

方式 B：使用客户端登录令牌。

```json
{
  "sessionId": "string",
  "scanToken": "string",
  "clientLoginToken": "sml_...",
  "deviceId": "android-device-stable-id"
}
```

成功响应：

```json
{
  "success": true,
  "ok": true,
  "status": "approved",
  "expiresAt": "2026-07-04T12:00:00.000Z"
}
```

### Web 轮询扫码结果

`POST /api/auth/mobile-login/challenge/poll`

```json
{
  "sessionId": "string",
  "pollToken": "string"
}
```

未完成：

```json
{
  "success": true,
  "status": "pending",
  "expiresAt": "2026-07-04T12:00:00.000Z"
}
```

已确认：

```json
{
  "success": true,
  "status": "approved",
  "expiresAt": "2026-07-04T12:00:00.000Z",
  "token": "<jwt>",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "user"
  }
}
```

Web 端拿到 `token` 后按现有登录逻辑写入本地登录态。

### 签发客户端登录令牌

安卓端完成标准登录和二次验证后，用 JWT 签发设备令牌：

```http
POST /api/auth/mobile-login/client-token/issue
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "deviceId": "android-device-stable-id",
  "deviceName": "Pixel 8 Pro"
}
```

响应：

```json
{
  "success": true,
  "clientLoginToken": "sml_...",
  "expiresAt": "2026-10-02T12:00:00.000Z"
}
```

客户端登录令牌当前有效期为 90 天。安卓端应存入 Android Keystore 或加密后的私有存储，不应写入日志。

### 客户端令牌兑换 JWT

`POST /api/auth/mobile-login/client-token/exchange`

```json
{
  "clientLoginToken": "sml_...",
  "deviceId": "android-device-stable-id"
}
```

响应：

```json
{
  "success": true,
  "token": "<jwt>",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "user"
  }
}
```

安卓端启动时可先兑换客户端令牌，成功后使用返回的标准 JWT 调用业务 API。

### 撤销客户端登录令牌

```http
POST /api/auth/mobile-login/client-token/revoke
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "clientLoginToken": "sml_..."
}
```

响应：

```json
{
  "success": true,
  "revoked": true
}
```

## 推荐安卓流程

首次登录：

1. 调用现有 `/api/auth/login`。
2. 如果返回 `requires2FA`，继续调用现有 TOTP 或 Passkey 验证接口。
3. 获得标准 JWT 后调用 `/client-token/issue`。
4. 安全保存 `clientLoginToken`。

自动登录：

1. 读取本地 `clientLoginToken`。
2. 调用 `/client-token/exchange` 换取标准 JWT。
3. 使用标准 JWT 调用业务 API。
4. 如果返回 401，清理本地客户端令牌并要求用户重新登录。

扫码登录网页：

1. 扫描 Web 登录页二维码并解析 deep link。
2. 调用 `/challenge/scan` 标记已扫码。
3. 展示确认页，确认目标站点 `apiBaseUrl`、当前账号和设备。
4. 调用 `/challenge/confirm`，优先使用当前 JWT；JWT 不存在或过期时可使用 `clientLoginToken`。

## 错误与状态

常见 `status`：

- `pending`：二维码已生成，等待扫码。
- `scanned`：安卓端已扫码，等待确认。
- `approved`：安卓端已确认。
- `expired`：二维码过期。
- `consumed`：Web 端已消费登录结果。

常见 HTTP 错误：

- `400`：缺少参数、格式错误。
- `401`：JWT 或客户端登录令牌无效/过期。
- `403`：账号封停或设备不匹配。
- `429`：请求过于频繁。

## 安全要求

- `pollToken` 不进入二维码，只由 Web 端保存和轮询使用。
- `scanToken` 只随二维码传给安卓端，用于证明安卓端扫描的是当前二维码。
- 客户端登录令牌不要展示完整值，不要写日志，不要放入 URL。
- 建议安卓端保存稳定 `deviceId`，换机或清除 App 数据后重新签发客户端令牌。
- 扫码确认页必须显示目标站点和当前登录账号，降低误扫风险。
