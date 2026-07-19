# Supply-chain and auto-merge governance

This document describes the in-repo controls for GitHub Actions supply-chain hygiene and auto-merge policy, plus the repository settings that only administrators can change.

## Auto-merge policy (in-repo)

Workflow: `.github/workflows/auto-merge.yml`  
Implementation: `scripts/auto-merge.js`

Automatic merge only proceeds when **all** of the following hold:

1. The PR is open, not a draft, and has the `automerge` label.
2. The merge is bound to an **exact 40-character head SHA**:
   - `workflow_run` path uses `workflow_run.head_sha`
   - `workflow_dispatch` requires an explicit `head_sha` input
3. That SHA still matches the PR head immediately before merge (`pulls.merge` also passes `sha`).
4. There is at least one **human** review state `APPROVED` for that same head SHA (bots and self-approvals do not count).
5. There is no active `CHANGES_REQUESTED` review.
6. GitHub reports the PR as `MERGEABLE` with `mergeStateStatus: CLEAN`.
7. Required status checks are resolved from repository rulesets, then classic branch protection; if neither is readable/configured, the in-repo baseline (`Node verification`, `Rust verification`) is enforced. Every required check must be successful on the current head.
8. The overall check rollup is `SUCCESS` (not just a single workflow name).

Failure mode is fail-closed: missing required checks, incomplete rollup, head SHA race, or missing human approval aborts the merge.

## Action and toolchain pinning (in-repo)

- GitHub Actions are pinned to **immutable commit SHAs** with a trailing comment for the logical version tag.
- Node/pnpm versions are fixed in workflows (no `latest`).
- Rust is fixed via root `rust-toolchain.toml` (`1.89.0`) and workflows install that exact channel through `dtolnay/rust-toolchain`.

Static enforcement:

```bash
pnpm run check:audit-policies
```

Rules include:

- forbid `uses: *@main` / `@master`
- require `uses: owner/action@<40-hex-sha>` (optionally with a version comment)
- forbid `node-version: latest` / `version: latest`
- forbid floating `dtolnay/rust-toolchain@stable`
- forbid `--no-frozen-lockfile`
- forbid `USER_PAT` in workflows except as a read-only Dependabot alerts token with a documented comment

## PAT minimization (in-repo)

| Secret | Intended use | Required scopes (minimum) |
| --- | --- | --- |
| `GITHUB_TOKEN` (default) | checkout, PR create, auto-merge, CodeQL upload | workflow `permissions:` only |
| `USER_PAT` | **only** `scripts/fix-dependabot-alerts.js` reading open Dependabot alerts | classic: `security_events` **read**; fine-grained: Dependabot alerts **read** |
| `DOCKERHUB_*` | Docker publish | Docker Hub credentials only |
| deploy secrets | image deploy script | host SSH only |

Do **not** use `USER_PAT` for push, PR create/merge, or checkout. Those paths use `github.token`.

## Administrator-only repository settings

These cannot be applied from the repository content alone:

1. **Ruleset / branch protection for `main` (and protected release branches)**
   - Require pull request before merging
   - Require at least 1 approving review (dismiss stale approvals when new commits are pushed)
   - Require conversation resolution
   - Require status checks to pass, with at least:
     - `Node verification`
     - `Rust verification`
     - `Docker Build Verification` (if Docker changes are in scope for the PR policy)
     - optionally `Analyze` / CodeQL job names actually reported by GitHub
   - Require branches to be up to date before merging
   - Block force pushes and branch deletions
   - Restrict who can push
2. **Do not allow bypass of required checks** for admins on production branches unless there is a documented break-glass process.
3. **Actions permissions**
   - Prefer “Allow enterprise/organization actions and reusable workflows” or an allowlist
   - Require actions to be pinned to a full commit SHA where the org policy supports it
4. **Secret hygiene**
   - Rotate any PAT that previously had `repo` write
   - Replace `USER_PAT` with a fine-grained token limited to Dependabot alerts read on this repository
   - Remove unused PATs from Actions secrets
5. **Label**
   - Ensure the `automerge` label exists (or change `AUTO_MERGE_LABEL` consistently)

## Manual merge verification

```text
# After required checks and a human approval on the current head:
Actions → Auto Merge After Required Checks → Run workflow
pr_number = <N>
head_sha  = <40-char PR head>
```

If the head moves after approval, the run must fail until re-approved and re-checked.
