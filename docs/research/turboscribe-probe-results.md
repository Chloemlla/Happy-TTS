# TurboScribe.ai Infrastructure Probe Results

**Probed at:** 2026-07-21 (UTC ~12:50–12:54)  
**Method:** Public DNS lookups + short-timeout HTTP `HEAD`/`GET`/`OPTIONS` only  
**Constraints:** 5s timeout, ≤1 request per path (plus a small browser-UA follow-up set), no auth abuse, no large downloads, no hammering  
**Probe vantage:** Cloudflare edge `CF-RAY` region `SIN`  
**Raw machine output:** `docs/research/turboscribe-probe-raw.json` (first-pass HEAD sweep)

---

## Executive summary

| Host | DNS | Edge | Public behavior (no JS / no cookies / no auth) |
|------|-----|------|-----------------------------------------------|
| `turboscribe.ai` | Resolves (Cloudflare dual-stack) | Cloudflare | Most HTML/API-like paths **403 CF Managed Challenge**; a few static discovery paths **200** with browser UA |
| `www.turboscribe.ai` | Same A/AAAA as apex | Cloudflare | Same challenge pattern; `robots.txt` **200** |
| `api.turboscribe.ai` | Same A/AAAA as apex | Cloudflare | Challenge on `/`, `/api*`, `/health`, `/openapi.json`, etc.; no public OpenAPI |
| `app.turboscribe.ai` | Same A/AAAA as apex | Cloudflare | Same as apex/api for probed paths |
| `serve.leiferiksonventures.com` | Resolves (different CF IPs) | Cloudflare | **401** plain text `Invalid URL.` on all common paths (no challenge page) |

**Open public endpoints found (no auth, content returned):**

- `GET https://turboscribe.ai/robots.txt` → **200** `text/plain`
- `GET https://turboscribe.ai/__sitemap.xml` → **200** `text/xml` (sitemap; truncated read ≤1.5KB)
- `GET https://www.turboscribe.ai/robots.txt` → **200** `text/plain`

**Blocked / gated:**

- Cloudflare **403 + `cf-mitigated: challenge`** (“Just a moment…”) on most page/API-ish paths for `*.turboscribe.ai`
- Origin/auth gate **401 Invalid URL.** on `serve.leiferiksonventures.com` (no `WWW-Authenticate`, no CORS)

**Not exposed publicly in this probe:** `/openapi.json`, `/swagger`, `/docs`, `/graphql`, `/health`, `/api`, `/api/v1` (all challenge or 401).

---

## 1. DNS inventory

All five names resolve. No NXDOMAIN.

### `turboscribe.ai` / `www` / `api` / `app` (shared anycast)

| Record | Values |
|--------|--------|
| **A** | `104.20.30.226`, `172.66.172.123` |
| **AAAA** | `2606:4700:10::6814:1ee2`, `2606:4700:10::ac42:ac7b` |
| **CNAME** | none observed at query time (flattened at Cloudflare) |

`www`, `api`, and `app` share the **same Cloudflare A/AAAA set** as the apex → same CF zone / hostname fronting pattern.

### `serve.leiferiksonventures.com` (separate CF pool)

| Record | Values |
|--------|--------|
| **A** | `172.67.68.49`, `104.26.13.103`, `104.26.12.103` |
| **AAAA** | `2606:4700:20::681a:c67`, `2606:4700:20::681a:d67`, `2606:4700:20::ac43:4431` |

### Zone-level DNS (public)

| Domain | NS | MX | Notable TXT |
|--------|----|----|-------------|
| `turboscribe.ai` | `donald.ns.cloudflare.com`, `irena.ns.cloudflare.com` | Google Workspace (`aspmx.l.google.com` + alts) | SPF (`_spf.google.com`, `_spf.scw-tem.cloud`, `mailgun.org`); Google/Facebook/Ahrefs/Yandex/OpenAI domain verification |
| `leiferiksonventures.com` | **Same Cloudflare NS pair** | Same Google MX pattern | SPF (`_spf.google.com`, `_spf.scw-tem.cloud`); Google/Facebook verification |

**Inference:** TurboScribe and Leif Erikson Ventures share Cloudflare DNS management and similar mail stack. Likely same operator/org relationship (not proven ownership beyond DNS similarity).

---

## 2. HTTP surface by host

### Common transport notes

- **HTTP → HTTPS:** all five hosts return **301** to `https://<same-host>/` (Location header confirmed).
- **Server header:** `cloudflare` everywhere observed.
- **No `Access-Control-*` CORS headers** observed on successful or 401/403 responses in this probe (including OPTIONS, which still hit CF challenge or 401).
- **Timeouts:** a few SSL/timeout anomalies under 5s on isolated paths; treated as flaky edge behavior, not confirmed outages.

