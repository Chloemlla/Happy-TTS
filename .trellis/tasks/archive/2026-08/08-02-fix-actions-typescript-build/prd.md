# Fix GitHub Actions TypeScript Build Failures

## Goal

Restore the `main` branch GitHub Actions workflows by fixing the backend TypeScript build failure in the Fish Audio catalog response boundary, then continue addressing newly exposed failures from the resulting workflow runs until the relevant checks pass or an external/user-decision blocker is reached.

## Requirements

* Fix `TS18046` in `src/controllers/ttsProviderController.ts` without weakening the `unknown` input boundary.
* Preserve support for both Fish Audio response shapes already accepted by the controller: a top-level array and an object containing an `items` array.
* Preserve invalid-payload behavior: malformed records are ignored and a missing/non-array record collection produces an empty list.
* Do not change the public API response shape or unrelated TTS behavior.
* Do not modify or include the user's existing uncommitted frontend/email work.
* Do not install dependencies or run builds/tests locally; use GitHub Actions as the execution environment for verification.
* Commit and push each coherent CI repair, then inspect the new workflow result and continue fixing newly exposed failures.

## Acceptance Criteria

* [x] `records` has a statically known iterable array type after runtime validation.
* [x] Both supported upstream response shapes continue to normalize correctly.
* [x] Invalid upstream response shapes continue to normalize to an empty item list.
* [x] The fix is committed and pushed without unrelated dirty files.
* [x] The resulting GitHub Actions run no longer reports the original `TS18046` error.
* [x] Newly exposed Action failures are repaired iteratively until relevant workflows pass or a genuine external blocker is documented.

## Definition of Done

* Code is reviewed against backend type-boundary and quality guidelines.
* Verification is performed through GitHub Actions only.
* Each repair is committed with a conventional commit message and pushed to `origin/main`.
* No unrelated user changes are staged or committed.

## Technical Approach

Narrow the untrusted payload once to a local object view, then assign the validated array to an explicitly typed `unknown[]`. This preserves runtime validation and avoids relying on TypeScript to correlate two separate property-access expressions. Add or adjust a focused unit test only if an existing suitable test boundary is available without broadening the change unnecessarily.

## Decision (ADR-lite)

**Context**: TypeScript 6 does not retain the `Array.isArray` narrowing across the repeated `(payload as Record<string, unknown>).items` property access, so the conditional expression can resolve to `unknown`.

**Decision**: Store the object payload and its `items` value in stable local variables and explicitly model validated records as `unknown[]`.

**Consequences**: The compiler can prove iteration safety while individual catalog records remain untrusted and continue through `normalizeCatalogItem` validation. No cast to a trusted Fish Audio item type is introduced.

## Out of Scope

* Refactoring the wider TTS provider architecture.
* Changing Fish Audio API configuration or UI behavior.
* Fixing unrelated pre-existing workflow failures not surfaced by the repair runs for this task.
* Committing existing local changes in frontend or email modules.

## Technical Notes

* Failing workflow run: `Node and Rust Verification` run `30723251670`.
* The `Docker` run `30723251650` fails at the same backend TypeScript compile step.
* Original failure: `src/controllers/ttsProviderController.ts(54,24): TS18046: 'records' is of type 'unknown'`.
* Relevant project guidance: `.trellis/spec/backend/index.md` and `.trellis/spec/backend/quality-guidelines.md`.
* Repair commit: `0060f010972960555705e90ec70c8d31d7e3f4d9`.
* Verification run `30723745357` passed build, backend Jest coverage, frontend Vitest coverage, Rust verification, and `type-check`.
* Docker run `30723745335`, CodeQL run `30723745343`, Quality Guardrails run `30723745331`, and Code Quality run `30723745327` all passed.
