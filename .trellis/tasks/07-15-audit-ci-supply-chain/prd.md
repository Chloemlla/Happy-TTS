# Harden CI Write Workflows and Pin Toolchains

## Goal

Reduce supply-chain and branch-integrity risk in GitHub Actions and related release install paths by pinning mutable tool/action versions, eliminating PAT-driven direct main writeback where possible, and improving lockfile/tool reproducibility.

## What I Already Know

* Audit findings:
  * P0/High: workflows use `actions/*@main`, `pnpm/action-setup` `version: latest`, and `secrets.USER_PAT` write operations.
  * P1/Medium: Vercel `--no-frozen-lockfile`, Docker/CI global install of unpinned tools, deploy job temporary dependency installs, `node-version: latest`.
* Evidence files include `.github/workflows/biome-check.yml`, `auto-merge.yml`, `tsc.yml`, `docker.yml`, root/frontend `vercel.json`, `Dockerfile`.
* Minimal fixes from audit: pin actions to tag/SHA, stop dynamic `pnpm add` dependency mutation, safe-fix should open PR not push main, default to least-privilege `GITHUB_TOKEN`.

## Assumptions

* Some write workflows may still be desired (format PR, auto-merge), but must not silently push unreviewed main changes with long-lived PAT if avoidable.
* No package installation in the agent environment; workflow file edits only.
* Existing CI feature set should remain useful after hardening.

## Requirements

* Pin GitHub Actions `uses:` refs away from floating `@main` / `@master` to immutable SHA or deliberate version tags.
* Remove or replace `version: latest` toolchain installs with pinned versions.
* Prevent workflows from mutating dependency manifests as part of routine checks.
* Revisit PAT usage:
  * prefer `GITHUB_TOKEN` with least permissions
  * if PAT remains necessary, document why and restrict to PR creation rather than direct main push
* Replace `--no-frozen-lockfile` with frozen lockfile installs in Vercel configs where builds should be reproducible.
* Prefer lockfile-managed tools (`pnpm exec` / devDependency) over global unpinned installs in Docker/CI when code structure allows without installing now.
* Pin Node version away from `latest` to an explicit LTS in workflows touched.
* Add or document a static policy forbidding future `@main` action refs / `latest` tool pins if practical without new deps.

## Acceptance Criteria

* [ ] Touched workflows no longer use floating `@main` action refs.
* [ ] Tool installs in touched workflows/configs are pinned or lockfile-backed.
* [ ] No routine workflow path direct-pushes main via PAT without explicit documented exception.
* [ ] Vercel install commands for touched apps use frozen lockfile semantics.
* [ ] Node/tool versions in touched CI are explicit.
* [ ] Changes committed and pushed.

## Definition of Done

* CI/release supply chain for touched paths is auditable and more reproducible.
* Residual exceptions documented.
* Conventional commit pushed.

## Technical Approach

1. Inventory workflow `uses:` and setup versions.
2. Pin and reduce permissions job-by-job.
3. Adjust Vercel/Docker install commands for reproducibility.
4. Keep auto-merge/safe-fix intent but with safer write surfaces (PR-only).

## Decision (ADR-lite)

**Context**: Mutable CI actions + PAT writeback can bypass code-review assumptions.

**Decision**: Prioritize pin + least privilege + no direct main writeback over preserving convenience automation exactly as-is.

**Consequences**: Slightly more ops friction (version bumps intentional); much lower supply-chain leverage.

## Out of Scope

* Full SLSA provenance/SBOM platform.
* Migrating off GitHub Actions.
* Running workflows locally.

## Technical Notes

* Files: `.github/workflows/*`, `vercel.json`, `frontend/vercel.json`, `Dockerfile`
* Audit refs: CI mutable action/PAT finding; reproducibility finding; quick wins for pin + frozen lockfile
