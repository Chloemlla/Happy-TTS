# Journal 1

## Session: NexAI sig-v2 wrap-up

**Date**: 2026-07-18
**Task**: 07-18-nexai-sig-v2-wrapup
**Branch**: `main`

### Summary

Closed remaining backend gaps for nexai-sig-v2 after the soft middleware MVP: method-aware public exemptions, staged auth/rate-limit error envelopes, unit tests, and contract docs.

### Main Changes

- `nexaiRequestSignature`: GET/HEAD-only exemptions (oauth-config, github callback, release manifest, public artifact read)
- `nexaiAuth`: `sendNexaiError` with `success/stage:server_auth`
- NexAI `createLimiter` payloads: `success/code/stage:rate_limit`
- Unit tests: soft/enforce, token HMAC, refreshToken, drift, replay, exemptions
- Docs: `BACKEND_INTEGRATION_CONTRACT.md` + security boundary contracts

### Git Commits

| Hash | Message |
|------|---------|
| `5baba9cd` | fix: finish NexAI sig-v2 error envelopes and exemptions |

### Testing

- Local package install/test commands are prohibited by repo guidelines; unit test file added for CI/GitHub workflow verification.

### Status

[OK] Implementation committed and pushed

### Next Steps

- Production enforce flip + app secret provisioning (out of scope)
- Optional full controller envelope rewrite
