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

| Scope | 可调用能力 | 典型接口 |
| --- | --- | --- |
| `tts` | TTS 生成和任务查询。 | `/api/tts/generate`、`/api/tts/jobs/*`、`/api/tts/history` |
| `status` | 认证状态检查。 | `/api/status/status` |
| `shorturl` | 短链管理。 | `/api/shorturl/shorturls`、`/api/shorturl/shorturls/*` |
| `media` | 媒体解析接口。 | `/api/media/music163`、`/api/media/pipixia` |
| `network` | Ping、TCPing、测速、端口扫描、IP 查询等网络工具。 | `/api/network/*` |
| `life` | 生活信息接口。 | `/api/life/*` |
| `social` | 社交热榜接口。 | `/api/social/*` |
| `ipfs` | IPFS 上传。 | `/api/ipfs/upload` |
| `data-process` | Base64、MD5 等数据处理接口。 | `/api/data/*` |

`*` 不属于 OAuth scope，不能被第三方申请。

### 4.1 API scopes 教程能力

Synapse 将 API Key 权限映射为 OAuth API scopes。也就是说，原本接入了 `apiKeyAuth("tts")`、`apiKeyAuth("network")` 等认证中间件的接口，现在可以用同名 OAuth scope 授权后通过 Bearer token 调用。

后端判断规则：

- 客户端创建或更新时，`allowedScopes` 决定该 OAuth 客户端最多能申请哪些 identity scopes 和 API scopes。
- 授权请求中的 `scope` 必须是 `allowedScopes` 的子集，否则返回 `invalid_scope`。
- Access token 只携带用户实际同意的 scopes。调用 API 时，目标接口会校验 token 是否包含对应 API scope。
- API scope 不会授予后台管理权限；`*` 只存在于 API Key 管理模型中，不会出现在 OAuth scopes 中。

前端可以读取 scope 清单，用于渲染“申请哪些能力”的勾选项：

```bash
curl "https://synapse.example.com/api/oauth/scopes"
```

响应中的每个 scope 都包含 `key`、`label`、`description`、`category`、`endpoints`，identity scope 还会带 `identityScope: true`。`endpoints` 适合用于权限说明展示；实际调用地址仍以对应接口文档和当前部署路由为准。第三方前端可以按 `identityScope` 分组展示身份权限和 API 能力：

```ts
type SynapseScope = {
  key: string;
  label: string;
  description: string;
  endpoints: string[];
  identityScope?: boolean;
};

async function loadSynapseScopes(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/oauth/scopes`);
  const data = await response.json();
  const scopes = data.scopes as SynapseScope[];

  return {
    identityScopes: scopes.filter((scope) => scope.identityScope),
    apiScopes: scopes.filter((scope) => !scope.identityScope),
  };
}
```

第三方应用应按功能最小化申请 API scopes：

| 第三方功能 | 建议申请 |
| --- | --- |
| 只登录并确认管理员身份 | `openid profile admin:identity` |
| 登录后展示邮箱 | `openid profile email admin:identity` |
| 代授权用户生成语音 | `openid profile admin:identity tts` |
| 展示系统认证状态 | `openid profile admin:identity status` |
| 上传文件到 IPFS | `openid profile admin:identity ipfs` |
| 调用网络工具 | `openid profile admin:identity network` |

前端发起授权时，把所需 API scopes 拼进授权 URL 的 `scope` 参数：

```ts
function buildSynapseAuthorizeUrl() {
  const scopes = [
    "openid",
    "profile",
    "admin:identity",
    "tts",
    "status",
  ];

  const params = new URLSearchParams({
    response_type: "code",
    client_id: "syn_client_xxx",
    redirect_uri: "https://partner.example.com/oauth/synapse/callback",
    scope: scopes.join(" "),
    state: crypto.randomUUID(),
  });

  return `https://synapse.example.com/oauth/authorize?${params.toString()}`;
}
```

后端换取 token 后，应保存并校验响应里的 `scope` 字段。只有确认 token 包含目标 API scope 后，才向业务层开放对应按钮或能力：

```ts
type SynapseTokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
};

