# TurboScribe CDN Audio URL Analysis

**Status:** Research documentation only  
**Date:** 2026-07-21  
**Scope:** Theoretical path/auth analysis + HEAD-only probing (no full audio body download)  
**Subject host:** `serve.leiferiksonventures.com`

---

## 1. URL pattern under study

```
https://serve.leiferiksonventures.com/{path_segment_1}/{very_long_token}/{numeric_id}.mp3
```

### Segment interpretation (theoretical)

| Segment | Likely role | Notes |
|--------|-------------|--------|
| Host | Dedicated media/CDN front door | Subdomain of `leiferiksonventures.com` (TurboScribe corporate/parent entity) |
| `{path_segment_1}` | Namespace / route class / bucket key / signature scheme version | Short, stable path prefix; may encode media type, product area, or signing profile |
| `{very_long_token}` | Capability token / signed path blob | Base64url-like; length and charset consistent with HMAC/JWT/custom signed payload, not a short opaque file id alone |
| `{numeric_id}.mp3` | Object id + format extension | Numeric asset/job id; `.mp3` advertises audio/mpeg container for browsers and range clients |

**Not observed in the public pattern (from the stated browser capture):**

- Query-string AWS SigV4 (`X-Amz-Algorithm`, `X-Amz-Signature`, etc.)
- CloudFront canned-policy query params (`Expires`, `Signature`, `Key-Pair-Id`)
- Explicit `Authorization: Bearer …` header on the media request
- Session cookie required in the capture description (Referer + browser range/audio headers only)

That combination strongly favors **path-embedded signed URL / capability URL** auth, not pure cookie-session media auth and not classic CloudFront query-string signing.

---

## 2. Infrastructure classification

### 2.1 CDN / edge identity: Cloudflare (confirmed)

Live DNS and response headers (2026-07-21):

| Signal | Value |
|--------|--------|
| A records | `104.26.12.103`, `104.26.13.103`, `172.67.68.49` (Cloudflare anycast ranges) |
| AAAA | `2606:4700:20::…` (Cloudflare IPv6) |
| NS (apex) | `donald.ns.cloudflare.com`, `irena.ns.cloudflare.com` |
| `Server` | `cloudflare` |
| `CF-RAY` | present on all responses |
| `Report-To` / `Nel` | Cloudflare NEL reporting endpoints (`a.nel.cloudflare.com`) |
| TLS cert | `CN=leiferiksonventures.com`, issuer **Google Trust Services WE1** (common on Cloudflare Universal SSL / Google Trust Services chain) |

**Conclusion:** Edge is **Cloudflare**, not AWS CloudFront, Fastly, or Akamai as the public front door.

### 2.2 Origin / app hints (inferred)

HEAD/GET against the **serve** host returns minimal Cloudflare-framed responses (`401` / `500`) **without** the richer origin debug headers seen on the marketing apex:

On `https://leiferiksonventures.com/` (and similarly sparse responses for `turboscribe.ai` from this network), origin-style headers appeared:

- `x-pod: server-prod-deployment-…` (Kubernetes-style pod name)
- `x-pid`, `x-rt`, `x-tid`
- `cf-cache-status: DYNAMIC`
- short-lived `Set-Cookie: hwm-…` (HttpOnly Secure)

On `serve.leiferiksonventures.com`, those origin debug headers were **not** exposed on the probes below. That is consistent with either:

1. A **different Worker / service binding** on Cloudflare (media signer + storage gateway), or  
2. An origin that strips debug headers and only serves authorized object GETs, or  
3. Cloudflare Worker / R2 / custom media pipeline terminating auth at the edge.

**CloudFront is unlikely as the public URL layer** because:

- Host is Cloudflare-proxied (A/AAAA + NS + `Server: cloudflare`).
- No CloudFront query-string signature shape in the stated URL pattern.
- No `x-amz-*` / CloudFront policy markers in observed HEAD responses.

**Custom CDN / media gateway on Cloudflare** is the best fit:

- Corporate domain: Leif Erikson Ventures, LLC operates TurboScribe branding (site links TurboScribe; contact `@leiferiksonventures.com`).
- Dedicated `serve.` subdomain for media isolation (CORS, WAF, cache rules, token validation).

