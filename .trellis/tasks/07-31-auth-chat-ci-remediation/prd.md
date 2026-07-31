# Repair Cookie Authentication, LibreChat/WebSocket Identity, and CI Tests

## Goal

Repair the confirmed authentication, ownership, concurrency, and test-pipeline defects without changing the product's intentional recoverable storage design for user passwords, MFA material, recovery codes, or runtime secrets.

## Confirmed Problems

1. `GET /api/auth/me` is already protected by `authenticateToken`, but the controller performs a second Bearer-only check. A valid HttpOnly Cookie session therefore receives `401`.
2. LibreChat and WebSocket paths do not share one canonical authentication context. They may trust stale JWT claims, disclose tokens, collapse tokenless guests into the same owner, or overwrite concurrent updates.
3. Test infrastructure hides real boundaries with global mocks, the nightly test selector is neutralized by Jest ignore rules, frontend Vitest is absent from CI, and neither backend nor frontend coverage has an enforced threshold.

## Requirements

### Cookie `/api/auth/me`

* Treat the authenticated request context created by `authenticateToken` as authoritative.
* Do not require a second Authorization/Bearer header in the controller.
* Preserve valid Bearer-token clients and return the same public user payload.
* Add a regression test that exercises the real authentication boundary for a Cookie-only request.

### LibreChat

* Establish one canonical request authentication context for registered users and guests; downstream routes/services must not independently reinterpret identity.
* Never log or return reusable credentials when an HttpOnly Cookie is sufficient. Sensitive request bodies must not be logged.
* Issue server-generated, high-entropy guest identities. Do not map tokenless or invalid guests to a shared empty owner.
* Derive collision-resistant owner identifiers and enforce uniqueness at the persistence boundary.
* Replace read-modify-write whole-array persistence with an atomic/CAS strategy that detects or prevents concurrent lost updates, including the file fallback.
* Preserve expected conversation, preset, search, export, clear, and guest flows.

### WebSocket

* Prefer same-origin Cookie authentication and stop putting JWTs in WebSocket query strings from the frontend.
* If a legacy query-token fallback remains, use it only to identify the subject, then reload the current user and authoritative role/disabled state before accepting the socket.
* Cookie-authenticated users must not silently become anonymous.
* Keep anonymous WebSocket access only where the existing product explicitly allows it.

### Tests and CI

* Remove global boundary mocks from shared Jest setup; mocks must be local to tests that own them.
* Make nightly suite selection effective despite CI Jest ignore patterns.
* Run frontend Vitest in GitHub Actions using existing dependencies and scripts.
* Enforce meaningful backend and frontend coverage thresholds. Prefer staged thresholds grounded in current configuration rather than an unenforceable aspirational number.
* Add or adjust regression tests for the authentication, ownership, and concurrency fixes.

### Degraded startup and administrator notification

* Missing OpenAI TTS credentials, Fish Audio credentials, or any other optional external-service secret must not prevent the HTTP process from starting.
* Core local persistence requirements may remain readiness-critical; optional integrations must report an explicit disabled/not-configured capability state instead of crashing module import or startup.
* On the first frontend visit after a distinct missing-configuration set is detected, create one administrator-facing notification. Deduplicate by a stable fingerprint of the missing keys so repeated page loads do not spam administrators, while a newly changed missing set can notify again.
* Never expose secret values to the visiting user, notification payload, logs, or health response.

### Runtime TTS provider and model selection

* Extend the existing EnvManager through a focused child section/component rather than further expanding its monolithic file.
* Allow administrators to select the active backend TTS provider and model at runtime without restarting the process.
* Preserve the existing OpenAI-compatible provider and expose its supported model choices.
* Add a native Fish Audio provider using `POST https://api.fish.audio/v1/tts`, Bearer API-key authentication, JSON request body, and the provider model header.
* Per the official Fish Audio S2.1 Pro page retrieved on 2026-07-31, expose `s2.1-pro-free` as a selectable Fish model. Keep the stored model field extensible so future model identifiers are not blocked by a closed enum migration.
* TTS requests must route through the selected provider and return a clear not-configured capability error when that provider lacks required credentials.