### 2.1 `turboscribe.ai`

| Path | Method | Status | Notes |
|------|--------|--------|-------|
| `/` | GET | **403** | `cf-mitigated: challenge`, body “Just a moment…”, `Server: cloudflare`, `CF-RAY: *-SIN` |
| `/api`, `/api/v1`, `/graphql`, `/health`, `/openapi.json`, `/swagger`, `/docs` | HEAD/GET | **403** | CF challenge (first-pass HEAD; GET confirms for sample set) |
| `/sitemap.xml` | GET | **403** | CF challenge (classic path name blocked; real sitemap is `__sitemap.xml`) |
| `/robots.txt` | GET | **200** | `text/plain; charset=UTF-8`, 68 bytes (see content below) |
| `/__sitemap.xml` | GET | **200** | `text/xml`, origin headers present (see below) |
| `/.well-known/security.txt` | GET | **404** | Origin SPA HTML 404 (`data-theme="scribe"`), not CF challenge |
| `/.well-known/openid-configuration` | GET | **404** | SPA HTML 404 |
| `/.well-known/apple-app-site-association` | GET | **404** | SPA HTML 404 |
| `/.well-known/assetlinks.json` | HEAD | timeout / inconsistent | Not confirmed open |
| `http://…/` | HEAD | **301** | → `https://turboscribe.ai/` |

**`robots.txt` body:**

```text
User-agent: *
Allow: /
Sitemap: https://turboscribe.ai/__sitemap.xml
```

**`__sitemap.xml` (truncated first ~1.5KB):** public marketing/app routes only, e.g.:

- `/`, `/login`, `/signup`, `/terms`, `/blog`, `/pricing`, `/privacy`, `/support`
- `/reset-password`, `/reviews`, `/free-tools`
- `/convert/wav-to-mp3`, `/convert/m4a-to-mp3`, `/convert/aac-to-mp3`, `/convert/flac-…`

No API base paths appeared in the truncated prefix.

**Origin fingerprints when CF allows through** (on 200/SPA 404):

| Header | Example / pattern |
|--------|-------------------|
| `x-pod` | `server-prod-deployment-b89cc8cfb-d98gn` / `…-d2vnf` |
| `x-pid` | numeric process id |
| `x-rt` | request timing (ms) |
| `x-tid` | `0` |
| `x-viewer` | large integer (on HTML 404s) |
| `cf-cache-status` | `DYNAMIC` |
| `Cache-Control` | `max-age=0, private` |
| `X-Content-Type-Options` | `nosniff` |
| Cookies (names) | `hwm-*`, `session-secret`, `i18n-activated-languages`, `snowflake`, `lev` |

Interpretation: Kubernetes-style pod names (`server-prod-deployment-…`) behind Cloudflare; Nuxt/SPA-like HTML with `data-theme="scribe"` and extensive `hreflang` alternates.

### 2.2 `www.turboscribe.ai`

| Path | Status | Notes |
|------|--------|-------|
| `/` and common API/docs paths | **403** CF challenge | Same as apex |
| `/robots.txt` | **200** | Body: `User-agent: *` / `Allow: /` (no Sitemap line; 23 bytes) |
| `/.well-known/*` (probed) | **404** (HEAD first pass) | |
| HTTP `/` | **301** → `https://www.turboscribe.ai/` | |

Same origin header family (`x-pod` `server-prod-deployment-b89cc8cfb-*`) on allowed responses.

### 2.3 `api.turboscribe.ai`

| Path | Status | Notes |
|------|--------|-------|
| `/`, `/api`, `/api/v1`, `/graphql`, `/health`, `/openapi.json`, `/swagger`, `/docs` | **403** CF challenge | No public API schema or health body obtained |
| `/robots.txt` | **404** | Empty body, origin headers still present (`x-pod`, etc.) |
| `/.well-known/*` (probed) | **404** | |
| `/sitemap.xml` | **403** | challenge |
| HTTP `/` | **301** → HTTPS | |
| OPTIONS `/` | **403** | challenge; no CORS ACAO |

**Conclusion for API host:** publicly reachable via DNS + TLS, but bot/automated clients get Cloudflare Managed Challenge before origin. No unauthenticated OpenAPI/Swagger/GraphQL/health document was obtainable in this passive probe.

### 2.4 `app.turboscribe.ai`

Same pattern as apex/api:

- **403** CF challenge on `/`, `/api*`, `/graphql`, `/health`, `/openapi.json`, `/swagger`, `/docs`, `/sitemap.xml`
- `/robots.txt` → **404** (origin)
- HTTP → HTTPS 301

### 2.5 `serve.leiferiksonventures.com`

Distinct behavior: **not** the CF browser challenge page for these paths.

