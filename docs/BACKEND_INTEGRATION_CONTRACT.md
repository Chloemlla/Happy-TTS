# NexAI 后端对接实施文档

本文档面向 NexAI 后端实现方，定义客户端当前需要的 API 契约、后端必须补齐的安全能力，以及从旧接口平滑迁移到安全同步方案的建议。

## 1. 目标与范围

后端需要提供以下能力：

- 用户认证：邮箱/用户名登录、OAuth、Passkey、token 刷新与账号资料。
- 云同步：设置、对话、笔记、翻译历史、短链接历史等数据同步。
- 敏感数据保护：API Key、WebDAV 密码、Upstash Token、Vertex Token、保存的密码不得以服务端可读明文长期保存。
- Artifacts 分享：创建、读取、更新、删除、访问统计、密码保护。
- 安全风控：设备状态上报、风险状态查询、异常检测、设备追踪。
- 发布完整性：为客户端提供 APK SHA256 校验数据，或保证 GitHub Release notes 中包含客户端可解析的哈希。

## 2. 全局约定

### 2.1 基础 URL

当前客户端默认请求：

```text
https://tts.chloemlla.com/api/nexai
```

生产环境必须统一使用一个后端域名。客户端证书固定逻辑也必须固定这个域名对应的证书链。

当前代码里证书固定 host 仍是 `api.951100.xyz`，这会导致固定证书和真实 API host 不一致。后端上线前必须与客户端同步确认最终域名。

### 2.2 请求格式

除特殊说明外：

- `Content-Type: application/json`
- 请求体使用 UTF-8 JSON。
- 时间字段使用 ISO 8601 UTC 字符串，例如 `2026-05-29T14:30:00.000Z`。
- 分页参数统一为 `page`、`limit`，页码从 1 开始。
- 鉴权使用 `Authorization: Bearer <accessToken>`。

### 2.3 响应包络

建议所有 JSON API 使用统一响应：

```json
{
  "success": true,
  "data": {},
  "message": "ok"
}
```

错误响应：

```json
{
  "success": false,
  "error": "invalid_request",
  "message": "Readable error message",
  "requestId": "req_..."
}
```

客户端现状兼容：

- Auth 响应支持 `data.user` / `user` / `data` 多种位置。
- Sync 响应要求 `success: true` 且 `data` 为对象。
- Artifacts 响应要求 `data` 为模型对象。

### 2.4 日志脱敏

后端日志、错误追踪、审计日志不得记录以下明文：

- `Authorization`
- `refreshToken`
- `password`
- `newPassword`
- `apiKey`
- `vertexApiKey`
- `webdavPassword`
- `upstashToken`
- `savedPasswords[*].password`
- `X-Password`
- URL 查询参数里的 `key`

推荐将值替换为：

```text
<redacted:sha256-prefix-12>
```

## 3. 安全请求头与请求签名

客户端可能携带以下安全头：

```text
X-Device-Fingerprint
X-Device-Risk-Score
X-Device-Risk-Level
X-Device-Compromised
X-Device-Root
X-Device-Debugger
X-Device-Emulator
X-Device-VPN
X-Device-Signature-Valid
X-Device-Hash-Valid
X-App-Version
X-App-Build
X-NexAI-Ts
X-NexAI-Sig
X-NexAI-Device
```

后端处理要求：

- 不信任这些头作为唯一安全依据，只作为风控信号。
- `X-NexAI-Ts` 允许时钟偏移建议不超过 120 秒。
- 对同一设备、同一 timestamp、同一 path 的签名请求做短期 replay 缓存，TTL 5 分钟。
- 如果签名校验暂时无法完成，不应阻断核心登录和同步，但必须记录风控事件。

当前客户端签名算法使用本地设备信息派生 key。服务端无法仅凭请求还原这个 key，因此不要把现有 `X-NexAI-Sig` 当作强认证。建议后续升级为服务端下发 per-device secret：

1. 客户端登录后调用 `POST /security/track`。
2. 服务端为用户设备生成 `deviceSecret`，只返回一次。
3. 客户端存入 secure storage。
4. 后续 `X-NexAI-Sig` 使用 `deviceSecret` 派生。
5. 服务端按 `user_id + device_fingerprint` 查 secret 校验。

