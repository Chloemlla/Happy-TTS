# Standardize Command/LogShare Logging and Password Gates

## Goal

Close privacy and operability gaps in Command Manager and LogShare by eliminating sensitive content logging, replacing weak crypto where required, and standardizing admin password-gate checks + structured logging.

## What I Already Know

* Audit P0/High LogShare finding:
  * upload path logged `content.slice(0, 100)` preview historically (verify current code before edit)
  * encrypt helper used static salt + PBKDF2(10000) + AES-256-CBC without auth tag
  * admin password validation path previously used noisy console logging
* Current `src/routes/logRoutes.ts` already uses `logger` in some password-check paths and `isAdminOperationPasswordValid`.
* `src/routes/commandRoutes.ts` still uses many `console.log` traces around password failure, token length, IV hex, encryption steps, and response sizes.
* Command routes gate admin operations with `authenticateToken` + `isAdminOperationPasswordValid(password)` and custom AES-CBC packaging for queue export.
* Weak CBC designs and verbose crypto logs increase both leakage and operational noise.

## Assumptions

* Admin password gate UX can remain password-in-body for now; the task standardizes validation/logging, not a full auth redesign.
* Existing encrypted clients may depend on ciphertext shape; crypto upgrades must include versioning/backward-compat strategy or coordinated client updates.
* No dependency installation; use Node crypto builtins.

## Requirements

* LogShare:
  * ensure upload/list/download paths never log raw log content previews, tokens, or passwords
  * upgrade encryption to AEAD (AES-GCM or equivalent), random salt/IV, stronger KDF params, and a version field
  * keep or add tests/assertions that tampered ciphertext fails
* Command manager:
  * replace ad hoc `console.log` crypto/password traces with structured logger calls
  * never log password, IV secrets, raw tokens, or plaintext command payloads
  * standardize password gate failure responses and authz checks via shared helper patterns
* Shared ops hygiene:
  * reuse `isAdminOperationPasswordValid` / common admin gate utilities rather than divergent copies
  * log requestId/result/reason metadata only
* Preserve route paths and admin workflows unless a crypto version bump requires documented client changes.

## Acceptance Criteria

* [ ] LogShare does not write uploaded content previews or secrets to logs.
* [ ] LogShare encryption is AEAD-based with random salt and explicit versioning (or a documented transitional dual-read strategy).
* [ ] Command routes no longer emit verbose console crypto/password traces.
* [ ] Admin password gates behave consistently and fail closed.
* [ ] Regression coverage exists for "no content preview in logs" and "tamper fails decrypt" where test harness allows.
* [ ] Changes committed and pushed.

## Definition of Done

* Command/LogShare ops paths are quieter, safer, and consistent.
* Crypto/privacy risks from the audit are remediated or explicitly deferred with strong reason.
* Conventional commit pushed.

## Technical Approach

1. Re-read current `logRoutes.ts` / `commandRoutes.ts` and shared password util.
2. Remove content/secret logs first (quick win).
3. Implement versioned AEAD encrypt/decrypt for LogShare; migrate readers carefully.
4. Normalize command route logging and password gate responses.
5. Add focused unit tests around crypto + logging spies.

## Decision (ADR-lite)

**Context**: These routes handle admin credentials and potentially secret-bearing user logs; console noise and CBC are unjustified.

**Decision**: Treat privacy log removal as immediate and crypto upgrade as in-scope for LogShare; command route crypto may be hardened if shared helpers make it cheap, otherwise standardize logging/gates first.

**Consequences**: Safer ops defaults; possible need to support one crypto version transition for clients.

## Out of Scope

* Building a full enterprise SIEM pipeline.
* Replacing admin password gates with WebAuthn-only.
* Non-admin logging refactors across the entire backend.

## Technical Notes

* Files: `src/routes/logRoutes.ts`, `src/routes/commandRoutes.ts`, `src/utils/adminOperationPassword.ts`, related logger helpers
* Audit refs: LogShare P0 finding; observability note about console.log bypass; command password-gate noise observed in source
* Specs: `.trellis/spec/backend/logging-guidelines.md`, `.trellis/spec/backend/security-boundary-contracts.md`
