# Backend Security Boundary Contracts

## Scenario: Request Signing and LogShare Encryption

### 1. Scope / Trigger

- Trigger: request replay protection and LogShare encrypted responses cross frontend/backend, env, middleware, route, and UI boundaries.
- Applies when changing `SIGN_SECRET_KEY`, `replayProtection`, signed frontend requests, NexAI `nexai-sig-v2` middleware, LogShare upload/query/list responses, or related tests.

### 2. Signatures

- `replayProtection()` validates `x-timestamp`, `x-nonce`, and `x-signature`.
- Signed payload is `timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path + "\n" + body`.
- Production config requires `SIGN_SECRET_KEY`; browser code must not embed a shared signing secret.
- `nexaiRequestSignature()` validates `X-NexAI-Sig-Version`, `X-NexAI-Ts`, `X-NexAI-Nonce`, and `X-NexAI-Sig` under mode `NEXAI_REQUEST_SIGNING=off|soft|enforce` (default soft).
- NexAI signed payload is the same canonical form: `ts\nnonce\nMETHOD\npath\nrawBody`.
- NexAI keys: Bearer access token (B), refreshToken body key on `/api/nexai/auth/refresh`, or `NEXAI_APP_SIGN_SECRET*` (C).
- LogShare encrypted responses return `{ version: 2, algorithm: "aes-256-gcm", kdf: "pbkdf2-sha512", iterations, data, iv, salt, tag }`.

### 3. Contracts

- Authenticated browser signing uses the current Bearer token as a user-scoped signing key. Server verification may also accept `SIGN_SECRET_KEY` for trusted non-browser callers.
- `path` is the origin-relative pathname without query string, matching `req.originalUrl.split("?")[0]`.
- NexAI public GET/HEAD exemptions: oauth-config, github callback, release manifest, artifact shortId read. Mutating artifact methods are not exempt.
- NexAI signature/auth/rate-limit rejects must include stable `code` and pipeline `stage` (`server_signature` / `server_auth` / `rate_limit`).
- LogShare AES-GCM uses a random 12-byte IV, random salt, PBKDF2-SHA512, and an auth tag. Never log uploaded content previews.
- Legacy AES-CBC LogShare payloads may be read for compatibility, but new server responses must use version 2.

### 4. Validation & Error Matrix

- Missing replay headers -> HTTP 400.
- Malformed signature hex or signature mismatch -> HTTP 403.
- No available signing key -> HTTP 503.
- Expired timestamp or consumed nonce -> HTTP 403.
- Missing NexAI sig headers under enforce -> HTTP 400 `NEXAI_SIG_MISSING` / `stage: server_signature`.
- NexAI soft mode signature failures continue with `X-NexAI-Sig-Result: fail` headers.
- Missing LogShare admin password/token for encrypted data -> client-side decrypt error before rendering.
- Tampered AES-GCM ciphertext/tag -> decrypt failure; do not render partial plaintext.

### 5. Good/Base/Bad Cases

- Good: authenticated admin request signs method/path/body with the Bearer token and passes replay protection after JWT auth.
- Good: NexAI authed request signs with access token; refresh uses refreshToken-bound HMAC when no Bearer.
- Good: LogShare upload logs file metadata only: id, extension, sanitized file name, and size.
- Base: old AES-CBC LogShare payloads still decrypt on the client for existing records.
- Bad: frontend signing env secrets, hardcoded HMAC keys, Bearer token console logs, method-agnostic public exemptions for mutating artifact routes, or uploaded-content log previews.

### 6. Tests Required

- Replay middleware tests must sign with the exact method/path/body payload and assert valid, expired, replayed, and malformed cases.
- NexAI sig-v2 tests must cover soft/enforce missing headers, valid token/app/refresh keys, drift, replay, public GET exemption, and mutating artifact non-exemption.
- Production config tests must reject missing `SIGN_SECRET_KEY`.
- LogShare encryption tests should assert AES-GCM response fields and verify tampered ciphertext/tag fails to decrypt.
- Static scans should reject frontend signing secrets, token-bearing console logs, mutable workflow refs, and LogShare content previews.

### 7. Wrong vs Correct

#### Wrong

```ts
const SIGN_SECRET = import.meta.env.FRONTEND_SIGNING_SECRET || "default-secret";
console.log("Authorization", `Bearer ${token}`);
logger.info({ preview: content.slice(0, 100) });
```

#### Correct

```ts
const payload = [timestamp, nonce, method.toUpperCase(), path, body].join("\n");
const signature = await hmacSha256(userBearerToken, payload);
logger.info("[logshare] stored", { fileId, ext, fileName, fileSize });
```

## Scenario: Browser Admin Cookie Session

### 1. Scope / Trigger

- Trigger: browser authentication uses an HttpOnly `synapse_token` cookie while admin routes and frontend guards still support explicit Bearer clients.
- Applies when changing admin route authentication, `AdminGuard`, browser session storage, or the auth cookie parser.

### 2. Signatures

- `getTokenFromRequest(req)` resolves an explicit `Authorization: Bearer <token>` first, then the `synapse_token` cookie.
- `POST /api/admin/verify-access` requires an authenticated administrator and validates the submitted `userId`, `username`, and `role` against the authenticated request user.
- Browser admin verification requests use `credentials: "include"`; an optional readable Bearer token may be sent for explicit injection paths.

### 3. Contracts

- Browser login must not require JavaScript access to the JWT. The HttpOnly cookie is the canonical browser credential.
- Admin middleware must accept both cookie and Bearer credentials, preserving Bearer support for non-browser callers.
- A missing cookie and missing Bearer credential -> authentication failure; a valid cookie-only admin session -> normal admin authorization flow.

### 4. Validation & Error Matrix

- Missing credentials -> HTTP 401.
- Invalid or expired cookie/Bearer JWT -> HTTP 401.
- Authenticated non-admin -> HTTP 403.
- Admin verification body differs from authenticated user -> HTTP 403.

### 5. Good/Base/Bad Cases

- Good: an administrator with only `synapse_token` loads `/admin`, and `AdminGuard` verifies access with `credentials: "include"`.
- Good: an explicit Bearer client continues to pass the same admin middleware.
- Base: a browser may also send a legacy/injected Bearer token; the server continues to prefer it before the cookie.
- Bad: frontend redirects to login because `getAuthToken()` is null even though the HttpOnly cookie exists.
- Bad: an admin router uses a Bearer-only middleware while the browser session is cookie-only.

### 6. Tests Required

- Middleware integration test: valid `synapse_token` cookie attaches the user and permits an admin verification route.
- Middleware integration test: valid Bearer token remains accepted.
- Regression coverage: missing credentials, invalid JWT, suspended account, and non-admin rejection remain unchanged.

### 7. Wrong vs Correct

#### Wrong

```ts
const token = getAuthToken();
if (!token) navigate("/login");
fetch("/api/admin/verify-access", {
  headers: { Authorization: `Bearer ${token}` },
});
```

#### Correct

```ts
const token = getAuthToken();
fetch("/api/admin/verify-access", {
  credentials: "include",
  headers: token ? { Authorization: `Bearer ${token}` } : undefined,
});
```
