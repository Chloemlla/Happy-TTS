# Bilibili Settings Sync Contract

This is the Synapse side of the cross-repository contract. PiliPlus uses the
authenticated `/api/bilibili-sync` routes below.

## Required security gates

`bilibili-settings` synchronization is unavailable until the client is logged
in to Bilibili and the backend has verified that login.

- No Bilibili login means no bind request, no settings upload, and no settings
  download for this category.
- `POST /api/bilibili-sync/uid` accepts a cookie and a claimed UID only during
  binding.
  The backend must call Bilibili's authenticated identity endpoint, reject an
  invalid/expired cookie, and reject any UID mismatch.
- The backend must not trust a client-provided login flag, nickname, or UID as
  the validation result.
- Recommended errors: `BILIBILI_AUTH_REQUIRED`, `BILIBILI_COOKIE_INVALID`,
  and `BILIBILI_UID_CONFLICT`. Errors must not echo upstream bodies or cookie
  values.

## Compatible API envelope

```http
POST /api/bilibili-sync/uid
Authorization: Bearer <app-managed-session-token>
Content-Type: application/json
```

```json
{
  "uid": "12345",
  "cookie": "SESSDATA=temporary-value; bili_jct=temporary-value"
}
```

Success returns verified identity and capability only:

```json
{
  "success": true,
  "data": {
    "bound": true,
    "uid": "12345",
    "boundAt": "2026-08-01T00:00:00.000Z"
  }
}
```

After binding, settings use `GET/PUT /api/bilibili-sync/settings`; search
history uses `POST /api/bilibili-sync/search-records/batch` and
`GET /api/bilibili-sync/search-records/changes?since=<ISO-8601>`. The validated
Cookie is retained only as AES-GCM ciphertext in the dedicated credential
archive. It is never returned or placed in settings/search payloads.

## Serialization and conflict rules

- Settings use `baseVersion`; a stale write returns HTTP 409 and an opaque
  summary. Search records are deduplicated by normalized keyword and retain
  tombstones for incremental reads.
- Conflict entries contain only category, record ID, and timestamps. They do
  not contain decrypted settings, cookies, or upstream Bilibili responses.
- Revoking the binding or losing Bilibili login disables later writes until a
  new bind validation succeeds.

## Privacy and logging contract

The bind cookie is request-scoped transient input:

1. Accept it only over TLS.
2. Use it only for the upstream validity/UID check.
3. Encrypt it with the server credential key and persist only the ciphertext,
   IV, authentication tag, and key version in the dedicated archive. Never
   persist plaintext in sync fields, files, caches, analytics, audit metadata,
   crash reports, or responses.
4. Never log `Cookie`, `Set-Cookie`, `SESSDATA`, `bili_jct`, `DedeUserID`, or
   the raw bind body. Redact these keys and values in logger context and
   exception serialization.
5. Do not use cookies as metrics labels or test snapshot data.

The UID is an identifier rather than a secret, but it must be limited to the
verified bind result and metadata needed for record routing. Settings export
and import must exclude cookies and must not recreate a Bilibili session from
an imported UID.

## Contract tests

PiliPlus authenticates via the OAuth 2.0 authorization code flow with PKCE (S256).
The `piliplus` public client is built into the OAuth service. The authorization
request is handled by Synapse-Client (Android) as an OAuth authorization
intermediary, or directly via the web OAuth flow. After authorization, PiliPlus
exchanges the code for an access token at `POST /api/oauth/token` and uses it
to call the Bilibili sync API. No JWT paste field is required.
`tests/bilibili-settings-sync-contract.test.js` checks login gating, cookie
validity and UID equality, cookie-free serialization/response/conflict
metadata, and ciphertext-only archive metadata. Service-level tests cover
revalidation, unbind cleanup, version conflicts, deduplication, and
tombstones.
