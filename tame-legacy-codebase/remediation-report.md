# Synapse targeted remediation report

Date: 2026-07-31  
Mode: Standard / E2 / G1 / Q1 / C1 / D0  
Status: implementation complete in the working branch; executable verification is CI-only

## Scope

This report records the targeted remediation requested after the frozen repository audit. It does not replace or rewrite [`legacy-codebase-report.md`](../legacy-codebase-report.md).

Included:

- F-005, F-006, F-020, F-025, F-063 and F-064: nightly selection, mock ownership, frontend CI and coverage gates.
- F-008, F-037 through F-041 and F-045: Cookie authentication, WebSocket authority, LibreChat credentials, ownership and concurrent persistence.
- Missing optional secrets must not stop HTTP startup.
- First frontend visit must create a deduplicated administrator configuration notice.
- Runtime OpenAI/Fish Audio TTS provider switching and frontend model selection.

Excluded by explicit product decision:

- Redesigning recoverable storage of original passwords, MFA seeds, recovery codes or ordinary runtime secrets.
- Broad release/deployment remediation, production migration, dependency installation or framework replacement.

## Frozen Before baseline

The complete evidence ledger and all unaddressed findings remain in [`legacy-codebase-report.md`](../legacy-codebase-report.md). Its scores are frozen:

```text
Security        ██░░░░░░░░  2.5  D
Stability       ███░░░░░░░  3.0  C
Performance     ████░░░░░░  4.5  C
Testing         ██░░░░░░░░  2.5  D
Maintainability ███░░░░░░░  3.5  C
Design          ███░░░░░░░  3.0  C
Release         █░░░░░░░░░  1.5  D
Overall         ██░░░░░░░░  2.9  D
```

Scoped finding count before remediation:

| Severity | Count | Confirmed | Suspected |
| --- | ---: | ---: | ---: |
| Critical | 0 | 0 | 0 |
| High | 9 | 9 | 0 |
| Medium | 4 | 4 | 0 |
| Low | 0 | 0 | 0 |
| Info | 0 | 0 | 0 |
| **Total** | **13** | **13** | **0** |

## Remediation status

