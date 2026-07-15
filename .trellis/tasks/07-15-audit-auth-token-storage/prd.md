# Fix Auth Token Storage XSS Blast Radius

## Goal

Reduce the account-takeover blast radius created by browser-side auth token handling. Immediately eliminate full Bearer token logging and sensitive auth console output; then harden token storage/debug surfaces so XSS, shared devices, browser extensions, and remote log collection cannot trivially harvest reusable credentials.

## What I Already Know

* Audit finding (P0/High): `useAuth` logs full Bearer tokens when setting Authorization and during auth status checks.
* Tokens and multi-account sessions are stored in `localStorage` / `synapse_saved_accounts`.
* Fingerprint reporting also logs token prefixes and device signal payloads.
* JWT leakage equals current-user privilege; admin tokens are higher impact.
* Minimal fix from audit: delete all token-bearing `console.log`; keep only existence/length/hash-prefix and only in explicit debug builds.
* Better long-term fix (partially in-scope as stretch): HttpOnly/SameSite cookie or short-lived access + refresh tokens; frontend log redaction wrapper.

## Assumptions

* Full cookie/session redesign is desirable but may exceed one remediation PR; this task must at least remove leakage and add regression guards.
* Existing login/register/2FA/passkey UX and API routes should keep working.
* No dependency installation; no local test execution.

## Requirements

* Remove every production-path log that prints raw JWT, Authorization header, Bearer token, refresh token, or saved-account token material.
* Replace necessary auth debug output with non-sensitive metadata only (`hasToken`, length, maybe first 6 hash chars) and gate it behind an explicit debug flag/build.
* Audit and clean related frontend helpers (`useAuth`, fingerprint reporter, request interceptors, multi-account helpers) for token/password/secret logging.
* Document residual risk of `localStorage` under XSS and either:
  * implement a concrete storage hardening step in this task, or
  * explicitly leave cookie/refresh redesign as follow-up with rationale.
* Add a static guard if feasible without new deps (script, ESLint config tweak using existing tooling, or unit assertion) forbidding console args that contain token-like identifiers in auth paths.
* Preserve auth behavior: login, logout, multi-account switch, token attach, 401 handling.

## Acceptance Criteria

* [ ] No frontend auth path logs full Bearer/JWT/token strings in production builds.
* [ ] Auth interceptors still attach Authorization correctly without leaking the value.
* [ ] Multi-account save/load continues to function without logging secrets.
* [ ] Residual XSS/`localStorage` risk is either reduced by an implemented hardening step or documented as explicit follow-up in this PRD/task notes.
* [ ] A regression guard exists (static check and/or unit test) for token console leakage.
* [ ] Changes are committed and pushed.

## Definition of Done

* Sensitive auth logging removed or redacted.
* Behavior preserved for normal auth flows.
* Verification by static inspection / workflow only.
* Conventional commit created and pushed.

## Technical Approach

1. Inventory all token logs via search in `frontend/src/hooks/useAuth.ts`, fingerprint util, and related auth helpers.
2. Delete or redact logs; introduce a tiny redaction helper if multiple call sites need it.
3. Keep storage changes conservative unless cookie migration is clearly safe in-repo.
4. Add a lightweight regression check (existing Jest/ESLint path preferred).

## Decision (ADR-lite)

**Context**: Token logging is an immediate High-severity leak; full auth architecture migration is larger and riskier.

**Decision**: Ship non-negotiable log removal + redaction guards first. Treat HttpOnly/session redesign as stretch or follow-up unless implementation is already straightforward in current code.

**Consequences**: Fast risk reduction without destabilizing login. `localStorage` XSS exposure may remain until a later auth redesign.

## Out of Scope

* Full identity-provider rewrite.
* Backend JWT secret rotation (owned by config centralization child unless required here).
* Non-auth browser logging cleanup unrelated to credentials.

## Technical Notes

* Primary files: `frontend/src/hooks/useAuth.ts`, `frontend/src/utils/fingerprint.ts`
* Related: request interceptors, multi-account storage keys, any auth debug helpers
* Audit refs: finding "浏览器日志输出完整 Bearer token"; recommended fix order item 2
* Specs: `.trellis/spec/frontend/quality-guidelines.md`, `.trellis/spec/backend/security-boundary-contracts.md`
