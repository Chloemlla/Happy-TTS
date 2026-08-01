# Trim Frontend Build Dependency Weight

## Goal

Remove server-only and build-tool packages from the frontend runtime dependency surface to shrink install/supply-chain weight and clarify browser vs server boundaries.

## What I Already Know

* Audit finding (P2/Medium): `frontend/package.json` dependencies include packages inappropriate for a browser app, including examples such as `@prisma/client`, `@react-email/components`, `@simplewebauthn/server`, `bcrypt`, `express-rate-limit`, `form-data`, `javascript-obfuscator`, `jsonwebtoken`.
* `javascript-obfuscator` appears both as dependency/tooling with duplicate version pressure; Vite config uses it at build time and excludes it from optimizeDeps.
* `express-rate-limit` appears used by `frontend/static-server.js`, not browser runtime.
* Risk: longer installs, broader CVE noise, accidental bundling, blurred package boundaries.

## Assumptions

* Manifest cleanup must preserve actual frontend build and static-server behavior.
* Because dependency installation is forbidden in this environment, edits should be careful and may require lockfile updates only if already part of repo practice; prefer manifest moves/removals that CI can resolve.
* No new packages added.

## Requirements

* Classify each suspicious frontend dependency as:
  * browser runtime needed
  * build-time tooling
  * server/static helper only
  * unused/mistaken
* Remove unused server-only packages from `frontend` dependencies.
* Move pure build tooling (e.g. obfuscator) to root/dev tooling location or frontend `devDependencies` as appropriate without breaking Vite config imports.
* Keep static-server-only deps out of browser runtime dependency set where possible (devDependency or root tooling).
* Ensure Vite/build config still resolves required tooling.
* Add a lightweight dependency policy check (script using existing Node, or documented allow/deny list) forbidding reintroduction of obvious server-only packages into frontend runtime deps.
* Do not install packages in the agent environment.

## Acceptance Criteria

* [ ] Frontend runtime `dependencies` no longer list obvious server-only packages named by the audit (unless a concrete browser import still requires them, with justification).
* [ ] Build tooling needed by Vite remains available via appropriate non-runtime dependency placement.
* [ ] Static server helper still has a defined dependency path.
* [ ] A regression guard or explicit deny-list documentation exists.
* [ ] Changes committed and pushed.

## Definition of Done

* Frontend dependency boundary is cleaner and justified.
* Residual exceptions documented.
* Conventional commit pushed.

## Technical Approach

1. Cross-check each flagged package against imports in `frontend/`.
2. Remove or relocate packages with no browser runtime need.
3. Update Vite/static-server import paths if module location changes.
4. Add deny-list script or CI grep check without new tooling deps.

## Decision (ADR-lite)

**Context**: Frontend manifest currently mixes app, tooling, and server concerns.

**Decision**: Optimize for a thin browser runtime dependency set; tooling/server helpers must not live as runtime deps without proof.

**Consequences**: Cleaner audits and installs; some scripts may need path/devDependency adjustments.

## Out of Scope

* Full monorepo package extraction into many workspaces.
* npm audit CVE remediation beyond removing unnecessary packages.
* Dependency installation/lockfile regeneration on the local agent machine if avoidable.

## Technical Notes

* Files: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/static-server.js`, possibly root package manifests
* Audit refs: finding "前端 package 混入后端/构建依赖"
