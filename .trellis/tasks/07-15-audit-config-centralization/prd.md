# Centralize Env Access and Fail-Fast Config

## Goal

Make runtime configuration a single fail-fast source of truth: remove unsafe default secrets, reduce scattered `process.env` reads, and ensure production boots only with explicit required security settings.

## What I Already Know

* Audit critical finding: frontend/backend share hardcoded request signing secret defaults (`frontend/src/utils/sign.ts`, `frontend/src/utils/requestSigner.ts`, `src/utils/sign.ts`, `src/middleware/replayProtection.ts`).
* `src/config/config.ts` already uses Zod and requires some production secrets (`JWT_SECRET`, `ADMIN_PASSWORD` patterns), which is a strength.
* `src/config/env.ts` still exposes many direct `process.env` reads with defaults (`PORT`, MySQL blanks, RP origins, Turnstile blanks, etc.).
* Consistency analysis flags Zod config vs scattered env access as a maintainability/security issue.
* Production missing signing secret currently can fall back to a public default, defeating replay/tamper protection.

## Assumptions

* Browser must not hold a long-lived shared HMAC secret; request signing design may need server-issued challenge or removal of client secret reliance.
* Some non-secret defaults (ports, model names) can remain, but security secrets must not.
* No dependency installs; schema work uses existing Zod.

## Requirements

* Eliminate production-usable default values for security-critical secrets:
  * `SIGN_SECRET_KEY` / request signing secrets
  * related integrity secrets if they participate in security decisions
  * ensure `JWT_SECRET` / `ADMIN_PASSWORD` fail-fast remains intact or stronger
* Stop shipping hardcoded signing secret literals in frontend bundles.
* Route security-relevant config reads through centralized config modules rather than ad hoc `process.env` in middleware/utils where practical.
* Production startup must fail clearly when required secrets are absent.
* Development/test ergonomics may use explicit test fixtures, not silent shared prod defaults.
* Document env vars operators must set after the change.
* Prefer a migration path that does not leave half-old default secret acceptance in production.

## Acceptance Criteria

* [ ] No shared hardcoded signing secret remains usable in production frontend/backend paths.
* [ ] Production boot fails fast without required secrets (at least signing + existing JWT/admin requirements).
* [ ] Security middleware/utils read secrets from centralized config rather than local defaults.
* [ ] Frontend bundle/static surfaces do not embed the old default secret literal.
* [ ] Operator-facing env documentation/comments updated for required keys.
* [ ] Changes committed and pushed.

## Definition of Done

* Config boundary is centralized and fail-fast for security secrets.
* Residual non-secret env defaults are acceptable and documented if kept.
* Conventional commit pushed.

## Technical Approach

1. Map all signing/integrity secret read sites.
2. Strengthen Zod schema and remove default secret branches.
3. Refactor frontend request signing away from shared secret or make it explicitly non-security-critical if replaced.
4. Reduce direct env reads in touched modules by exporting typed config values.

## Decision (ADR-lite)

**Context**: Hardcoded shared secrets make "signed requests" theater. Central config already exists but is incomplete.

**Decision**: Treat secret centralization + fail-fast as mandatory in this child; broader env cleanup is best-effort around touched files.

**Consequences**: Operators must set secrets explicitly; forged signed requests using public defaults stop working.

## Out of Scope

* Full 12-factor rewrite of every env var in the monorepo.
* Secret manager integrations (Vault/SM).
* Non-security performance tuning.

## Technical Notes

* Files: `src/config/config.ts`, `src/config/env.ts`, `src/utils/sign.ts`, `src/middleware/replayProtection.ts`, `frontend/src/utils/sign.ts`, `frontend/src/utils/requestSigner.ts`, `frontend/src/utils/integrityCheck.ts`
* Audit refs: critical signing-secret finding; Configuration Safety Analysis; principles 9.1/9.2
* Specs: `.trellis/spec/backend/security-boundary-contracts.md`
