# NexAI Bug Inventory (2026-07-17)

## Scope
Backend NexAI subsystem under `/api/nexai` plus the admin dashboard component. Mobile client not in this repo.

## Component Map
| Area | Files |
|---|---|
| Auth service | `src/services/nexaiAuthService.ts` |
| Auth controller | `src/controllers/nexaiAuthController.ts` |
| Auth middleware | `src/middleware/nexaiAuth.ts` |
| Routes | `src/routes/nexaiRoutes.ts`, `src/routes/nexaiSecurityRoutes.ts` |
| WebAuthn helpers | `src/utils/nexaiWebAuthn.ts` |
| Security | `src/services/nexaiSecurityService.ts`, `src/controllers/nexaiSecurityController.ts` |
| Sync v1/v2 | `src/services/nexaiSyncService.ts`, `src/services/nexaiEncryptedSyncService.ts`, controllers |
| Release | `src/services/nexaiReleaseManifestService.ts`, `src/controllers/nexaiReleaseController.ts` |
| Model | `src/models/nexaiUserModel.ts` |
| Frontend admin UI | `frontend/src/components/NexAISecurityDashboard.tsx` |
| Tests | `src/tests/nexai-webAuthn.test.ts`, `src/tests/nexaiSecurityHeaders.test.ts` |

## Confirmed / High-confidence Issues

### P0 Security
1. **Unauthenticated security report/status endpoints trust client headers**
   - Routes: `POST /api/nexai/security/report`, `GET /api/nexai/security/status` are public.
   - `extractSecurityHeaders` trusts `x-device-risk-score`, `x-device-compromised`, etc.
   - Attacker can forge high/low risk and force BLOCK/HONEYPOT actions or hide risk.
   - Files: `nexaiSecurityRoutes.ts`, `nexaiSecurityController.ts`, `nexaiSecurityService.ts`.

2. **Email lookup not lowercased in passkey login verify controller**
   - Controller sanitizes with regex then lowercases, but email query path may still fail if stored casing differs.
   - More important: identifier lookup uses `$or: email/username` with sanitized value; usernames with uppercase get lowercased while registration stores original casing → login-by-username may 404/500 paths.
   - File: `nexaiAuthController.ts` verifyPasskeyAuthentication.

3. **Discoverable challenge store is in-memory only**
   - Multi-instance deploy: options issued on instance A, verify on B fails.
   - Survives process restarts poorly; no shared store.
   - File: `nexaiAuthService.ts` (`discoverableChallenges` Map).

4. **Refresh token rotation race / reuse detection absent**
   - Refresh tokens hashed and stored once; concurrent refresh can invalidate sibling without reuse detection.
   - File: `nexaiAuthService.ts` refresh path.

### P1 Correctness / Test-failing
5. **WebAuthn unknown credential test expected 400, got 500 (CI history)**
   - Root cause class: dynamic `import("../models/nexaiUserModel.js")` under ts-jest (partially fixed to static import).
   - Residual risk: controller still lowercases identifier; user created as `carol@example.com` is fine, but missing challenge for first create path and mock model semantics need re-verify.
   - Test: `nexai-webAuthn.test.ts` "uses unknown_credential only when...".

6. **Passkey verify requires currentChallenge even for unknown credential path**
   - If challenge missing, returns "挑战不存在" instead of `unknown_credential` when client skips options.
   - Order: challenge check before credential-id unknown mapping may confuse clients.

7. **Counter update uses original passkey.id match**
   - Passkeys may be stored with padding variants; update filter `"passkeys.id": passkey.id` can miss after normalizeBase64Url comparisons.
   - File: `verifyPasskeyAuthentication` / discoverable verify.

8. **Security admin dashboard uses main app `api` + cookie/bearer**
   - Dashboard calls `/api/nexai/security/stats|devices|events` with main-app auth interceptor.
   - Backend routes require `authenticateToken` (main JWT) OR mixed with `nexaiAuthRequired` inconsistently → possible 401s for NexAI-only admins.
   - Files: `NexAISecurityDashboard.tsx`, `nexaiSecurityRoutes.ts`.

9. **Public artifact view records without strong authz**
   - `POST /artifacts/:shortId/view` is public (rate-limited only). Abuse for view-count inflation.
   - File: `nexaiRoutes.ts`.

### P2 Maintainability / Hardening
10. **NoSQL injection surface reduced but inconsistent sanitization**
    - Login uses validator/isEmail + strip; OAuth and other paths use varied sanitization.
11. **EmailVerified false after local register but no email verification enforcement on login**
    - Register sets `emailVerified: false`; login does not block unverified accounts.
12. **Security events accept arbitrary event_type/details**
    - No enum/size limits → DB spam.
13. **Frontend dashboard 30s polling without abort/error budget**
14. **Tests cover WebAuthn/config heavily but almost no auth register/login/sync contract tests**
15. **Bearer parsing uses `split(" ")[1]`**
    - Multi-space or `Bearer a b` can mis-parse; prefer slice after scheme.

## Fix Order (recommended)
1. Security public endpoints auth + header integrity policy
2. Passkey identifier/challenge/credential consistency (close CI red)
3. Refresh token and auth middleware token parsing
4. Security admin auth consistency with dashboard
5. Artifact view abuse limits / optional auth
6. Tests expansion for auth/sync/security

## Non-goals
- Redesigning NexAI product UX
- Mobile client changes outside this repo
- Full rewrite of encrypted sync protocol


## Remediation Progress
- [x] P0 public report cannot self-escalate to BLOCK/HONEYPOT (`getPublicReportAction`)
- [x] Security event_type allowlist + details size limit
- [x] Admin security handlers require admin role
- [x] Passkey login verify identifier lookup email/username consistency
- [x] NexAI middleware Bearer parsing hardened
- [ ] Discoverable challenge shared store (multi-instance)
- [ ] Refresh-token reuse detection
- [ ] Dashboard dual-auth (main JWT vs NexAI JWT) unification