## 4. 认证接口

### 4.1 注册

```http
POST /auth/register
```

请求：

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "plain password from TLS request",
  "displayName": "Alice"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_...",
      "username": "alice",
      "email": "alice@example.com",
      "displayName": "Alice",
      "avatarUrl": null,
      "authProvider": "local",
      "emailVerified": false,
      "role": "user",
      "googleId": null,
      "googleEmail": null,
      "githubId": null,
      "githubUsername": null,
      "lastLoginAt": "2026-05-29T14:30:00.000Z",
      "loginCount": 1
    },
    "accessToken": "jwt-access",
    "refreshToken": "jwt-refresh"
  }
}
```

要求：

- 密码使用 Argon2id 或 bcrypt 存储，禁止明文或可逆加密。
- access token 建议 15-30 分钟过期。
- refresh token 建议旋转，服务端保存哈希。

### 4.2 登录

```http
POST /auth/login
```

请求：

```json
{
  "identifier": "alice@example.com",
  "password": "plain password from TLS request"
}
```

响应同注册。

### 4.3 当前用户

```http
GET /auth/me
Authorization: Bearer <accessToken>
```

响应：

```json
{
  "success": true,
  "data": {
    "user": {}
  }
}
```

### 4.4 刷新 Token

```http
POST /auth/refresh
```

请求：

```json
{
  "refreshToken": "jwt-refresh"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "accessToken": "new-access",
    "refreshToken": "new-refresh"
  }
}
```

要求：

- refresh token 每次使用后旋转。
- 旧 refresh token 立即失效。
- 检测复用旧 refresh token 时撤销该用户所有 refresh token。

### 4.5 登出

```http
POST /auth/logout
Authorization: Bearer <accessToken>
```

请求：

```json
{}
```

响应：

```json
{
  "success": true,
  "message": "logged out"
}
```

### 4.6 更新资料

```http
PUT /auth/profile
Authorization: Bearer <accessToken>
```

请求字段均可选：

```json
{
  "displayName": "Alice",
  "username": "alice2",
  "avatarUrl": "https://..."
}
```

### 4.7 OAuth 配置

```http
GET /auth/oauth-config
```

响应：

```json
{
  "success": true,
  "data": {
    "google": {
      "enabled": true,
      "clientId": "google-client-id"
    },
    "github": {
      "enabled": false,
      "clientId": ""
    }
  }
}
```

### 4.8 Google 登录与绑定

```http
POST /auth/google
POST /auth/link-google
POST /auth/unlink-google
```

`/auth/google` 请求：

```json
{
  "idToken": "google-id-token"
}
```

`/auth/link-google` 需要 `Authorization`，请求同上。

要求：

- 服务端必须校验 Google ID token 的 issuer、audience、expiry、email_verified。
- 不接受客户端传来的邮箱作为可信身份。

### 4.9 GitHub 登录

```http
POST /auth/github
```

请求：

```json
{
  "code": "oauth-code"
}
```

要求：

- 服务端用 code 换 token。
- 从 GitHub API 获取用户身份。
- 不把 GitHub access token 返回客户端。

### 4.10 忘记密码与重置密码

```http
POST /auth/forgot-password
POST /auth/reset-password
```

`forgot-password` 请求：

```json
{
  "email": "alice@example.com"
}
```

不论邮箱是否存在，响应都应一致：

```json
{
  "success": true,
  "message": "If the account exists, a reset email has been sent"
}
```

`reset-password` 请求：

```json
{
  "token": "reset-token",
  "newPassword": "new-password"
}
```

要求：

- reset token 只保存哈希。
- token 一次性使用。
- token 过期时间建议 15-30 分钟。

## 5. Passkey / WebAuthn

### 5.1 注册选项

```http
POST /auth/passkey/register/options
Authorization: Bearer <accessToken>
```

响应必须直接兼容 passkeys Flutter 插件：

```json
{
  "success": true,
  "data": {
    "challenge": "base64url",
    "rp": {
      "name": "NexAI",
      "id": "tts.chloemlla.com"
    },
    "user": {
      "id": "base64url-user-id",
      "name": "alice@example.com",
      "displayName": "Alice"
    },
    "pubKeyCredParams": [
      { "type": "public-key", "alg": -7 },
      { "type": "public-key", "alg": -257 }
    ],
    "timeout": 60000,
    "attestation": "none",
    "authenticatorSelection": {
      "residentKey": "preferred",
      "userVerification": "preferred"
    },
    "excludeCredentials": []
  }
}
```

服务端保存 challenge，TTL 建议 5 分钟。

### 5.2 注册验证

```http
POST /auth/passkey/register/verify
Authorization: Bearer <accessToken>
```

请求体为客户端 passkey 插件返回的 credential JSON。

响应：

```json
{
  "success": true,
  "message": "passkey registered"
}
```

要求：

- 校验 challenge、origin、rpId。
- 保存 credential id、公钥、signCount、transports。

### 5.3 登录选项

```http
POST /auth/passkey/login/options
```

请求：

```json
{
  "identifier": "alice@example.com"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "challenge": "base64url",
    "timeout": 60000,
    "rpId": "tts.chloemlla.com",
    "allowCredentials": [
      {
        "type": "public-key",
        "id": "base64url-credential-id",
        "transports": ["internal", "hybrid"]
      }
    ],
    "userVerification": "preferred"
  }
}
```

### 5.4 登录验证

```http
POST /auth/passkey/login/verify
```

请求：

```json
{
  "identifier": "alice@example.com",
  "response": {}
}
```

响应同登录接口。

## 6. 云同步接口

### 6.1 当前旧版接口

客户端当前会调用：

```http
GET    /sync
PUT    /sync
PATCH  /sync/:category
DELETE /sync
GET    /sync/meta
GET    /sync/changes?since=<iso>
POST   /sync/incremental
```

所有接口都需要：

```text
Authorization: Bearer <accessToken>
Content-Type: application/json
```

旧版全量上传请求形态：

```json
{
  "settings": {},
  "notes": [],
  "conversations": [],
  "translationHistory": [],
  "savedPasswords": [],
  "shortUrls": []
}
```

旧版后端兼容要求：

- 可以接受旧版数据。
- 必须对旧版明文字段做服务端脱敏或拒绝长期保存。
- 至少删除或置空：
  - `settings.apiKey`
  - `settings.vertexApiKey`
  - `settings.webdavPassword`
  - `settings.upstashToken`
  - `savedPasswords[*].password`
- 若保存旧版敏感字段是业务必需，必须先完成客户端端到端加密后再上线。

当前仓库后端实现要求：

- 旧版 `PUT /sync`、`PATCH /sync/passwords`、`POST /sync/incremental` 写入前会将上述敏感字段清空。
- 旧版 `GET /sync`、`GET /sync/changes`、`POST /sync/incremental` 响应前也会清空历史已存数据里的上述敏感字段。
- 旧版接口只作为迁移兼容层，新的敏感数据同步必须走 `/sync/v2`。

### 6.2 推荐新版同步：端到端加密

新增版本：

```http
PUT  /sync/v2
GET  /sync/v2
POST /sync/v2/incremental
GET  /sync/v2/meta
DELETE /sync/v2
```

后端只存储不可读密文，不解密、不索引用户内容。

当前仓库已实现这些端点，挂载在 `https://tts.chloemlla.com/api/nexai` 下。服务端按 `user_id + category + id` 保存 opaque encrypted records，并维护单调递增 `revision` 供增量同步使用。

