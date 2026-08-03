# Auth Device Session Contract

## Scope

This contract covers Synapse account sessions created by password login, TOTP/passkey completion, Google/Linux.do provider login, mobile login client tokens, and Synapse OAuth token issuance. It is intentionally backend-only; clients must call these APIs and must not place a Synapse JWT in an OAuth redirect URI.

## Session model

- Every issued Synapse JWT, mobile client login token, and OAuth access token creates an `AuthSession` record keyed by a server-side credential hash.
- Sessions are grouped by `deviceKey`, derived from `userId + clientType + deviceId/userAgent`.
- Device records expose `deviceName`, `platform`, `clientType`, `recentActivityAt`, `ip`, `ipLocation`, `current`, `revoked`, and nested `sessions`.
- JWT and OAuth protected middleware fail closed when the credential has no active session row or when the row was revoked.
- The built-in public `piliplus` client is provisioned on first authorization with the fixed `piliplus://synapse-auth` redirect and the `bilibili:sync` scope.

## APIs

### `GET /api/auth/sessions`

Authentication: current Synapse JWT via HttpOnly cookie or `Authorization: Bearer`.

Response `200`:

```json
{
  "success": true,
  "devices": [
    {
      "deviceKey": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "deviceId": "android-device-id",
      "deviceName": "Pixel 9",
      "platform": "Android",
      "clientType": "Synapse-Client",
      "recentActivityAt": "2026-08-03T12:00:00.000Z",
      "ip": "203.0.113.10",
      "ipLocation": "测试属地",
      "current": true,
      "revoked": false,
      "sessions": []
    }
  ]
}
```

### `POST /api/auth/sessions/:deviceKey/revoke`

Authentication: current Synapse JWT.

Behavior:

- Web devices revoke all non-current sessions under that `deviceKey`.
- PiliPlus, Synapse-Client, and other non-web devices revoke all sessions under the client/device group, including mobile client login tokens and OAuth access/refresh tokens created from that group.
- The current session is protected and returns `409` with `code: "CURRENT_SESSION_PROTECTED"`.

Response `200`:

```json
{ "success": true, "revoked": 3 }
```

### Profile device management

`GET /api/admin/user/profile/devices` returns the same active device groups for
the current Profile session. `POST
/api/admin/user/profile/devices/:deviceKey/revoke` additionally requires the
short-lived `verificationToken` issued by
`POST /api/admin/user/profile/verify`. The current Profile device is marked
`current: true` and is rejected by the server even when a caller supplies its
device key.

## Mobile OAuth authorization

Protected mobile aliases are available for Synapse-Client PKCE flows:

- `GET /api/oauth/authorize/mobile/preview`
- `POST /api/oauth/authorize/mobile/approve`
- `POST /api/oauth/authorize/mobile/deny`

They use the same current Synapse JWT authentication as `/api/oauth/authorize/preview` and `/api/oauth/authorize`. Clients submit `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, and `code_challenge_method`; approval/denial is conveyed in the JSON body. JWTs are accepted only in headers/cookies, never in redirect URIs.

PiliPlus requests the public-client `bilibili:sync` scope. The Bilibili sync routes accept either the current Synapse JWT or an OAuth access token carrying that scope; the latter is still bound to the authenticated Synapse user.

## Required client metadata

Clients should send these optional fields when available:

- Headers: `X-Device-Id`, `X-Device-Name`, `X-Platform`, `X-Client-Name`.
- JSON body alternatives: `deviceId`, `deviceName`, `platform`, `clientType`.

Missing metadata falls back to user agent and server-observed IP.