| Path | Status | Body | Headers of note |
|------|--------|------|-----------------|
| `/`, `/api`, `/api/v1`, `/graphql`, `/health`, `/openapi.json`, `/swagger`, `/docs`, `/.well-known/*`, `/robots.txt`, `/sitemap.xml` | **401** | `Invalid URL.` (12 bytes, `text/plain; charset=UTF-8`) | `Server: cloudflare`, `CF-RAY`, `Nel` + `Report-To` (cf-nel) |
| OPTIONS `/` | **401** | same body | no CORS headers |
| HTTP `/` | **301** | → HTTPS | |

**Not observed:** `WWW-Authenticate`, `Access-Control-Allow-Origin`, origin `x-pod`/`x-pid` fingerprints, HTML challenge body.

**Interpretation:** host expects a **signed or path-specific URL** (CDN/media/signing gateway pattern). Generic paths are rejected as “Invalid URL” with 401 rather than 404. Compatible with a private file/serving edge for TurboScribe media (hypothesis only; not confirmed).

---

## 3. Status code matrix (HTTPS, simplified)

Legend: **C** = 403 Cloudflare challenge · **O** = 200 origin content · **4** = 404 · **U** = 401 Invalid URL · **T** = timeout/error in probe · **—** = not separately confirmed with browser UA

| Path | apex | www | api | app | serve.lev |
|------|------|-----|-----|-----|-----------|
| `/` | C | C | C | C | U |
| `/api` | C | C | C | C | U |
| `/api/v1` | C | C | C | C | U |
| `/graphql` | C | C | C | C | U |
| `/health` | C | C | C | C | U |
| `/openapi.json` | C | C | C | C | U |
| `/swagger` | C | C | C | C | U |
| `/docs` | C | C | C | C | U |
| `/robots.txt` | **O** | **O** | 4 | 4 | U |
| `/sitemap.xml` | C | C | C | C | U |
| `/__sitemap.xml` | **O** | — | — | — | — |
| `/.well-known/security.txt` | 4 (SPA) | 4 | 4 | 4 | U |
| `/.well-known/openid-configuration` | 4 (SPA) | 4 | 4 | 4 | U |

---

## 4. Security / edge observations (passive only)

1. **Cloudflare Managed Challenge** is the primary gate for `*.turboscribe.ai` interactive and API-ish routes (`cf-mitigated: challenge`, challenges.cloudflare.com CSP).
2. **Some static/discovery routes bypass the challenge** for a normal browser User-Agent (`robots.txt`, `__sitemap.xml`), exposing origin pod metadata headers.
3. **No public OpenAPI/Swagger/GraphQL introspection** endpoints responded with API documents.
4. **No CORS preflight success** for cross-origin automated clients in this probe.
5. **Cookie names** suggest session + anti-bot / fingerprinting (`session-secret`, `hwm-*`, `snowflake`, `lev`) — values not retained in this report.
6. **`serve.leiferiksonventures.com`** looks like an authenticated/signed URL service, not a public REST API root.
7. Shared CF NS between `turboscribe.ai` and `leiferiksonventures.com` supports org-level infrastructure linkage for documentation purposes.

---

## 5. Implications for API documentation research

| Goal | Result from this probe |
|------|------------------------|
| Discover public OpenAPI URL | **Not found** on common paths |
| Find public health/docs portals | **Blocked** by CF challenge or 401 |
| Map product surface without login | Use `__sitemap.xml` + marketing paths only |
| Identify backend hosting clues | CF edge + K8s pod names `server-prod-deployment-*` |
| Media/API secondary host | `serve.leiferiksonventures.com` exists but rejects bare paths |

**Recommended next steps (still non-abusive):**

1. Browser-session review of public docs/help/pricing for published API product pages (if any).
2. Capture authenticated app network traffic only under authorized research/ToS-compliant conditions.
3. Check public package registries / mobile clients / blog posts for documented base URLs (out of scope for this HTTP probe).
4. Do **not** attempt challenge-bypass, credential stuffing, or high-rate scanning.

---

## 6. Probe methodology notes

- Tools: PowerShell `Resolve-DnsName`, `HttpClient` / `Invoke-WebRequest`
- Timeouts: 5 seconds
- Rate: single request per path; ~200–300 ms spacing on follow-ups
- Body reads: capped (~1.2–1.5 KB) for allowed small text/xml only
- First-pass HEAD without browser UA often 403/404; follow-up GET used Chrome-like UA for representative public-client behavior
- No authentication, no form posts, no password or token attempts

---

## 7. File artifacts

| File | Purpose |
|------|---------|
| `docs/research/turboscribe-probe-results.md` | This human-readable report |
| `docs/research/turboscribe-probe-raw.json` | First-pass DNS + HEAD sweep serialization |