#### 6.2.1 加密容器格式

```json
{
  "schemaVersion": 2,
  "clientId": "device-or-install-id",
  "updatedAt": "2026-05-29T14:30:00.000Z",
  "records": [
    {
      "id": "settings",
      "category": "settings",
      "updatedAt": "2026-05-29T14:30:00.000Z",
      "deleted": false,
      "crypto": {
        "alg": "XCHACHA20-POLY1305",
        "kdf": "ARGON2ID",
        "keyId": "user-main-v1",
        "nonce": "base64url",
        "aad": "base64url",
        "ciphertext": "base64url"
      }
    }
  ]
}
```

如果 Dart 环境暂不方便使用 XChaCha20-Poly1305，可使用：

```text
AES-256-GCM
```

但必须确保每条记录 nonce 唯一。

#### 6.2.2 全量上传

```http
PUT /sync/v2
```

请求：

```json
{
  "schemaVersion": 2,
  "deviceId": "dev_...",
  "snapshotId": "snap_...",
  "updatedAt": "2026-05-29T14:30:00.000Z",
  "records": []
}
```

响应：

```json
{
  "success": true,
  "data": {
    "serverTime": "2026-05-29T14:30:01.000Z",
    "revision": 42
  }
}
```

#### 6.2.3 全量下载

