# Harden Compose Internal Service Token Defaults

## Goal

Make Docker Compose sidecar deployments fail fast when `INTERNAL_SERVICE_TOKEN` is missing, aligning Compose defaults with Rust worker requirements and hybrid deployment docs so misconfiguration is caught before runtime 401/503 cascades.

## What I Already Know

* Audit finding (P1/Medium): Compose sets `INTERNAL_SERVICE_TOKEN=${INTERNAL_SERVICE_TOKEN:-}` on app and Rust sidecar services, defaulting to empty string.
* Rust workers (`network-tools`, `audio-worker`, `file-worker`, `security-worker`) reject empty token at config load.
* Node config also requires token when external Rust services are enabled and embedded mode is disabled.
* Docs in `docs/rust-node-hybrid-deployment.md` already require an explicit shared token for sidecar mode.
* Embedded single-container mode may still generate/use a temporary token and should not be broken.

## Assumptions

* Sidecar profile must never silently accept empty internal tokens.
* Existing deployments that already set the env var remain valid.
* No dependency installation; no local compose up unless user later asks; static file/config validation is enough.

## Requirements

* Replace empty-default Compose interpolation with required-variable syntax for sidecar-facing services, e.g. `${INTERNAL_SERVICE_TOKEN:?set INTERNAL_SERVICE_TOKEN for rust sidecars}`.
* Ensure app service and all external Rust sidecar services share the same required token contract.
* Preserve embedded/single-container path behavior where a generated or process-local token is valid.
* Update deployment docs/examples if they still show empty defaults or omit the required variable.
* Prefer clear operator error messages over late container crash loops.
* Add or document a CI/static validation approach for compose config rendering with and without the token (no local execution required now).

## Acceptance Criteria

* [ ] Compose sidecar services no longer default `INTERNAL_SERVICE_TOKEN` to empty string.
* [ ] Missing token produces an early, clear Compose/config failure for sidecar profile.
* [ ] With token set, service env rendering remains consistent across Node and Rust sidecars.
* [ ] Embedded mode is not forced into a broken required-token path if previously allowed without operator token.
* [ ] Docs match the fail-fast contract.
* [ ] Changes committed and pushed.

## Definition of Done

* Compose defaults match Rust/Node security expectations.
* Docs and config are consistent.
* Static verification complete; conventional commit pushed.

## Technical Approach

1. Update `docker-compose.yml` env entries for app + rust sidecars.
2. Cross-check Node config validation and Rust config error paths for message clarity.
3. Align hybrid deployment docs.
4. Optionally add a workflow note/script later for `docker compose config` matrix.

## Decision (ADR-lite)

**Context**: Code and docs already require non-empty internal tokens, but Compose hides the mistake until containers start.

**Decision**: Fail at Compose interpolation/config time for sidecar mode; keep embedded mode flexible.

**Consequences**: Operators must set one env var for sidecar deploys; startup failures become immediate and obvious.

## Out of Scope

* Redesigning service mesh / mTLS between Node and Rust.
* Rotating existing production tokens (ops action outside this code task).
* Non-token Compose reliability issues.

## Technical Notes

* Files: `docker-compose.yml`, Rust `*/src/config.rs`, `src/config/config.ts`, `docs/rust-node-hybrid-deployment.md`
* Audit refs: finding "Compose sidecar 默认空内部 token"; quick win "Compose token 使用 `${VAR:?message}`"