## Acceptance Criteria

* [ ] Cookie-only `GET /api/auth/me` succeeds after `authenticateToken` establishes `req.user`; invalid or missing authentication still fails.
* [ ] LibreChat routes use one canonical auth context and do not emit reusable tokens or sensitive bodies to logs/responses.
* [ ] Every guest receives a non-empty, server-issued identity and distinct persistence owner.
* [ ] Owner uniqueness is enforced and concurrent mutations cannot silently lose an accepted update.
* [ ] WebSocket auth works with same-origin HttpOnly Cookies; the frontend URL contains no JWT.
* [ ] Current database state, not stale role/disabled JWT claims, decides authenticated WebSocket authority.
* [ ] Shared Jest setup no longer mocks external/system boundaries globally.
* [ ] Nightly tests are actually selected, frontend tests run in CI, and coverage failures break workflows below configured thresholds.
* [ ] The application starts when optional external keys are absent; health/readiness identifies disabled capabilities without declaring the whole process unavailable solely for those keys.
* [ ] A first frontend visit creates a deduplicated administrator notification for the current missing-key fingerprint without leaking values.
* [ ] EnvManager can switch OpenAI/Fish Audio and select a provider model; the persisted selection drives subsequent TTS generation.
* [ ] Fish Audio requests match the official `/v1/tts` JSON/Bearer/model-header contract and support `s2.1-pro-free`.
* [ ] No dependency installation or local build/test/typecheck/lint command is run.
* [ ] Changes are committed and pushed; validation is performed by GitHub Actions.

## Out of Scope

* Changing or removing the intentional reversible/recoverable storage design for original passwords, MFA secrets, recovery codes, or runtime secrets.
* Installing dependencies or migrating the application to a different framework/test runner.
* Adding every Fish Audio feature (voice cloning upload UX, streaming UI, billing/SLA management) beyond provider/model selection and compatible generation.
* Unrelated audit findings, broad authentication redesign, or unrelated user work already present in the worktree except the user-authorized runtime-config/EnvManager changes required here.

## Technical Approach

1. Reuse middleware-established identity for `/auth/me` and cover Cookie-only behavior at the route boundary.
2. Introduce/reuse a typed canonical LibreChat auth context, centralize guest issuance and owner derivation, and eliminate credential-bearing diagnostics.
3. Make persistence mutations atomic: database updates use unique keys plus atomic/CAS operations; file fallback serializes mutations and writes through a temporary replacement.
4. Parse WebSocket Cookies server-side, reload current users, and remove query-token construction in the browser hook.
5. Move mocks into owning test files, correct nightly Jest selection, add frontend CI execution, and configure enforced coverage thresholds.
6. Make provider clients lazy and optional at startup, publish sanitized capability diagnostics, and persist/deduplicate first-visit administrator notifications.
7. Add runtime TTS provider settings, a Fish Audio adapter, and a small EnvManager provider/model section that drives the provider router.

## Verification Strategy

* Perform static inspection and targeted diff review locally only.
* Push the commit and use GitHub Actions for all executable build, type-check, lint, and test verification.
* If a workflow fails, inspect its logs, patch the scoped defect, commit, push, and repeat until the relevant workflows pass or an external blocker is proven.

## Decision (ADR-lite)

**Context**: Multiple endpoints currently infer identity independently, producing inconsistent authorization and persistence ownership. The repository also has tests that appear comprehensive while CI silently skips important boundaries.

**Decision**: Make middleware/current persistence state the identity authority, make guest ownership server-issued and collision-resistant, require concurrency-safe mutation semantics, and make CI tests observable and enforceable.

**Consequences**: Existing same-origin clients become safer and Cookie sessions work consistently. Legacy query-token WebSocket clients may remain temporarily compatible, but query credentials are deprecated and never trusted for current authority. CI can begin failing on coverage or previously hidden integration defects, which is intentional.
