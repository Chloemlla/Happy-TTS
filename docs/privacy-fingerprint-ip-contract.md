# Fingerprint / IP Privacy Contract

This document is the human-readable companion to [`privacy-data-map.json`](./privacy-data-map.json).
The JSON file is the source of truth for CI validation.

## Scope

Covered identifiers:

- browser/device fingerprints
- client IP addresses and related reputation signals
- account-linked login IP history
- temporary verification tokens that bind fingerprint + IP
- security/audit records that retain IP for accountability

Out of scope for this first contract:

- full account PII inventory
- third-party analytics product terms (Microsoft Clarity is noted only as a browser telemetry surface)

## Retention rules

| Dataset | Default retention | Enforcement today |
| --- | --- | --- |
| `user_datas.fingerprints` / `lastLoginIp` | Account lifetime | Deleted with user document |
| `tempfingerprints` | Minutes to 24h via `expiresAt` | Mongo TTL + cleanup API |
| `accesstokens` | Minutes via `expiresAt` | Mongo TTL |
| `ip_verification_tokens` | Minutes-hours via `expiresAt` | Mongo TTL |
| `ipbans` | Ban duration via `expiresAt` | Mongo TTL / admin revoke |
| `policy_consents` | `POLICY_CONSENT_VALIDITY_DAYS` (default 30d) | Mongo TTL + revoke API |
| `audit_logs` | 90 days | Mongo TTL on `createdAt` |
| `data_collections` | Optional via `DATA_COLLECTION_TTL_DAYS` | Optional TTL only |
| `tts_jobs` | Operational / unbounded today | **Gap** |
| `devicetrackings` | Account-linked / unbounded today | **Gap** |
| `ipqs_lookup_logs` | Operational / unbounded today | **Gap** |
| browser `localStorage` fingerprint cache | 30d client cache | Client-only |

## Delete contract

### Account delete (current)

`UserStorage.deleteUser` / `userService.deleteUser` removes the `user_datas` document, which includes:

- account fingerprint history
- fingerprint request flags
- last login IP/time

It does **not** currently cascade into:

- `tts_jobs`
- `data_collections`
- `devicetrackings`
- anonymous `tempfingerprints` rows that never bound a user id

Those gaps are intentional short-term acknowledgements, not approvals. Follow-up work should add a tested cascade or legal de-identification path.

### User-controlled delete / revoke

- Policy consent: `POST /api/policy/revoke`
- Auth session cookie: logout clears `synapse_token`
- Temporary fingerprints: expire automatically; admin can force cleanup

### Security retain-until-expiry

The following may outlive account deletion for integrity reasons and must expire by TTL or explicit admin action:

- IP bans
- audit logs (90d)
- short-lived challenge tokens already expired by design

## Export contract

| Audience | What can be exported | What must not be exported |
| --- | --- | --- |
| End user | Own TTS job status/history they can already access; analytics export for own usage when enabled | Raw IPQS responses, IP bans, other users' fingerprints, security tokens |
| Admin | User fingerprint summary, audit logs, ban records, temporary fingerprint stats | Password hashes, raw recovery secrets, signing keys |
| Automated privacy export (future) | Account profile + fingerprint history + owned job metadata | Ephemeral challenge tokens, third-party raw fraud payloads |

Current analytics export entrypoint: `GET /api/analytics/export` (authenticated).

## CI / verification

- `pnpm run check:privacy-contract` validates the JSON map shape and that cited evidence files exist.
- Mongo replica integration asserts TTL index creation semantics used by retention contracts.
- Browser cookie smoke verifies HttpOnly session cookie handling for identity-bearing requests.

## Long-term split / cleanup items

1. Cascade or de-identify `tts_jobs` and `data_collections` on account deletion.
2. Add retention job for `ipqs_lookup_logs` and `devicetrackings`.
3. Expose a single privacy export endpoint that reuses this map instead of ad-hoc admin views.
4. Clear browser fingerprint cache on logout when product UX allows.