| Finding / requirement | Status | Implemented contract | Primary evidence |
| --- | --- | --- | --- |
| F-045 | Implemented; CI pending | `/api/auth/me` trusts the user established by `authenticateToken`; Cookie-only and Bearer clients share the same controller path. | `src/controllers/authController.ts`, `src/tests/authCookieSession.test.ts` |
| F-008 | Implemented with legacy compatibility | Browser WebSockets no longer put JWTs in URLs. Server upgrade authentication prefers the HttpOnly Cookie and reloads the current user, role and disabled/suspended state. | `frontend/src/hooks/useWebSocket.ts`, `frontend/src/utils/webSocketUrl.ts`, `src/services/wsAuthentication.ts`, `src/tests/wsUpgradeRouting.test.ts` |
| F-037 | Implemented | LibreChat no longer returns its guest credential to JavaScript or logs reusable ownership tokens/request bodies. | `src/routes/libreChatRoutes.ts`, `src/routes/libreChatIdentity.ts`, `src/services/libreChatService.ts` |
| F-038 | Implemented | Tokenless guests receive a server-generated 256-bit credential in an HttpOnly Cookie; empty shared ownership is rejected. | `src/routes/libreChatIdentity.ts`, `src/tests/libreChatIdentity.test.ts` |
| F-039 | Implemented with migration compatibility | Canonical user/guest owners are domain-separated SHA-256 keys. Legacy token-derived records are normalized without retaining raw credentials. | `src/services/librechat/history.ts`, `src/services/librechat/legacyMongoHistory.ts`, `src/tests/libreChatOwnership.test.ts` |
| F-040 | Implemented | The complete LibreChat router establishes one optional session context before route-specific identity resolution. | `src/routes/libreChatRoutes.ts` |
| F-041 | Implemented; concurrency integration pending | Mongo owner uniqueness, atomic append/update/delete, CAS legacy migration, per-owner process locks and serialized atomic file replacement replace whole-array blind writes. Fallback writes retain a baseline and are replayed when Mongo recovers. | `src/services/librechat/models.ts`, `src/services/librechat/atomicJsonWriter.ts`, `src/services/libreChatService.ts`, `src/tests/libreChatOwnership.test.ts` |
| F-005 / F-063 | Implemented; scheduled run pending | Dedicated nightly core/external Jest configurations no longer inherit the CI live-test ignore list. External probes always run; only strict IP assertions skip when their key is absent. | `jest.nightly.config.js`, `jest.nightly.external.config.js`, `.github/workflows/nightly-test-matrix.yml`, `src/tests/ip-query.test.ts` |
| F-006 / F-025 | Implemented | Shared Jest setup contains environment/bootstrap only. Boundary mocks are explicitly imported by the unit suites that own them; nightly Mongo contracts use the real application persistence path. | `src/tests/setup.ts`, `src/tests/helpers/`, `src/tests/logshare-mongodb.test.ts`, `src/tests/policyApi.test.ts` |
| F-020 / F-064 | Implemented; CI pending | Required Node verification runs backend Jest and frontend Vitest with non-zero global coverage thresholds and uploads both coverage artifacts. | `.github/workflows/tsc.yml`, `jest.config.js`, `frontend/vitest.config.ts`, `docs/test-matrix.md` |
| Optional-secret startup | Implemented; CI pending | Missing OpenAI, Fish Audio, mail, CAPTCHA, OAuth and other optional integration credentials produce disabled/skipped capability states or request-time configuration errors instead of import/startup failure. Mongo remains readiness-critical. | `src/config/config.ts`, `src/app/startup.ts`, `src/config/startupDiagnostics.ts`, `src/tts/tts.provider.ts`, `src/tts/tts.fish-provider.ts` |
| First-visit administrator notice | Implemented; CI pending | The frontend triggers a public first-visit signal once per browser session. Mongo deduplicates notices by the stable set of missing configuration names; notifications contain names/impact only, never values, and pending notices replay to the next administrator WebSocket. | `frontend/src/hooks/useConfigurationNoticeTrigger.ts`, `src/services/configurationNoticeService.ts`, `src/services/configurationNoticeIssues.ts`, `src/services/wsService.ts` |
| Runtime OpenAI/Fish TTS | Implemented; CI pending | EnvManager switches provider/model at runtime. Fish uses `POST /v1/tts`, Bearer authentication, JSON, the model header, optional `reference_id`, and `s2.1-pro-free`; missing provider credentials return `TTS_PROVIDER_NOT_CONFIGURED`. | `frontend/src/components/env-manager/TtsProviderConfigSection.tsx`, `src/config/ttsProviderConfig.ts`, `src/controllers/ttsProviderController.ts`, `src/tts/tts.provider-router.ts`, `src/tts/tts.fish-provider.ts` |
| Frontend TTS model presentation | Implemented; CI pending | The public provider contract drives model/voice/format controls. Fish shows the configured extensible model, limits output to MP3 and does not present an unsupported speed control. | `frontend/src/components/TTSForm.tsx`, `frontend/src/utils/ttsProviderConfig.ts` |

## Fish Audio contract

Implementation source: [`research/fish-audio-s2.1-pro-free.md`](../.trellis/tasks/07-31-auth-chat-ci-remediation/research/fish-audio-s2.1-pro-free.md), derived from the Fish Audio documentation supplied by the user.

- Endpoint: `POST https://api.fish.audio/v1/tts`
- Authentication: `Authorization: Bearer <API_KEY>`
- Request: JSON with `text`, `format`, and optional `reference_id`
- Model selection: `model` request header
- Exposed free model: `s2.1-pro-free`
- Current Synapse output constraint: MP3 only
- Persistence: model remains a validated extensible string, not a closed database enum

## Before / After comparison