---

## 3. Path structure theory (signed URL model)

### 3.1 Pattern analogy

```
/{class}/{capability_or_signed_blob}/{object_id}.{ext}
```

Comparable industry patterns:

| Pattern | Similarity |
|---------|------------|
| Cloudflare signed URLs / Workers verify HMAC in path | High — edge Cloudflare + path token |
| GCS/Azure-style signed paths (custom) | Medium — long token segment |
| JWT-in-path (compact JWS base64url) | Medium — long base64url-like middle segment |
| AWS S3 pre-signed **query** URLs | Low — no query params in stated pattern |
| CloudFront signed cookies | Low — capture emphasizes path token, not cookie set |
| CloudFront signed URLs (query) | Low — no `Key-Pair-Id` / `Signature` query |

### 3.2 What the long token likely encodes

Without decoding a real production token (not available / not required for this research), a long base64url path segment typically binds some of:

- Object id / storage key (may match or salt `{numeric_id}`)
- Expiry (`exp` / `nbf`)
- Allowed HTTP methods / range policy
- Content-type or max size
- Tenant / user / workspace id (optional)
- HMAC or asymmetric signature over the above

**Implication:** Possession of the full URL is the capability (“bearer URL”). Anyone with the link can fetch until expiry/revocation — classic **capability URL** semantics.

### 3.3 Role of `{path_segment_1}`

Plausible interpretations (not mutually exclusive):

1. **Signing scheme / API version** (`v1`, `s`, etc.)
2. **Media class** (`audio`, `export`, `preview`)
3. **Storage namespace** or bucket alias
4. **Worker route key** selecting validation logic

Synthetic probes (invalid tokens) showed different status codes by path shape (see §5), which supports **route-aware handling** rather than a single static file server.

### 3.4 Role of `{numeric_id}.mp3`

- Human/API-stable asset reference (job id, transcript media id, export id).
- Extension helps:
  - Browser `<audio>` / media element sniffing
  - CDN cache key differentiation by format
  - Content-Disposition / Content-Type defaults on origin

The true object key in object storage may be hashed or namespaced; the numeric id can still be embedded in the signed payload.

---

## 4. Authentication model inference

### 4.1 What clients likely send (from browser capture)

| Header | Observed role |
|--------|----------------|
| `Referer: https://turboscribe.ai/` | First-party web player context; may be checked loosely for hotlink policy (not a secret) |
| `Range: bytes=0-` | HTML5 audio progressive download / seek bootstrap |
| `sec-fetch-dest: audio` | Browser media element fetch metadata |
| `accept-encoding: identity;q=1, *;q=0` | Prefer uncompressed bytes for media (predictable Content-Length / range maps) |
| Chrome `User-Agent` | Normal browser client |

No capture evidence of:

- `Authorization: Bearer …` on the media host
- Short-lived media cookie exclusive to `serve.*` as the primary secret
- Mutual TLS

### 4.2 Auth classification

| Mechanism | Likelihood | Rationale |
|-----------|------------|-----------|
| **Signed path / capability token in URL** | **High** | Long middle segment; no query SigV4/CloudFront params; media GETs from audio element |
| Cookie session on `serve.*` | Low–medium secondary | Possible soft checks; not required to explain pattern |
| Bearer JWT header | Low for media | Audio tags / range clients rarely attach custom Authorization |
| Open public CDN | Very low | Root returns `401`; invalid paths fail closed |

### 4.3 Likely issuance flow (API-reference oriented)

```
[Authenticated TurboScribe API / app session]
        │
        │  returns playback/export URL(s)
        ▼
https://serve.leiferiksonventures.com/{class}/{signed_token}/{id}.mp3
        │
        │  browser or client streams with Range
        ▼
[Cloudflare edge validates token → origin/R2/object store]
```

Clients should treat the returned URL as:

1. **Time-limited** (assume expiry until proven otherwise)
2. **Secret** (do not log full URLs in multi-tenant logs)
3. **Non-refreshable without API** (refresh = call TurboScribe API again)

---

