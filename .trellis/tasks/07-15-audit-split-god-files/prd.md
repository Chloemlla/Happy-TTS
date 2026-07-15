# Split Oversized UI and Admin Modules

## Goal

Reduce maintenance and security blast radius by splitting the highest-cost oversized frontend/admin modules into focused units with stable boundaries, without changing product behavior.

## What I Already Know

* Audit finding (P2/Medium): multiple 1500-2600 line files mix UI, request logic, state, and business rules.
* Primary offenders called out:
  * `frontend/src/components/EnvManager.tsx` (~2611)
  * `frontend/src/components/UserProfile.tsx` (~2228)
  * `frontend/src/components/UserManagement.tsx` (~2224)
  * `src/controllers/adminController.ts` (~1947)
  * large backend services also noted (`ecoEnchantsService`, `dataCollectionService`) but lower priority for this child
* Principles violated: SRP, file size limit, KISS.
* Recommended approach: split by stable boundaries first (API hooks, form schema/reducer, presentational components, dangerous-operation modals), one workflow/domain at a time.

## Assumptions

* Behavior parity is mandatory; this is a structural refactor, not a UX redesign.
* Full completion of every oversized file may span multiple commits; this task should define MVP split targets and finish at least the highest-risk surfaces.
* No dependency installation; no local build/test runs.

## Requirements

* Prioritize splits in this order:
  1. EnvManager config domains / secret forms
  2. UserManagement sensitive admin workflows
  3. UserProfile account-security sections (MFA/passkey/bindings)
  4. adminController route-handler grouping if still oversized after FE splits
* Extract reusable seams only when they already exist in practice:
  * API client hooks
  * form state/schema helpers
  * presentational panels/modals
* Keep public component entrypoints stable so routing/imports outside the module do not break, or update all call sites in the same change.
* Avoid drive-by behavior changes, visual redesigns, or API renames.
* After each split unit, ensure types still make sense and no secrets/logging regressions are introduced.
* Prefer multiple focused commits if the split is large.

## Acceptance Criteria

* [ ] At least one major oversized module is split into cohesive submodules with a clear ownership boundary.
* [ ] Highest-risk admin/config workflows remain functionally equivalent.
* [ ] Entry imports/routes continue to resolve.
* [ ] File-level responsibilities are documented briefly in PRD notes or module headers where helpful.
* [ ] No unrelated refactors land in the same change set.
* [ ] Changes committed and pushed.

## Definition of Done

* Targeted god-file pressure is measurably reduced for selected modules.
* Remaining oversized files, if any, are listed as residual work.
* Conventional commits pushed.

## Technical Approach

1. Map sections inside the target file (state, effects, API, panels).
2. Extract leaf presentational components and hooks first.
3. Move domain panels next; keep facade component thin.
4. Repeat for next target only after facade is stable.

## Decision (ADR-lite)

**Context**: Full multi-week modularization of all admin surfaces is too large for one remediation child.

**Decision**: Define ordered MVP splits and complete the top security/config surfaces first; leave lower-churn services for later residual work if needed.

**Consequences**: Immediate reviewability gains on the hottest files, with an explicit backlog for the rest.

## Out of Scope

* Backend service rewrites unrelated to adminController grouping.
* Design system overhaul or new admin features.
* Forced line-count vanity splits that worsen cohesion.

## Technical Notes

* Files: `frontend/src/components/EnvManager.tsx`, `UserProfile.tsx`, `UserManagement.tsx`, `src/controllers/adminController.ts`
* Specs: `.trellis/spec/frontend/component-guidelines.md`, `.trellis/spec/frontend/directory-structure.md`, `.trellis/spec/backend/directory-structure.md`
* Audit refs: finding "超大组件和服务违反 SRP/文件大小原则"; long-term plan item 1
