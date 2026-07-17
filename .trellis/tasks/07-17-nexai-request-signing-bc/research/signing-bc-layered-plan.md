# NexAI Request Signing B+C + Layered Defense

## Decision
Adopt **B (Token-bound) + C (App shared secret)** under protocol **nexai-sig-v2**, combined with:
- TLS certificate pinning (client)
- Route/IP/user rate limits (backend)
- Device risk headers as telemetry (not sole BLOCK authority when unauthenticated)
- NexAI JWT account auth for identity/authorization

## Hard product requirement (user mandate)
**Every failed request must surface a clear stage + reason.**

Especially on the client:
1. Failures must map to an explicit **pipeline stage**
2. UI must **dialog/snackbar** the stage and human-readable reason
3. Prefer server `code` + `message`; if local failure, use local stage codes
4. Never show only "请求失败" / "Network error" without stage

### Standard error pipeline stages
| Stage id | Meaning | Typical actor |
|---|---|---|
| `tls_pinning` | Certificate pin / TLS trust failed | Client |
| `request_build` | URL/body/header assembly failed | Client |
| `request_sign` | Local HMAC/signing failed (no token, no app secret, web unsupported, crypto error) | Client |
| `transport` | Timeout, DNS, socket, connection reset | Client |
| `http_status` | Got HTTP response with non-2xx | Client+Server |
| `response_parse` | Body not JSON / schema mismatch | Client |
| `auth_session` | Token missing/expired/refresh failed | Client |
| `rate_limit` | 429 from server or local throttle | Both |
| `server_signature` | Server rejected signature (missing/expired/replay/invalid) | Server |
| `server_auth` | JWT/authz failed | Server |
| `server_validation` | Business validation 4xx | Server |
| `server_internal` | 5xx | Server |
| `risk_policy` | Server risk policy denied action | Server |

### Server JSON error envelope (required for /api/nexai when rejecting)
```json
{
  "success": false,
  "error": "Human readable Chinese or English message",
  "code": "NEXAI_SIG_INVALID",
  "stage": "server_signature",
  "details": {
    "reason": "hmac_mismatch",
    "sigVersion": "2",
    "path": "/api/nexai/sync/v2"
  }
}
```
Rules:
- `code` stable machine id (SCREAMING_SNAKE)
- `stage` one of the table above
- `error` always non-empty user-facing string
- Do not put secrets/tokens/signatures into `details`

### Signature error codes
| code | stage | When |
|---|---|---|
| `NEXAI_SIG_MISSING` | `server_signature` | Missing ts/nonce/sig under enforce |
| `NEXAI_SIG_VERSION` | `server_signature` | Unsupported version |
| `NEXAI_SIG_EXPIRED` | `server_signature` | Timestamp drift |
| `NEXAI_SIG_REPLAY` | `server_signature` | Nonce reuse |
| `NEXAI_SIG_INVALID` | `server_signature` | HMAC mismatch |
| `NEXAI_SIG_KEY` | `server_signature` | No candidate key (no bearer, no app secret) |
| `NEXAI_SIG_SOFT_FAIL` | `server_signature` | soft mode fail (logged; request continues) — optional header only |

### Client local error codes (dialog)
| code | stage | Dialog title example |
|---|---|---|
| `CLIENT_TLS_PIN` | `tls_pinning` | 安全连接失败 |
| `CLIENT_SIGN_NO_KEY` | `request_sign` | 请求签名失败 |
| `CLIENT_SIGN_WEB` | `request_sign` | 当前平台不支持签名 |
| `CLIENT_TIMEOUT` | `transport` | 网络超时 |
| `CLIENT_PARSE` | `response_parse` | 服务器响应异常 |
| `CLIENT_REFRESH_FAIL` | `auth_session` | 登录已失效 |

### Client UX contract
For any NexAI API failure shown to the user:
```
【环节】请求签名
【原因】缺少登录令牌且未配置应用签名密钥
【代码】CLIENT_SIGN_NO_KEY
```
or when server returns envelope:
```
【环节】服务端签名校验
【原因】请求已过期，请校准系统时间
【代码】NEXAI_SIG_EXPIRED
```
Debug/developer builds may attach path/method; production dialogs must still include stage+reason+code.

## Protocol nexai-sig-v2 (summary)
Headers: `X-NexAI-Sig-Version: 2`, `X-NexAI-Ts` (ms), `X-NexAI-Nonce`, `X-NexAI-Sig` (hex), optional `X-NexAI-Key-Id`.
Canonical: `ts\nnonce\nMETHOD\npath\nrawBody`
Keys: Bearer accessToken (B) preferred when present; else App secret (C) for gated public routes; public read whitelist unsigned.
Modes: `NEXAI_REQUEST_SIGNING=off|soft|enforce`.

## Layering
1. Pinning → 2. Sign v2 → 3. Rate limit → 4. JWT → 5. Risk telemetry/policy
Unauthenticated risk headers must not alone BLOCK.

## Implementation split
### Backend (Synapse)
- rawBody capture for /api/nexai
- middleware nexaiRequestSignature
- error envelope on all sig/auth rejects on these routes
- env flags + nonce store
- path whitelist matrix

### Client (NexAI)
- signRequestV2
- BackendClient integration
- map all failures to stage+code
- central dialog presenter for NexAI API errors
- refresh signing with refreshToken key variant

## Non-goals
- DeviceId-only HMAC as server trust root
- Replacing JWT with signatures
- Trusting client risk headers for unauthenticated BLOCK