```http
GET /sync/v2
```

响应：

```json
{
  "success": true,
  "data": {
    "schemaVersion": 2,
    "serverTime": "2026-05-29T14:30:01.000Z",
    "revision": 42,
    "records": []
  }
}
```

#### 6.2.4 增量同步

```http
POST /sync/v2/incremental
```

请求：

```json
{
  "sinceRevision": 41,
  "lastSyncedAt": "2026-05-29T14:00:00.000Z",
  "deviceId": "dev_...",
  "records": []
}
```

响应：

```json
{
  "success": true,
  "data": {
    "serverTime": "2026-05-29T14:30:01.000Z",
    "revision": 42,
    "records": []
  }
}
```

#### 6.2.5 冲突策略

后端按记录粒度保存：

- 主键：`user_id + category + id`
- 字段：`revision`、`updated_at`、`deleted`、`ciphertext`、`metadata`
- 同一记录并发更新时采用 last-write-wins，但响应中返回冲突列表供客户端提示：

```json
{
  "conflicts": [
    {
      "category": "notes",
      "id": "note_1",
      "serverUpdatedAt": "2026-05-29T14:30:00.000Z",
      "clientUpdatedAt": "2026-05-29T14:29:59.000Z"
    }
  ]
}
```

#### 6.2.6 同步类别

建议类别：

```text
settings
conversations
notes
translationHistory
shortUrls
savedPasswords
```

其中 `savedPasswords` 必须始终端到端加密，后端不得提供明文导出。

## 7. Artifacts 分享接口

客户端当前默认请求 `/artifacts`。

### 7.1 创建

```http
POST /artifacts
Authorization: Bearer <accessToken>
Content-Type: application/json
```

请求：

```json
{
  "title": "Example",
  "content_type": "markdown",
  "content": "base64-utf8-content",
  "language": "markdown",
  "visibility": "public",
  "password": "optional",
  "description": "optional",
  "tags": ["demo"],
  "expires_in_days": 30
}
```

响应：

```json
{
  "success": true,
  "data": {
    "id": "art_...",
    "shortId": "abc123",
    "shareUrl": "https://tts.chloemlla.com/artifacts/abc123",
    "embedUrl": "https://tts.chloemlla.com/artifacts/abc123/embed",
    "createdAt": "2026-05-29T14:30:00.000Z",
    "expiresAt": null
  }
}
```

要求：

- `content` 是 base64 后的 UTF-8 文本。
- 服务端限制单个 artifact 大小，当前默认 5 MB，可通过 `NEXAI_ARTIFACT_MAX_CONTENT_BYTES` 调整。
- `password` 必须使用 Argon2id/bcrypt 哈希保存。
- HTML 内容必须隔离渲染，不得直接注入主站 DOM。

### 7.2 获取

```http
GET /artifacts/:shortId
X-Password: <optional>
```

响应：

```json
{
  "success": true,
  "data": {
    "id": "art_...",
    "shortId": "abc123",
    "title": "Example",
    "contentType": "markdown",
    "language": "markdown",
    "content": "# decoded or stored content",
    "description": null,
    "tags": [],
    "visibility": "public",
    "viewCount": 10,
    "createdAt": "2026-05-29T14:30:00.000Z",
    "expiresAt": null
  }
}
```

密码错误：

```json
{
  "success": false,
  "error": "invalid_password",
  "message": "Invalid password"
}
```

需要密码：

```json
{
  "success": false,
  "error": "password_required",
  "message": "Password required"
}
```

### 7.3 更新

```http
PATCH /artifacts/:shortId
Authorization: Bearer <accessToken>
```

请求字段均可选：

