# Fix admin backend session expiry

## Goal

Allow an already authenticated administrator using the browser's HttpOnly cookie session to enter and use the admin backend without being incorrectly told that the login has expired.

## Requirements

* Admin authentication must accept the existing `synapse_token` HttpOnly cookie session, while preserving explicit Bearer-token support for non-browser clients.
* AdminGuard must send credentials with its verification requests and must not treat the absence of a JavaScript-readable token as an expired browser session.
* Preserve the existing administrator role and request-identity checks.
* Add focused regression coverage for cookie-based admin authentication and the frontend request behavior where the existing test setup permits.

## Acceptance Criteria

* [ ] A logged-in administrator with only the HttpOnly `synapse_token` cookie can load `/admin` and pass `/api/admin/verify-access`.
* [ ] Bearer-token access to admin routes continues to work.
* [ ] Non-admin users and unauthenticated users remain rejected.
* [ ] The frontend no longer redirects a valid cookie-only administrator to login solely because `getAuthToken()` returns null.
* [ ] CI workflow checks remain the verification path; no local build or test commands are run.

## Definition of Done

* Code and focused regression tests are updated.
* CI build, type-check, and tests are the verification path.
* Existing unrelated working-tree changes are not included in this task commit.

## Technical Approach

Use the existing `authenticateToken` middleware for the admin router because it already resolves Bearer tokens and `synapse_token` cookies through `getTokenFromRequest`. Update `AdminGuard` to use `credentials: 'include'` and rely on the authenticated `useAuth()` user plus the backend response rather than requiring a JS-readable token.

## Decision (ADR-lite)

**Context**: Browser login sessions intentionally store the JWT in an HttpOnly cookie, but the admin route and guard retained the older Bearer-only assumptions.

**Decision**: Unify admin route authentication around the cookie-aware middleware and make the admin guard cookie-aware.

**Consequences**: Browser admin sessions work without exposing the JWT to JavaScript; explicit bearer integrations remain supported. Admin verification requests rely on browser credentials and same-site/CORS configuration.

## Out of Scope

* Redesigning the global authentication state hook.
* Changing token lifetime, cookie security attributes, or administrator role semantics.
* Running build/test commands locally.

## Technical Notes

* Frontend guard: `frontend/src/components/admin/AdminGuard.tsx`
* Admin router: `src/routes/admin/index.ts`
* Cookie-aware middleware: `src/middleware/authenticateToken.ts`
* Existing cookie parser: `src/utils/authCookie.ts`
* Existing unrelated dirty files must be preserved.