function parseGrantedScopes(tokenSet: SynapseTokenSet) {
  return new Set(tokenSet.scope.split(/\s+/).filter(Boolean));
}

function assertGrantedScope(grantedScopes: Set<string>, requiredScope: string) {
  if (!grantedScopes.has(requiredScope)) {
    throw new Error(`Synapse OAuth token 缺少 ${requiredScope} scope，请重新授权`);
  }
}
```

服务端调用 Synapse API 时，只需要发送 OAuth Bearer token，不要同时发送 `X-API-Key`：

```ts
async function callSynapseTts(accessToken: string, text: string) {
  const response = await fetch("https://synapse.example.com/api/tts/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      outputFormat: "mp3",
      speed: 1,
    }),
  });

  if (response.status === 401) {
    throw new Error("Synapse OAuth token 已失效，请 refresh 或重新授权");
  }

  if (response.status === 403) {
    const wwwAuthenticate = response.headers.get("WWW-Authenticate");
    if (wwwAuthenticate?.includes("insufficient_scope")) {
      throw new Error("Synapse OAuth token 缺少 tts scope，请重新授权");
    }
  }

  if (!response.ok) {
    throw new Error(`Synapse API 调用失败: ${response.status}`);
  }

  return response.json();
}
```

前端展示能力时推荐使用后端保存的授权结果，而不是仅依赖本地勾选状态。常见流程是：

1. 前端让用户选择需要的 API scopes，并跳转到 Synapse 授权页。
2. 后端在 callback 中换 token，保存 `access_token`、`refresh_token`、`expires_at` 和 `scope`。
3. 后端向自家前端返回已授权 scope 列表，例如 `["openid", "profile", "admin:identity", "tts"]`。
4. 前端只展示已授权 scope 对应的功能入口；调用自家后端业务接口时，由自家后端再携带 Synapse access token 访问 Synapse API。
5. 收到 `insufficient_scope` 时，引导用户重新授权并追加缺失的 API scope。

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

### 11.1 后端代理调用模式

推荐第三方后端作为 Synapse API 的唯一调用方，尤其是 confidential 客户端。这样可以避免把 refresh token、client secret 或长期有效的 access token 暴露给浏览器。

```ts
const SYNAPSE_BASE_URL = "https://synapse.example.com";