| Measure | Before | After this slice | Evidence quality |
| --- | --- | --- | --- |
| Scoped confirmed findings | 13 open | 13 implemented; executable confirmation pending | Static code/test/workflow review |
| Cookie `/auth/me` | Cookie accepted by middleware, rejected by Bearer-only controller check | One middleware-established session authority | Regression test authored, not run locally |
| Browser WebSocket credential | Reusable JWT query parameter | Same-origin Cookie; credential query parameters stripped | Server/frontend contract tests authored |
| LibreChat guest owner | Empty shared owner possible | Server-issued non-empty guest owner | Unit/route tests authored |
| LibreChat persistence | Whole-array overwrite and unsafe file write | Unique owner, atomic mutation/CAS and serialized atomic file replace | Static review; real concurrency CI pending |
| Shared Jest setup | Global mocks for security/persistence boundaries | Bootstrap only; local opt-in mocks | Static setup/import audit |
| Nightly suite | Selected tests ignored or no-op | Separate core and external configurations | Workflow execution pending |
| Frontend tests in CI | Not run | Required Vitest coverage step | Workflow execution pending |
| Optional integration secrets | Several capabilities could fail startup/import checks | Missing credentials degrade to disabled/request-time errors | Static startup/import scan |
| TTS provider | OpenAI-only runtime path | Runtime OpenAI/Fish routing and admin model selection | Provider contract tests authored |

## Verification

Repository instructions prohibit local build, test, type-check, lint and installation commands. Therefore:

- No executable build or test was run locally.
- Static inspection covered the changed authentication, WebSocket, LibreChat, startup/configuration, TTS and workflow paths.
- `git diff --check` is the only local repository check permitted for the final working diff.
- Backend Jest, frontend Vitest, coverage gates, build and nightly execution must be confirmed by GitHub Actions after push.

## Residual and accepted risk

1. No local executable verification exists; TypeScript, provider mocks, Mongo semantics and browser behavior remain CI-dependent.
2. Legacy manually supplied LibreChat tokens remain accepted for compatibility, but are no longer returned to JavaScript and are deliberately not used for browser SSE; those sessions poll instead.
3. Legacy Mongo migration CAS matches the complete current `messages` array. Real Mongo/Mongoose equality behavior and repeated conflict handling still require integration confirmation.
4. Mongo recovery replays the delta between the first failed-write baseline and current fallback memory. Cross-process recovery races need a dedicated concurrency/integration test.
5. The LibreChat page still derives a presentation-level `guestMode` from the absence of a manual token. Backend Cookie identity remains authoritative, but the UI can briefly label a Cookie user as a guest while its independent auth hook initializes.
6. Fish Audio currently supports MP3 only in Synapse, and the documented primary model is `s2.1-pro-free`; additional provider features and formats are out of scope.
7. Original passwords, MFA seeds, recovery codes and ordinary runtime secrets remain recoverable by explicit product design. This preserves operational recovery but retains plaintext-equivalent compromise impact and must be treated as an accepted high security risk, not as remediated.
8. High-risk deployment/release findings in the frozen audit remain open, including unverified promotion, host/artifact identity, readiness cutover, rollback and provenance controls.

## Static After score

These scores are intentionally conservative because the requested slice is not yet verified by CI and many audit findings remain outside scope.

```text
Security        ████░░░░░░  3.5  C   Cookie/WS/LibreChat credential boundaries improved; recoverable-secret and other audit risks remain
Stability       ████░░░░░░  3.8  C   Atomic chat writes and degraded optional startup added; recovery concurrency remains unproven
Performance     █████░░░░░  4.5  C   No performance remediation or runtime profiling in this slice
Testing         ████░░░░░░  4.0  C   Real boundary ownership, frontend CI and thresholds added; workflows have not yet run
Maintainability ████░░░░░░  3.7  C   Focused provider/identity helpers reduce duplication; large legacy surfaces remain
Design          ████░░░░░░  4.0  C   Session and owner authority are more coherent; broader duplicated authorities remain
Release         ██░░░░░░░░  1.5  D   Release/deployment remediation was explicitly outside scope
Overall         ████░░░░░░  3.6  C
```

