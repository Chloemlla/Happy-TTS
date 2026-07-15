# Synapse Full Audit Remediation

## Goal

Systematically remediate the confirmed high-risk findings from `audit-report-Synapse-2026-07-05.md` so Synapse regains trustworthy security boundaries, reproducible release tooling, and maintainable admin/auth surfaces without expanding product scope.

This parent task coordinates ten child remediation streams. Implementation should proceed child-by-child, preferring immediate P0/P1 security and release fixes before larger maintainability refactors.

## What I Already Know

* Source of truth: root audit report `audit-report-Synapse-2026-07-05.md` (full mode, 2026-07-05).
* Parent task already exists as `07-15-full-audit-remediation` with ten children linked in `task.json`.
* Confirmed top risks include:
  * shared/hardcoded request signing secrets
  * full Bearer token browser logging and localStorage blast radius
  * LogShare content preview logging and weak CBC encryption
  * CI mutable action refs / PAT writeback and non-reproducible toolchains
  * Compose empty `INTERNAL_SERVICE_TOKEN` defaults for Rust sidecars
  * health endpoint over-disclosure
  * oversized admin/UI/backend modules
  * high-risk `any` type boundaries
  * `forceExit` and mock-heavy tests
  * scattered env access / weak fail-fast config
  * frontend server-only dependency weight
  * Command/LogShare password-gate and logging inconsistency
* Project constraints from repository guidelines:
  * do not install dependencies
  * do not run local build/test; verification is GitHub workflow / static inspection
  * after each completed feature change, create a conventional commit and push
  * English identifiers and docs in code

## Child Task Map

| Order | Child task | Priority intent | Primary risk |
|-------|------------|-----------------|--------------|
| 1 | `07-15-audit-auth-token-storage` | P0/P1 security | Bearer token logs + XSS blast radius |
| 2 | `07-15-audit-command-logshare-ops` | P0 security/privacy | LogShare preview logs, weak crypto, password-gate noise |
| 3 | `07-15-audit-config-centralization` | P0/P1 config safety | hardcoded signing secret defaults, scattered `process.env` |
| 4 | `07-15-audit-ci-supply-chain` | P0/P1 release | mutable actions, PAT writeback, unpinned tools |
| 5 | `07-15-audit-compose-internal-token` | P1 stability | empty internal service token defaults |
| 6 | `07-15-audit-health-disclosure` | P1 security/ops | health payload info disclosure |
| 7 | `07-15-audit-test-authenticity` | P1 testing | `forceExit`, over-mocking, weak signals |
| 8 | `07-15-audit-frontend-deps` | P2 supply-chain/perf | server-only packages in frontend manifest |
| 9 | `07-15-audit-type-boundaries` | P2 maintainability | high-risk `any` at storage/auth boundaries |
| 10 | `07-15-audit-split-god-files` | P2 maintainability | oversized UI/admin modules |

## Requirements

* Track and complete remediation through the ten child PRDs; parent PRD is the orchestration and acceptance umbrella.
* Preserve existing product APIs and user-visible business behavior unless a security fix requires a deliberate, documented contract change.
* Prefer minimal, reversible diffs first (delete secret logs, fail-fast missing config, pin CI) before multi-day refactors.
* Keep security fixes default-on in production; debug-only behavior must be explicit and non-leaky.
* Each child must leave behind enough static checks, docs, or tests to prevent silent regression.
* Do not install packages and do not run local full build/test suites.

## Acceptance Criteria

* [ ] All ten child tasks have concrete PRDs with goals, requirements, acceptance criteria, and out-of-scope boundaries.
* [ ] Security P0 items from the audit are either remediated by children or explicitly deferred with reason in child PRD notes.
* [ ] Parent related files and status stay coherent as children complete.
* [ ] No child expands into unrelated product feature work.
* [ ] Final remediation leaves clearer security boundaries, more reproducible release config, and reduced maintenance blast radius.

## Definition of Done

* Parent and child PRDs are complete and actionable for implementation agents.
* Child work is completed and committed independently where practical.
* Residual risks, if any, are listed under parent notes with severity and next step.
* Verification remains workflow/static-inspection based per project constraints.

## Technical Approach

1. Use the audit report as the evidence baseline; re-verify file paths before editing because the tree may have drifted.
2. Implement children in the order above unless a dependency forces reordering (for example, config centralization may unblock signing-secret fixes).
3. For each child: update relatedFiles in `task.json` when real files are touched, keep commits conventional, push after finished changes.
4. Prefer shared helpers (logger redaction, password-gate util, config schema) over copy-paste fixes.

## Decision (ADR-lite)

**Context**: The audit contains more findings than one implementation PR should absorb. Some items are 15-minute wins; others need multi-day modularization.

**Decision**: Keep one parent coordination task and ten scoped children. Ship security/release fail-fast fixes before large file splits and type cleanups.

**Consequences**: Progress is reviewable and bisectable. Parent acceptance depends on children, not on a single mega-diff.

## Out of Scope

* New product features unrelated to audit remediation.
* Full rewrite of auth to OAuth-only, full monorepo package split, or multi-week admin redesign beyond the child scopes.
* Dynamic penetration testing, SCA/CVE scans, accessibility browser audits, or production APM integration.
* Local dependency installation and local build/test execution.

## Technical Notes

* Audit report: `audit-report-Synapse-2026-07-05.md`
* Security-sensitive areas: `frontend/src/hooks/useAuth.ts`, `frontend/src/utils/sign.ts`, `src/utils/sign.ts`, `src/middleware/replayProtection.ts`, `src/routes/logRoutes.ts`, `src/routes/commandRoutes.ts`
* Config/deploy: `src/config/config.ts`, `src/config/env.ts`, `docker-compose.yml`, `.github/workflows/*`, `vercel.json`, `Dockerfile`
* Maintainability targets: `frontend/src/components/EnvManager.tsx`, `UserProfile.tsx`, `UserManagement.tsx`, `src/controllers/adminController.ts`
* Specs: `.trellis/spec/backend/security-boundary-contracts.md`, `.trellis/spec/backend/quality-guidelines.md`, `.trellis/spec/frontend/quality-guidelines.md`, `.trellis/spec/frontend/type-safety.md`
