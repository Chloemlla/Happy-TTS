# Synapse OAuth 第三方接入文档
全文BASE_URL：https://tts.chloemlla.com/
本文档面向需要接入 Synapse 的第三方应用，说明 OAuth 客户端注册、管理员或信用者授权、token 交换、管理员身份鉴别、用户资料读取以及 API scope 调用方式。

## 1. 接入模型

Synapse 作为 OAuth 2.0 Provider，对第三方应用开放授权码模式。

核心约束：

- 授权主体必须是 Synapse 已存在用户，并且当前角色必须是 `admin` 或 `trusted`。
- 普通用户不能打开授权预览，也不能同意授权。
- 如果授权用户后续被降级为普通用户、封停或删除，已签发的 OAuth access token 在校验时会失效。
- OAuth 不开放后台管理通配权限 `*`。第三方只能使用客户端允许的 identity scopes 和明确列出的 API scopes。
- 第三方 API 调用使用 `Authorization: Bearer <access_token>`，不需要 `X-API-Key`。

推荐流程：

1. Synapse 管理员在后台创建 OAuth 客户端。
2. 第三方应用将管理员或信用者跳转到 Synapse 授权页。
3. Synapse 授权页展示应用信息、回调地址、scope 明细和当前授权用户。
4. 授权用户同意后，第三方拿到 authorization code。
5. 第三方后端使用 code 换取 access token 和 refresh token。
6. 第三方调用 `/api/oauth/userinfo` 或 `/api/oauth/introspect` 鉴别管理员身份。
7. 第三方用 access token 调用已授权的 Synapse API 能力。

## 2. 环境和地址

OAuth 元数据地址：

```text
GET /api/oauth/.well-known/openid-configuration
GET /api/oauth/metadata
```

元数据中的主要端点：

```text
authorization_endpoint: /oauth/authorize
token_endpoint: /api/oauth/token
userinfo_endpoint: /api/oauth/userinfo
introspection_endpoint: /api/oauth/introspect
revocation_endpoint: /api/oauth/revoke
```

服务端优先使用 `BASE_URL` 或 `FRONTEND_URL` 生成公开地址。生产环境建议配置 `BASE_URL=https://your-synapse.example.com`，避免第三方拿到内网或代理前地址。

## 3. 创建 OAuth 客户端

管理员可以在前端后台进入：

```text
/admin?tab=oauth
```

也可以调用管理 API。所有客户端管理 API 都需要 Synapse 管理员 JWT。

```text
GET    /api/oauth/scopes
GET    /api/oauth/clients
POST   /api/oauth/clients
GET    /api/oauth/clients/:clientId
PUT    /api/oauth/clients/:clientId
POST   /api/oauth/clients/:clientId/rotate-secret
DELETE /api/oauth/clients/:clientId
GET    /api/oauth/grants
POST   /api/oauth/grants/:grantId/revoke
```

创建 confidential 客户端示例：

```bash
curl -X POST "https://synapse.example.com/api/oauth/clients" \
  -H "Authorization: Bearer <synapse-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Example Partner",
    "type": "confidential",
    "description": "Example Partner backend integration",
    "homepageUrl": "https://partner.example.com",
    "logoUrl": "https://partner.example.com/logo.png",
    "redirectUris": [
      "https://partner.example.com/oauth/synapse/callback"
    ],
    "allowedScopes": [
      "openid",
      "profile",
      "email",
      "admin:identity",
      "status",
      "tts"
    ],
    "rateLimitPerMinute": 120
  }'
```

响应示例：

```json
{
  "success": true,
  "client": {
    "clientId": "syn_client_xxx",
    "type": "confidential",
    "name": "Example Partner",
    "redirectUris": ["https://partner.example.com/oauth/synapse/callback"],
    "allowedScopes": ["openid", "profile", "email", "admin:identity", "status", "tts"],
    "enabled": true,
    "hasClientSecret": true
  },
  "clientSecret": "syn_secret_xxx",
  "message": "请立即保存 clientSecret，它不会再次显示"
}
```