```json
{
  "title": "New title",
  "visibility": "private",
  "password": "new password",
  "description": "desc",
  "tags": ["a", "b"],
  "expires_in_days": 7
}
```

### 7.4 删除

```http
DELETE /artifacts/:shortId
Authorization: Bearer <accessToken>
```

成功返回 `204 No Content`。

### 7.5 列表

```http
GET /artifacts?page=1&limit=20&sort=createdAt&order=desc
Authorization: Bearer <accessToken>
```

响应：

```json
{
  "success": true,
  "data": {
    "artifacts": [
      {
        "id": "art_...",
        "shortId": "abc123",
        "title": "Example",
        "contentType": "markdown",
        "visibility": "public",
        "viewCount": 10,
        "createdAt": "2026-05-29T14:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### 7.6 记录访问

```http
POST /artifacts/:shortId/view
```

请求：

```json
{
  "referer": "",
  "user_agent": "NexAI Flutter App"
}
```

该接口失败不应影响用户打开 artifact。

## 8. 安全风控接口

### 8.1 上报事件

```http
POST /security/report
```

请求：

```json
{
  "event_type": "integrity_fail",
  "details": {
    "signature_valid": false,
    "hash_valid": false
  },
  "timestamp": "2026-05-29T14:30:00.000Z"
}
```

响应：

```json
{
  "status": "recorded",
  "action": "monitor",
  "message": "recorded"
}
```

事件类型：

```text
integrity_fail
root_detected
debugger_detected
emulator_detected
frida_detected
xposed_detected
tamper_detected
```

### 8.2 查询设备状态

```http
GET /security/status
```

响应：

```json
{
  "device_fingerprint": "sha256",
  "status": "normal",
  "risk_level": "SAFE",
  "restrictions": [],
  "message": "ok"
}
```

`status` 枚举：

```text
normal
flagged
blocked
unknown
```

`restrictions` 枚举：

```text
payment_disabled
api_rate_limited
all_operations_blocked
sync_disabled
artifact_share_disabled
```

### 8.3 异常检测

```http
GET /security/anomalies
Authorization: Bearer <accessToken>
```

该接口使用 NexAI 专用 JWT，不使用主站 JWT。

响应：

```json
{
  "device_fingerprint": "sha256",
  "user_id": "usr_...",
  "anomalies": {
    "multi_account": false,
    "frequent_device_switch": false
  },
  "details": {
    "account_count": 1,
    "device_count": 1
  }
}
```

### 8.4 设备追踪

```http
POST /security/track
Authorization: Bearer <accessToken>
```

该接口使用 NexAI 专用 JWT，不使用主站 JWT。

响应：

```json
{
  "status": "tracked",
  "device_fingerprint": "sha256",
  "risk_level": "SAFE",
  "risk_score": 0
}
```

## 9. 发布完整性接口或 Release 格式

客户端完整性校验需要拿到 APK 的 SHA256。必须至少实现一种方式。

### 9.1 推荐：后端发布清单接口

```http
GET /releases/:tag/manifest
```

响应：

```json
{
  "success": true,
  "data": {
    "tag": "v1.0.7-4a1684455",
    "versionName": "1.0.7-4a1684455",
    "publishedAt": "2026-05-29T14:30:00.000Z",
    "assets": [
      {
        "name": "NexAI_android_1.0.7-4a1684455_arm64-v8a.apk",
        "abi": "arm64-v8a",
        "size": 12345678,
        "sha256": "64-char-lowercase-hex",
        "downloadUrl": "https://github.com/..."
      }
    ],
    "signature": "optional-manifest-signature"
  }
}
```

要求：

- SHA256 使用 APK 文件真实字节计算。
- 返回 lowercase hex。
- 找不到 tag 返回 404，不要返回空成功。

当前仓库后端实现：

- 路由：`GET /api/nexai/releases/:tag/manifest`。
- 首先读取 `NEXAI_RELEASE_MANIFEST_DIR`，默认 `data/nexai-release-manifests`。
- 支持 `data/nexai-release-manifests/<tag>.json` 或 `data/nexai-release-manifests/<tag>/manifest.json`。
- JSON asset 可提供 `filePath`，服务端会按真实文件字节补算 `sha256` 和 `size`。
- 若没有 JSON manifest，则读取 `NEXAI_RELEASE_APK_DIR/<tag>`，默认 `data/nexai-release-apks/<tag>`，自动扫描 `.apk` 并计算 SHA256。
- 可通过 `NEXAI_RELEASE_DOWNLOAD_BASE_URL` 为 asset 自动生成 `downloadUrl`。

### 9.2 兼容：GitHub Release notes 格式

如果继续让客户端解析 GitHub Release body，发布说明必须包含每个 APK 文件名及其 `sha256:`：

```text
NexAI_android_1.0.7-4a1684455_arm64-v8a.apk
sha256:c4ff1d8f8b9f8cd5cb023a81346f389231bddf4843f2fd71845192a01af4518d

