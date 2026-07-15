# Tighten Type Boundaries on High-Risk Any Usage

## Goal

Restore compile-time contracts at the highest-risk TypeScript boundaries by replacing untyped `any` with precise DTOs/`unknown` narrowing, focusing on user storage, generation records, Passkey/admin forms, and API response wrappers.

## What I Already Know

* Audit finding (P2/Medium): `any` weakens validation at storage and security UI boundaries.
* Evidence hotspots:
  * `src/utils/userStorageProvider.ts` interface methods returning/accepting `any`
  * `src/services/userGenerationStorage/mongo.ts` sanitize/find/add helpers using `any`
  * `src/services/mongoService.ts` `mongooseOptions: any`
  * `frontend/src/components/UserManagement.tsx` `catch (e: any)`, `passkeyResponse: any`
  * `frontend/src/components/UserProfile.tsx` `ApiResponse<T = any>`
* Risk: field renames, missing permission fields, and sensitive overwrites escape compile-time checks.

## Assumptions

* Full-repo `any` eradication is not required; prioritize security/data-integrity boundaries.
* Existing runtime validators (Zod/manual checks) should be aligned with new types, not duplicated poorly.
* No dependency installation; typecheck verification is CI/static.

## Requirements

* Define precise types/DTOs for:
  * User storage provider inputs/outputs
  * TTS/user generation records
  * Passkey/admin response objects used in management UI
  * shared API response wrapper defaults (avoid `T = any` default where feasible)
* Replace `catch (e: any)` with `unknown` + narrowing in touched security UI paths.
* Prefer shared types over local structural `any` casts; if cast is temporarily needed, isolate and comment why.
* Do not broadly disable TypeScript checks or introduce `as any` as a "fix".
* Keep runtime behavior identical unless a type fix reveals an actual bug; if a bug is found, fix conservatively and note it.

## Acceptance Criteria

* [ ] UserStorageProvider no longer exposes broad `any` in its public method signatures (or has a documented transitional typed facade).
* [ ] Generation storage helpers used in persistence paths are typed or narrowed.
* [ ] Touched frontend security forms/passkey paths avoid new/kept `any` where replaced.
* [ ] API response generics do not default to `any` in updated shared wrappers.
* [ ] No intentional behavior regressions.
* [ ] Changes committed and pushed.

## Definition of Done

* High-risk boundaries have real types.
* Residual `any` debt outside scope is listed if still present.
* Conventional commit pushed.

## Technical Approach

1. Start from interfaces (`UserStorageProvider`, API response types) so implementations are forced to follow.
2. Introduce DTOs near models/services; update call sites incrementally.
3. Convert catch blocks and passkey responses in the same admin/profile files if already touched.
4. Prefer compile-time failures over silent casts.

## Decision (ADR-lite)

**Context**: Repo-wide typing cleanup is multi-day; audit value concentrates on storage/auth boundaries.

**Decision**: Bound the task to high-risk seams named in the audit, not every `any` in the monorepo.

**Consequences**: Maximum safety gain per diff; remaining `any` elsewhere stays backlog.

## Out of Scope

* Generated OpenAPI client overhaul.
* Replacing all backend service internals with branded types.
* Enabling maximally strict tsconfig flags that break unrelated packages.

## Technical Notes

* Files listed in audit evidence above
* Specs: `.trellis/spec/frontend/type-safety.md`, `.trellis/spec/backend/quality-guidelines.md`
* Audit refs: finding "`any` 类型边界削弱验证与契约"