注意：

- `clientSecret` 只返回一次，第三方必须安全保存。
- `confidential` 客户端适合有后端的应用，换 token 时必须提交 `client_secret`。
- `public` 客户端适合无法保密 secret 的应用，必须使用 PKCE。
- `redirectUris` 生产环境必须使用 HTTPS；仅允许本地开发回调使用 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]`。
- `homepageUrl` 和 `logoUrl` 必须使用 HTTPS。

## 4. Scope 说明

Identity scopes：

| Scope | 说明 |
| --- | --- |
| `openid` | 返回授权用户的唯一用户 ID。 |
| `profile` | 返回用户名、头像、角色、管理员状态、信用者状态、账号状态等基础资料。 |
| `email` | 返回授权用户邮箱。 |
| `admin:identity` | 明确返回 `role`、`isAdmin`、`is_admin`、`synapseAdmin`、`synapse_admin` 等字段，供第三方鉴别 Synapse 管理员身份。 |

API scopes：

| Scope | 可调用能力 |
| --- | --- |
| `tts` | TTS 生成和任务查询。 |
| `status` | 认证状态检查。 |
| `shorturl` | 短链管理。 |
| `media` | 媒体解析接口。 |
| `network` | Ping、TCPing、测速、端口扫描、IP 查询等网络工具。 |
| `life` | 生活信息接口。 |
| `social` | 社交热榜接口。 |
| `ipfs` | IPFS 上传。 |
| `data-process` | Base64、MD5 等数据处理接口。 |

`*` 不属于 OAuth scope，不能被第三方申请。

## 5. 授权请求

第三方应用将管理员或信用者浏览器跳转到：

```text
GET /oauth/authorize
```

参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `response_type` | 是 | 固定为 `code`。 |
| `client_id` | 是 | OAuth 客户端 ID。 |
| `redirect_uri` | 是 | 必须完全匹配客户端白名单中的回调地址。 |
| `scope` | 否 | 空格分隔。为空时默认请求 `openid profile admin:identity`。 |
| `state` | 推荐 | 第三方生成并校验，防 CSRF。 |
| `code_challenge` | public 必填 | PKCE challenge。confidential 可选。 |
| `code_challenge_method` | 使用 PKCE 时必填 | `S256` 或 `plain`，推荐 `S256`。 |

示例：

```text
https://synapse.example.com/oauth/authorize?response_type=code&client_id=syn_client_xxx&redirect_uri=https%3A%2F%2Fpartner.example.com%2Foauth%2Fsynapse%2Fcallback&scope=openid%20profile%20email%20admin%3Aidentity%20tts&state=random_state
```

如果授权用户未登录，前端会引导到登录页并在登录后回到授权页。如果登录用户不是管理员或信用者，授权页不会允许继续授权。

同意后 Synapse 跳转：

```text
https://partner.example.com/oauth/synapse/callback?code=syn_oac_xxx&state=random_state
```

拒绝后 Synapse 跳转：

```text
https://partner.example.com/oauth/synapse/callback?error=access_denied&error_description=授权用户拒绝了请求&state=random_state
```

第三方必须校验返回的 `state` 与发起授权时保存的一致。

## 6. 使用 authorization code 换 token

端点：

```text
POST /api/oauth/token
```

推荐使用 `application/x-www-form-urlencoded`。

confidential 客户端使用 Basic Auth：

```bash
curl -X POST "https://synapse.example.com/api/oauth/token" \
  -u "syn_client_xxx:syn_secret_xxx" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=syn_oac_xxx" \
  -d "redirect_uri=https://partner.example.com/oauth/synapse/callback"
```

也可以用 body 传 `client_id` 和 `client_secret`：

```bash
curl -X POST "https://synapse.example.com/api/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=syn_client_xxx" \
  -d "client_secret=syn_secret_xxx" \
  -d "code=syn_oac_xxx" \
  -d "redirect_uri=https://partner.example.com/oauth/synapse/callback"