NexAI_android_1.0.7-4a1684455_armeabi-v7a.apk
sha256:...
```

发布工作流必须在上传 Release 前生成这些哈希。

## 10. 数据库建议

### 10.1 用户与 token

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  role TEXT NOT NULL DEFAULT 'user',
  google_id TEXT UNIQUE,
  google_email TEXT,
  github_id TEXT UNIQUE,
  github_username TEXT,
  last_login_at TIMESTAMPTZ,
  login_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  device_fingerprint TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 10.2 加密同步记录

```sql
CREATE TABLE sync_records (
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  record_id TEXT NOT NULL,
  revision BIGSERIAL NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted BOOLEAN NOT NULL DEFAULT false,
  crypto_alg TEXT NOT NULL,
  key_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  aad TEXT,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category, record_id)
);

CREATE INDEX idx_sync_records_user_revision
  ON sync_records(user_id, revision);
```

### 10.3 Artifacts

```sql
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  short_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  language TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  visibility TEXT NOT NULL,
  password_hash TEXT,
  description TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  view_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_artifacts_user_created ON artifacts(user_id, created_at DESC);
CREATE INDEX idx_artifacts_short_id ON artifacts(short_id);
```

### 10.4 安全事件

```sql
CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_fingerprint TEXT,
  event_type TEXT NOT NULL,
  details JSONB,
  risk_score INTEGER,
  risk_level TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_events_device
  ON security_events(device_fingerprint, created_at DESC);
```

## 11. 速率限制建议

基础限制：

- 登录：5 次 / 5 分钟 / IP + identifier。
- 注册：3 次 / 小时 / IP。
- forgot-password：3 次 / 小时 / email。
- sync 写入：60 次 / 分钟 / 用户。
- artifacts 创建：20 次 / 小时 / 用户。
- security report：30 次 / 分钟 / 设备。

高风险设备：

- `X-Device-Risk-Score >= 50` 时限制减半。
- `X-Device-Compromised: 1` 时可禁用 sync 与 artifact 创建。

## 12. 后端验收清单

上线前必须满足：

- [ ] 所有 API 只通过 HTTPS 暴露。
- [ ] 生产 API 域名与客户端证书固定 host 一致。
- [ ] `Authorization`、密码、token、API key 不进入日志。
- [ ] Auth token 支持 refresh token 轮换与撤销。
- [ ] 旧版 sync 不长期保存明文 API key 和保存的密码。
- [ ] 新版 `/sync/v2` 可存储 opaque encrypted records。
- [ ] Artifacts 密码使用哈希保存。
- [ ] HTML artifact 使用 sandbox 或安全渲染隔离。
- [ ] 安全事件接口可接受并记录设备风险头。
- [ ] 发布流程生成 APK SHA256，或实现 release manifest。
- [ ] 所有错误返回统一 JSON，不返回 HTML 错误页给客户端。
- [ ] 有最小化集成测试覆盖 auth、sync、artifacts、security、release manifest。

## 13. 推荐迁移顺序

1. 统一后端域名与证书固定 host。
2. 修复日志脱敏和错误响应格式。
3. 实现发布 manifest 或 Release SHA256 写入。
4. 在旧版 sync 上服务端临时删除敏感字段。
5. 新增 `/sync/v2` 加密同步。
6. 客户端切换到 `/sync/v2` 后，关闭旧版敏感字段同步。
7. 完善 Passkey、Artifacts、风控策略。
