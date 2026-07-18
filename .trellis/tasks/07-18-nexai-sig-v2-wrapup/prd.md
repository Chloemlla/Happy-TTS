# NexAI sig-v2 Wrap-up

## Goal
Close remaining backend gaps for **nexai-sig-v2** after the MVP soft middleware landed: explicit error envelopes on auth/rate-limit rejects, method-aware public path exemptions, focused middleware tests, and contract docs that match the implemented protocol.

## Background
- `nexaiRequestSignature` already implements soft/enforce/off, B+C keys, refreshToken signing, rawBody capture, and `server_signature` envelopes.
- Archived task `07-17-nexai-request-signing-bc` marked MVP done, with follow-ups around enforce rollout and client dialog coverage.
- Remaining Synapse gaps:
  1. `nexaiAuth*` rejects omit `success`/`stage`.
  2. NexAI route limiters omit `stage: rate_limit` / stable code.
  3. Artifact path exemption is method-agnostic (would skip signatures on PATCH/DELETE under enforce).
  4. Browser OAuth callback cannot sign.
  5. No unit tests for sig-v2 middleware.
  6. `docs/BACKEND_INTEGRATION_CONTRACT.md` still describes legacy device-derived HMAC.

## Requirements
1. Auth rejects on NexAI middleware use the shared envelope: `success:false`, non-empty `error`, stable `code`, `stage:"server_auth"` (keep `message` when already present for compatibility).
2. NexAI local limiters return `success:false`, `code:"NEXAI_RATE_LIMIT"`, `stage:"rate_limit"`, plus existing `retryAfter`/`error`.
3. Signature exemption is method-aware:
   - exempt GET/HEAD only for: `oauth-config`, `github/callback`, release manifest, public artifact shortId
   - do **not** exempt PATCH/DELETE/POST management on artifact paths
4. Keep soft default; do not force production enforce in this task.
5. Add unit tests for soft/enforce missing headers, valid bearer HMAC, invalid HMAC, timestamp drift, nonce replay, refreshToken key, public GET exempt, and non-GET artifact not exempt under enforce.
6. Update integration contract + security boundary docs for nexai-sig-v2 headers/canonical string/env flags.

## Acceptance Criteria
- [x] Auth middleware reject payloads include `stage: server_auth` and `success: false`.
- [x] NexAI route limiter 429 payloads include `stage: rate_limit` and `code: NEXAI_RATE_LIMIT`.
- [x] Public GET artifact is signature-exempt; mutating artifact routes are not.
- [x] GitHub OAuth callback GET is signature-exempt.
- [x] Unit tests cover soft vs enforce signature outcomes.
- [x] Docs describe v2 protocol instead of unverifiable device HMAC as the trust root.
- [ ] Commit + push after changes.

## Out of Scope
- Client dialog wiring (NexAI app repo)
- Production enforce flip / CI secret provisioning
- Full controller error-envelope rewrite beyond auth/rate-limit/signature path
- Device attestation / per-device secret issuance redesign

## Definition of Done
Backend error stages for signature/auth/rate-limit are consistent enough for client dialogs; exemptions are safe for enforce; tests and docs match implementation.
