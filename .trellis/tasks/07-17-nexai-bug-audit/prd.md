# NexAI Feature Bug Audit & Remediation

## Goal
Systematically review all NexAI backend features under `/api/nexai` (auth, passkeys/WebAuthn, OAuth, sync v1/v2, artifacts, security, release manifests) plus the admin security dashboard, document confirmed bugs with severity, then remediate in priority order without expanding product scope.

## What I Already Know
- NexAI is an isolated subsystem with its own JWT secret, user collection (`nexai_users`), and route mount at `/api/nexai`.
- Core files are concentrated in `src/services/nexai*`, `src/controllers/nexai*`, `src/routes/nexai*`, `src/middleware/nexaiAuth.ts`, `src/utils/nexaiWebAuthn.ts`, and `frontend/src/components/NexAISecurityDashboard.tsx`.
- Recent CI (`0_Node verification`) exposed NexAI-adjacent failures (WebAuthn unknown-credential path) and broader test infra issues already partially fixed.
- Repository constraints: no local install; do not run full local build/test; prefer GitHub workflow / static verification; conventional commit + push after each finished change.

## Requirements
- Produce a complete bug inventory covering: auth (register/login/refresh/logout/profile), Google/GitHub OAuth, WebAuthn register/login/discoverable/signal, sync v1 & encrypted v2, artifacts, release manifests, security report/status/anomaly/admin APIs, middleware, and dashboard.
- Classify each finding as P0/P1/P2 with file path, failure mode, impact, and proposed fix.
- Fix in severity order; prefer minimal reversible diffs.
- Keep public API contracts stable unless a security fix requires a documented status/code change.
- Add or adjust focused tests for fixed paths when possible under project constraints.
- Update this PRD acceptance checklist as work completes.

## Acceptance Criteria
- [ ] Research inventory exists at `research/nexai-bug-inventory.md` with severity-ordered findings.
- [ ] P0 security findings are fixed or explicitly deferred with reason.
- [ ] P1 correctness findings that break known tests/client contracts are fixed.
- [ ] Security public endpoints no longer blindly trust client-provided risk headers for blocking decisions without policy.
- [ ] Passkey unknown-credential and challenge error paths return consistent 4xx codes (`unknown_credential` where applicable).
- [ ] NexAI security admin routes and dashboard auth model are consistent.
- [ ] Residual risks documented under Notes.

## Definition of Done
- Inventory + PRD complete and task activated.
- Remediation commits land in priority order.
- Static review shows no remaining P0 items untracked.
- User can proceed to `/finish-work` after verification.

## Technical Approach
1. Map all `/api/nexai` routes and controllers (done in research).
2. Static-review auth/passkey/security/sync for trust-boundary and contract bugs.
3. Fix P0 security first (security header trust, authz gaps).
4. Fix P1 passkey/auth correctness second.
5. Tighten middleware parsing and admin/dashboard consistency.
6. Expand tests around fixed contracts.

## Decision (ADR-lite)
**Context**: NexAI grew quickly (passkeys, dual sync, device risk) with limited end-to-end tests.  
**Decision**: Audit-first Trellis task with severity-ordered remediation; do not rewrite subsystem.  
**Consequences**: Smaller safer patches, residual P2 items may remain after first pass.

## Out of Scope
- Mobile app code outside this repository
- Full encrypted-sync redesign
- Non-NexAI main-app auth (except shared helpers required by NexAI)

## Notes
- Primary evidence: source inspection 2026-07-17 + recent Node verification log for WebAuthn failure mode.
- Implementation order tracked in research inventory.