```

public 客户端使用 PKCE：

```bash
curl -X POST "https://synapse.example.com/api/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=syn_client_public_xxx" \
  -d "code=syn_oac_xxx" \
  -d "redirect_uri=http://localhost:3000/callback" \
  -d "code_verifier=<original-code-verifier>"
```

成功响应：

```json
{
  "access_token": "syn_oat_xxx",
  "token_type": "Bearer",
  "expires_in": 7200,
  "refresh_token": "syn_ort_xxx",
  "refresh_expires_in": 2592000,
  "scope": "openid profile email admin:identity tts",
  "user": {
    "sub": "admin-user-id",
    "id": "admin-user-id",
    "username": "admin",
    "name": "admin",
    "avatarUrl": "https://cdn.example.com/avatar.png",
    "role": "admin",
    "roles": ["admin"],
    "isAdmin": true,
    "is_admin": true,
    "admin": true,
    "synapseAdmin": true,
    "synapse_admin": true,
    "isTrusted": false,
    "is_trusted": false,
    "authProvider": "local",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "accountStatus": "active",
    "email": "admin@example.com",
    "emailVerified": true
  }
}
```

授权码有效期为 10 分钟，只能使用一次。

## 7. 刷新 access token

端点：

```text
POST /api/oauth/token
```

示例：

```bash
curl -X POST "https://synapse.example.com/api/oauth/token" \
  -u "syn_client_xxx:syn_secret_xxx" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=syn_ort_xxx"
```

刷新时 Synapse 会再次校验：

- 客户端仍然存在并启用。
- grant 没有被撤销。
- 授权用户仍存在。
- 授权用户没有被封停。
- 授权用户仍然是 `admin` 或 `trusted`。

如果校验通过，旧 token 会被吊销，并返回新的 access token 和 refresh token。

## 8. 读取 userinfo

端点：

```text
GET /api/oauth/userinfo
Authorization: Bearer <access_token>
```

示例：

```bash
curl "https://synapse.example.com/api/oauth/userinfo" \
  -H "Authorization: Bearer syn_oat_xxx"
```

响应字段受 scope 控制：

```json
{
  "sub": "admin-user-id",
  "id": "admin-user-id",
  "username": "admin",
  "name": "admin",
  "avatarUrl": "https://cdn.example.com/avatar.png",
  "role": "admin",
  "roles": ["admin"],
  "isAdmin": true,
  "is_admin": true,
  "admin": true,
  "synapseAdmin": true,
  "synapse_admin": true,
  "isTrusted": false,
  "is_trusted": false,
  "authProvider": "local",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "accountStatus": "active",
  "email": "admin@example.com",
  "emailVerified": true
}
```

第三方判断 Synapse 管理员身份时，建议同时检查：

```text
role === "admin"
isAdmin === true
synapseAdmin === true
accountStatus === "active"
```

兼容只支持 snake_case 的客户端时，也可以检查 `is_admin === true` 和 `synapse_admin === true`。信用者授权会返回 `role === "trusted"`、`isTrusted === true`，但管理员字段仍为 `false`。

如果 token 对应用户已不是管理员或信用者，接口会返回错误，不会继续返回身份资料。

## 9. Token introspection

端点：

```text
POST /api/oauth/introspect
```

此接口需要客户端认证，只允许客户端查询自己签发上下文内的 token。

示例：

```bash
curl -X POST "https://synapse.example.com/api/oauth/introspect" \
  -u "syn_client_xxx:syn_secret_xxx" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=syn_oat_xxx"
```

有效响应：

```json
{
  "active": true,
  "client_id": "syn_client_xxx",
  "sub": "admin-user-id",
  "username": "admin",
  "scope": "openid profile admin:identity tts",
  "exp": 1780000000,
  "token_type": "Bearer",
  "role": "admin",
  "roles": ["admin"],
  "isAdmin": true,
  "is_admin": true,
  "admin": true,
  "synapseAdmin": true,
  "synapse_admin": true,
  "isTrusted": false,
  "is_trusted": false
}
```

无效、过期、已撤销、客户端不匹配、用户不再是管理员或信用者时：

```json
{
  "active": false
}
```

## 10. 吊销 token

端点：

```text
POST /api/oauth/revoke
```

示例：

```bash
curl -X POST "https://synapse.example.com/api/oauth/revoke" \
  -u "syn_client_xxx:syn_secret_xxx" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=syn_oat_xxx"