## 5. HEAD-only probe results (no body download)

**Method:** `curl -sI` / PowerShell HEAD equivalents  
**Timeout:** 10s  
**Headers used:** Chrome UA, `Referer: https://turboscribe.ai/`, optional `Range: bytes=0-`, `sec-fetch-dest: audio`  
**Date:** 2026-07-21  
**Note:** No real production token was available; probes use **synthetic** paths only. Do not treat status codes for fake tokens as production success-path headers (`Content-Length`, `Accept-Ranges`, etc. for 200/206).

### 5.1 Summary table

| Request | HTTP status | Notable headers |
|---------|-------------|-----------------|
| `HEAD /` | **401** Unauthorized | `Content-Type: text/plain;charset=UTF-8`, `Server: cloudflare`, `CF-RAY`, `Nel`, `Report-To` |
| `OPTIONS /` (CORS preflight-ish) | **401** | Same family as root; `Content-Length: 12` on one OPTIONS response |
| `HEAD /a/b/123.mp3` | **500** | Cloudflare framing only (no rich origin headers) |
| `HEAD /media/{jwt-like}/12345.mp3` | **500** | Same |
| `HEAD /audio/{long}/1.mp3` | **500** | Same |
| `HEAD /v1/{long}/999.mp3` | **500** | Same |
| `HEAD /s/{long}/42.mp3` | **500** | Same |
| `HEAD /{long}/1.mp3` (2 segments + file) | **401** | Closer to root unauthorized behavior |
| `HEAD /files/1.mp3` | **401** | Unauthorized |
| Range on fake 3-segment path | **500** | No `Accept-Ranges` / `Content-Range` exposed on error |

### 5.2 Example raw response (root HEAD)

```http
HTTP/1.1 401 Unauthorized
Date: Tue, 21 Jul 2026 12:52:03 GMT
Content-Type: text/plain;charset=UTF-8
Connection: keep-alive
Report-To: {"group":"cf-nel", ... "a.nel.cloudflare.com" ...}
Nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
Server: cloudflare
CF-RAY: a1ea57317eadfda6-SIN
```

### 5.3 What we could **not** observe without a valid URL

On error responses, the following success-path headers were **not** returned (expected for 401/500):

- `Content-Type: audio/mpeg` (or similar)
- `Content-Length`
- `Accept-Ranges: bytes`
- `Content-Range`
- `ETag` / `Last-Modified`
- `Cache-Control` for media
- `cf-cache-status` (sometimes present on other hosts; not on these serve error frames)
- `x-amz-*`, `x-goog-*`, `x-ms-*` storage headers

**Research gap:** A valid signed URL HEAD would be required to document exact caching and range behavior. Browser capture already implies range support (`Range: bytes=0-` used by the player).

### 5.4 Probe interpretation

1. **Fail closed:** unauthenticated root → 401.  
2. **Three-segment media-shaped paths with garbage tokens → 500:** likely token parse/verify exception or origin error after route match (not a clean 403/404).  
3. **Non-media-shaped paths → 401:** suggests route gating before deep verification.  
4. **Edge identity consistent:** always `Server: cloudflare` + `CF-RAY`.  
5. **No evidence of open directory listing or anonymous media.**

---

## 6. Implications for API reference / client streaming

### 6.1 How clients likely stream audio

1. **Obtain URL from TurboScribe application/API** after user auth (session/JWT/cookie on `turboscribe.ai` app APIs — separate from media host).  
2. **Pass full absolute URL** to:
   - HTML5 `<audio src="…">` / `HTMLMediaElement`
   - `fetch()` / XHR with `Range` for custom players
   - Native mobile players (`AVPlayer`, ExoPlayer) via HTTPS URL  
3. **Do not re-attach app Bearer token** unless documented; path token is the media credential.  
4. **Prefer identity encoding** for media (`Accept-Encoding: identity`) so byte ranges map 1:1 to file offsets.  
5. **Support HTTP 206 Partial Content** when implementing custom streamers; browsers already send `Range`.  
6. **Handle expiry:** on 401/403/410, re-request a fresh signed URL from the app API rather than retrying the same media URL forever.

