# NexAI B+C Request Signing (Backend) + Explicit Errors

## Goal
Implement server-side **nexai-sig-v2** verification (Token-bound B + App-secret C) on Synapse `/api/nexai`, layered with existing rate limits and JWT auth, and return **always-explicit error stage/code/message** so the NexAI client can show precise failure dialogs.

## Hard requirement (non-negotiable)
- Every rejected NexAI request returns JSON with non-empty `error`, stable `code`, and `stage`.
- Signature failures use `stage: "server_signature"` and codes `NEXAI_SIG_*`.
- Auth failures use `stage: "server_auth"` and existing/extended NexAI auth codes.
- Rate limits use `stage: "rate_limit"` with readable retry message when possible.
- Do not return opaque 500 bodies for expected client mistakes.

## What I Already Know
- Client currently sends soft `X-NexAI-Ts/Sig` deviceId HMAC that server cannot verify.
- Backend has `replayProtection` for main app (different headers/keys).
- NexAI routes already have per-route limiters and `nexaiAuthRequired`.
- Unauthenticated security report BLOCK trust issue was partially mitigated earlier.

## Requirements
1. Add `nexaiRequestSignature` middleware with `off|soft|enforce`.
2. Capture raw body for HMAC.
3. Key candidates: access token when Bearer present (required for signed authed routes); app secrets for gated anonymous routes; whitelist public GETs.
4. Nonce + timestamp drift checks.
5. Standard error envelope on signature and auth rejects.
6. Document path matrix in research.
7. Metrics/log reasons without leaking secrets.

## Acceptance Criteria
- [ ] PRD + research present (this task).
- [ ] Middleware + env documented.
- [ ] Enforce/soft/off behaviors implemented or stubbed with clear TODO only if phased—prefer real soft mode.
- [ ] All signature failures return `{success:false, error, code, stage}`.
- [ ] Client-readable codes listed in research match implementation.
- [ ] Public whitelist does not require signature.
- [ ] Authed routes prefer token-bound verification when Bearer present.

## Definition of Done
- Backend can soft-verify v2 signatures and return explicit errors.
- Research matrix + error catalog committed under this task.
- Follow-up client task consumes the same catalog.

## Out of Scope
- Full device attestation
- Main-app non-NexAI routes
- UI work (client task)