```

响应：

```json
{
  "success": true
}
```

可以传 access token 或 refresh token。服务端会吊销当前客户端下匹配的 token。

## 11. 使用 OAuth token 调用 Synapse API

已接入 API Key 认证的接口现在也接受 OAuth Bearer token。第三方需要申请对应 API scope。

TTS 示例，需要 `tts` scope：

```bash
curl -X POST "https://synapse.example.com/api/tts/generate" \
  -H "Authorization: Bearer syn_oat_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello from OAuth",
    "model": "gpt-4o-mini-tts",
    "voice": "alloy",
    "outputFormat": "mp3",
    "speed": 1
  }'
```

状态接口示例，需要 `status` scope：

```bash
curl "https://synapse.example.com/api/status/status" \
  -H "Authorization: Bearer syn_oat_xxx"
```

IPFS 上传示例，需要 `ipfs` scope：

```bash
curl -X POST "https://synapse.example.com/api/ipfs/upload" \
  -H "Authorization: Bearer syn_oat_xxx" \
  -F "file=@avatar.png"
```

OAuth token 调用这些接口时，Synapse 会按客户端配置的 `rateLimitPerMinute` 做 token 级限流。

## 12. 错误码

| 错误码 | 场景 |
| --- | --- |
| `invalid_request` | 缺少必要参数、redirect_uri 不匹配、PKCE 参数无效等。 |
| `invalid_client` | 客户端不存在、已停用或 client_secret 错误。 |
| `invalid_client_metadata` | 创建或更新客户端时元数据无效。 |
| `invalid_scope` | 请求了不存在或客户端未启用的 scope。 |
| `unsupported_response_type` | `response_type` 不是 `code`。 |
| `unsupported_grant_type` | `grant_type` 不是 `authorization_code` 或 `refresh_token`。 |
| `access_denied` | 非管理员授权、管理员拒绝授权、账号被封停或管理员身份失效。 |
| `invalid_grant` | 授权码无效、过期、已使用，或 refresh token 无效。 |
| `invalid_token` | access token 无效、过期或已撤销。 |
| `insufficient_scope` | access token 缺少目标接口需要的 scope。 |

OAuth 错误响应示例：

```json
{
  "error": "invalid_scope",
  "error_description": "客户端未启用 scope: tts"
}
```

## 13. 第三方实现建议

- confidential 客户端必须在服务端换 token，不要把 `client_secret` 暴露到浏览器。
- public 客户端必须使用 PKCE，并推荐 `S256`。
- 每次发起授权都生成新的 `state`，回调时强制校验。
- access token 过期前可以主动 refresh，收到 401 时也应 refresh 或重新授权。
- 第三方如果依赖 Synapse 管理员身份做权限控制，应在关键操作前调用 `/api/oauth/introspect` 或 `/api/oauth/userinfo` 重新确认。
- 不要长期缓存 `isAdmin` 结果。Synapse 会在 token 校验时实时检查用户是否仍为管理员。
- scope 尽量最小化。只读取身份时申请 `openid profile admin:identity`，需要邮箱才申请 `email`，需要 API 能力时再申请对应 API scope。

## 14. 管理员运维建议

- 定期检查 `/admin -> OAuth 接入` 中的客户端和授权记录。
- 不再使用的客户端应停用，停用会吊销相关 grant 和 token。
- 怀疑 secret 泄漏时使用 `rotate-secret`，轮换会吊销既有 token。
- 生产环境只配置 HTTPS redirect URI。
- 为不同第三方应用创建独立客户端，不要复用 client secret。