### 6.2 Suggested client pseudocode (reference only)

```http
GET /{path_segment_1}/{token}/{id}.mp3 HTTP/1.1
Host: serve.leiferiksonventures.com
Referer: https://turboscribe.ai/
Range: bytes=0-
Accept: audio/*,*/*
Accept-Encoding: identity
```

```text
Expected success (inferred, not HEAD-confirmed here):
  200 OK  or  206 Partial Content
  Content-Type: audio/mpeg
  Accept-Ranges: bytes
  Content-Length: <n>   | Content-Range: bytes a-b/n
```

### 6.3 Security / product notes for integrators

| Topic | Guidance |
|-------|----------|
| Secret handling | Treat full media URLs as credentials; redact in logs/metrics |
| Hotlinking | Referer may be soft-checked; do not rely on Referer as auth |
| Sharing | Capability URLs can be forwarded until expiry — product risk |
| Caching | CDN may cache authorized objects by URL; unique tokens may bust shared cache (by design) |
| CORS | Browser media element playback is often same-site or no-CORS media; custom `fetch` players may need CORS headers from `serve.*` (not verified here) |
| Reverse engineering | Do not attempt to forge tokens; issuance is server-side |

### 6.4 Mapping for Synapse research

If documenting third-party or competitive media delivery:

- **Pattern name:** Cloudflare-fronted **path-signed media CDN** under corporate domain  
- **Auth:** signed path capability token (primary), app session only for URL minting  
- **Client:** range-capable progressive MP3 stream  
- **Not:** public S3 bucket, not CloudFront query-string signed URL as the public form  

---

## 7. Entity context (non-technical)

- **Domain owner branding:** Leif Erikson Ventures, LLC (`leiferiksonventures.com`)  
- **Product association:** Site presents TurboScribe branding/link; `serve.` is a media subdomain under the same corporate DNS zone  
- **Public web search / social:** Little public technical documentation of `serve.leiferiksonventures.com` (no useful open docs found at research time)

---

## 8. Confidence & limits

| Claim | Confidence |
|-------|------------|
| Public edge is Cloudflare | **High** (DNS + headers + cert ecosystem) |
| Not public CloudFront hostname for this pattern | **High** |
| Auth is primarily path-embedded signed/capability token | **High** (pattern + fail-closed probes + browser capture headers) |
| Exact crypto (HMAC vs JWT vs custom) | **Low** (no real token decode) |
| Exact success headers (`Accept-Ranges`, cache TTLs) | **Unconfirmed** (no valid URL HEAD) |
| Storage backend (R2 vs S3 vs disk) | **Unknown** (no storage fingerprint headers on errors) |
| Whether Referer is enforced | **Unknown** (not A/B tested with valid asset) |

---

## 9. Reproduction commands (HEAD only)

```powershell
# Root — expect 401
curl.exe -sI --max-time 10 `
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" `
  -H "Referer: https://turboscribe.ai/" `
  -H "Accept-Encoding: identity;q=1, *;q=0" `
  "https://serve.leiferiksonventures.com/"

# Synthetic media-shaped path — expect non-200 (observed 500)
curl.exe -sI --max-time 10 `
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" `
  -H "Referer: https://turboscribe.ai/" `
  -H "Range: bytes=0-" `
  -H "sec-fetch-dest: audio" `
  "https://serve.leiferiksonventures.com/audio/INVALID_TOKEN/1.mp3"
```

**Do not** use `curl` without `-I`/`HEAD` against real large media URLs when the goal is header research only.

---

## 10. Summary

`serve.leiferiksonventures.com` is a **Cloudflare-fronted custom media host** for TurboScribe-related audio delivery under Leif Erikson Ventures infrastructure. The public URL shape

`/{path_segment_1}/{very_long_token}/{numeric_id}.mp3`

matches a **path-signed / capability-URL** design rather than cookie-primary media auth or CloudFront query-string signing. Clients mint URLs via the authenticated app/API, then stream with normal browser media/`Range` behavior. HEAD probes without a valid token fail closed (`401`/`500`) and confirm Cloudflare edge identity, but success-path media headers require a real signed URL for complete cache/range documentation.