async function synapseFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${SYNAPSE_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    // access token 过期、被吊销、用户降级或客户端停用时会进入这里。
    // 后端应尝试 refresh；refresh 失败则清理本地授权并要求重新授权。
    throw new Error("synapse_oauth_invalid_token");
  }

  if (response.status === 403) {
    const authHeader = response.headers.get("WWW-Authenticate") || "";
    if (authHeader.includes("insufficient_scope")) {
      throw new Error("synapse_oauth_insufficient_scope");
    }
  }

  return response;
}
```

后端实现业务接口时，应把“本业务需要哪个 API scope”写成明确约束：

```ts
async function generateSpeechForCurrentUser(userId: string, text: string) {
  const tokenSet = await loadSynapseTokenSet(userId);
  const grantedScopes = parseGrantedScopes(tokenSet);
  assertGrantedScope(grantedScopes, "tts");

  const response = await synapseFetch("/api/tts/generate", tokenSet.access_token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      outputFormat: "mp3",
      speed: 1,
    }),
  });

  return response.json();
}
```

如果第三方前端直接调用 Synapse API，只适合 public 客户端加 PKCE 的短会话场景。此时 access token 应只保存在内存中，页面刷新后重新授权或让后端签发自家会话；不要放进 localStorage。

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

## 15. 最近提交暴露的 OAuth 踩坑点

本节根据 2026-06-07 14:23 到 14:37 之间的提交复盘整理，重点覆盖 geograba 接入 Synapse OAuth 时已经踩过或最容易再次踩到的问题。

### 15.1 userinfo 字段不能只按一种命名风格解析

Synapse 的 `/api/oauth/userinfo` 可能同时返回 camelCase 和 snake_case 兼容字段，例如：

```json
{
  "isAdmin": true,
  "is_admin": true,
  "synapseAdmin": true,
  "synapse_admin": true,
  "isTrusted": false,
  "is_trusted": false,
  "avatarUrl": "https://cdn.example.com/avatar.png",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "accountStatus": "active"
}
```

坑点是：在 Rust/Serde 里用 `rename_all = "camelCase"` 再给同一个字段加 `alias = "is_admin"`，当响应里同时出现 `isAdmin` 和 `is_admin` 时，可能触发重复字段错误。当前实现改为手动解析 JSON，把兼容字段拆开读取后再归一化。

接入方也应按这个思路处理：

- `avatarUrl` 和 `avatar_url` 都要兼容。
- `createdAt` 和 `created_at` 都要兼容，并按 RFC 3339 时间解析。
- `accountStatus` 和 `account_status` 都要兼容，缺省时按 `active` 处理，但一旦不是 `active` 必须拒绝。
- 布尔字段必须按布尔值处理，不要把字符串 `"true"` 当成合法响应静默接受。

### 15.2 管理员身份不能只看一个字段

不要只判断 `role === "admin"` 或只判断 `isAdmin`。Synapse 为了兼容不同客户端，会返回多组等价字段。当前归一化规则是：

```text
isAdmin
is_admin
synapseAdmin
synapse_admin
admin
role === "admin"
```

任一命中即可认为是管理员。信用者授权也要兼容：

```text
isTrusted
is_trusted
role === "trusted"
```

但 `trusted` 不是管理员。需要后台管理能力时仍要调用需要管理员的接口或显式检查 `is_admin`/`synapse_admin` 一类字段。

### 15.3 用户 ID、角色和展示信息都要有兜底

userinfo 的用户 ID 可能来自 `sub` 或 `id`。接入时应优先使用 `sub`，缺失时再用 `id`，两者都没有时必须拒绝登录。

显示信息也不能假设字段总是齐全：

- `username` 缺失时可以退回 `name`。
- `name` 缺失时可以退回 `username`。
- `role` 缺失时可以从 `roles[0]` 兜底。
- `email` 受 `email` scope 控制，没申请时可能为空。

### 15.4 access token 要按不透明 token 处理

当前后端每次需要认证时都会用 access token 调用 `/api/oauth/userinfo`，而不是本地解 JWT 或长期缓存身份。这是有意设计：

- 用户被降级、封停或删除后，下一次 userinfo 校验应立即失败。
- 客户端停用、grant 撤销或 token 过期后，也应按 401 处理。
- 不要长期缓存 `isAdmin` 或 `isTrusted` 的结果。

如果第三方有性能压力，可以做很短时间的缓存，但关键操作前仍应重新调用 `/api/oauth/userinfo` 或 `/api/oauth/introspect`。

### 15.5 token 交换必须是服务端、Basic Auth、表单格式

confidential 客户端换 token 时应由服务端调用：

```text
POST /api/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded
```

不要踩这些坑：

- 不要在浏览器里暴露 `client_secret`。
- 不要默认用 JSON body，当前实现使用表单提交。
- `redirect_uri` 必须和发起授权时以及客户端白名单中的值完全一致。
- `token_type`、`expires_in`、`refresh_token`、`scope` 都可能需要容错；但业务判断应优先使用 token 响应里实际返回的 `scope`。

### 15.6 scope 有三层约束，缺一层都会失败

OAuth API scope 不是只在授权 URL 里加上就能用，必须同时满足：

1. Synapse OAuth 客户端的 `allowedScopes` 包含该 scope。
2. 授权 URL 的 `scope` 参数请求了该 scope。
3. 用户同意后返回的 token `scope` 确实包含该 scope。

常见错误表现：

- 第 1 层不满足：授权阶段返回 `invalid_scope`。
- 第 2 或第 3 层不满足：调用 API 时返回 `insufficient_scope`。
- 只配置了默认 `openid profile email admin:identity`：只能做登录和身份识别，不能调用 `tts`、`ipfs`、`network` 等 API 能力。

### 15.7 BASE_URL、API_BASE_URL、FRONTEND_BASE_URL 和 redirect URI 要分清

本项目同时涉及 Synapse Provider 地址、geograba 后端公开地址和 geograba 前端公开地址：

| 配置 | 作用 |
| --- | --- |
| `SYNAPSE_BASE_URL` | Synapse OAuth Provider 地址，用于拼 `/oauth/authorize`、`/api/oauth/token`、`/api/oauth/userinfo`。 |
| `API_BASE_URL` | geograba 后端对外地址，用于默认生成 `/api/v1/auth/oauth/callback`。 |
| `FRONTEND_BASE_URL` | geograba 前端对外地址，用于 OAuth 完成后回到前端页面。 |
| `SYNAPSE_OAUTH_REDIRECT_URI` | 注册在 Synapse 客户端里的回调地址，必须和实际回调完全一致。 |

部署时最容易出错的是只改了前端域名，没有改 `API_BASE_URL` 或 `SYNAPSE_OAUTH_REDIRECT_URI`，导致 Synapse 回调到内网地址、旧域名或未登记的 URI。

### 15.8 returnTo 不是任意跳转地址

`/api/v1/auth/oauth/start?returnTo=...` 会保存前端回跳地址，但后端会校验来源，避免 open redirect。允许的来源包括：

- `FRONTEND_BASE_URL`
- `API_BASE_URL`
- 当前请求的 `Origin`
- 当前请求的 `Referer`
- 同站相对路径，例如 `/auth`

如果 `returnTo` 不是允许来源，会回退到 `${FRONTEND_BASE_URL}/auth`。因此生产环境必须正确配置 `FRONTEND_BASE_URL`，否则授权成功后可能回到错误页面。

### 15.9 OAuth state 是短期、单次、内存态

当前 state 记录保存在后端内存 store 中：

- 有效期 10 分钟。
- callback 到达时会被取出并删除。
- 授权成功、授权拒绝、缺少 code 都会消费 state。

这带来几个部署坑：

- 用户停留授权页超过 10 分钟再回来，会得到 state 过期。
- 浏览器重复刷新 callback，第二次会得到 state 无效。
- 多实例部署时，如果没有共享 state 存储或粘性会话，callback 打到另一台实例会找不到 state。
- 后端重启会清空 state，正在进行的授权流程会失败。

多实例生产部署应把 OAuth state 放到共享存储，或者保证同一次 OAuth 流程命中同一实例。

### 15.10 回调结果写在 URL hash，不在 query

geograba 后端完成 token 交换后，会重定向回 `returnTo`，并把结果写入 fragment：

```text
#synapseAuth=<base64url session>
#synapseError=<message>
```

前端必须从 `window.location.hash` 读取并消费结果，而不是从 query string 读取。读取后应清理 URL，避免用户复制链接时带上 session 信息。

如果 `returnTo` 本身已经包含 hash，后端会继续追加 `&synapseAuth=...` 或 `&synapseError=...`，前端解析逻辑要兼容这种形式。

### 15.11 Authorization 头格式要严格

geograba 后端只从 `Authorization` 头提取 Bearer token：

```text
Authorization: Bearer <access_token>
```

已兼容 `Bearer` 和 `bearer` 前缀，但不接受空 token，也不会从 `X-API-Key`、cookie 或 query 参数读取 OAuth access token。调用 geograba 受保护 API 时，前端或第三方后端必须显式发送 Bearer token。

### 15.12 refresh 不是无条件续命

刷新 access token 时，Synapse 和 geograba 都会重新校验用户和客户端状态：

- refresh token 无效、过期或已被轮换会失败。
- 用户不再是 `admin` 或 `trusted` 会失败。
- 用户账号不是 `active` 会失败。
- 客户端停用、grant 撤销、secret 轮换都可能导致失败。

因此收到 refresh 失败时，不要无限重试。应清理本地会话，引导用户重新授权。
