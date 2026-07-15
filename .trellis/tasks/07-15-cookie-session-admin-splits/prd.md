# HttpOnly Cookie Sessions and Finish Admin UI Splits

## Goal

1. Move browser authentication from JS-readable token storage to HttpOnly cookie sessions while keeping Bearer compatibility for API clients/mobile.
2. Finish structural splits of oversized admin UI modules: EnvManager, UserProfile, UserManagement.

## Requirements

### Cookie sessions
* Issue HttpOnly/SameSite cookie on successful login, TOTP verify, and passkey login.
* `authenticateToken` accepts Authorization Bearer **or** session cookie.
* Logout clears cookie.
* Frontend no longer needs to persist access token for normal browser sessions; keep multi-account switcher via non-secret account metadata + re-auth where needed, or temporary transition with cookie primary.
* CORS already has credentials=true; keep withCredentials on browser clients.
* Do not install dependencies; use Express res.cookie (already used by libreChat guest cookies). Cookie parsing: implement lightweight cookie header parser if cookie-parser is unavailable.

### Admin UI splits
* EnvManager: extract remaining large config sections into env-manager/* components (at least short AES, webhook, captcha family, librechat providers, or outemail if still inlined).
* UserProfile: extract pure helpers/types and at least one major section component.
* UserManagement: extract form fields/scaffold already present into dedicated module files if still inline; extract list/table or reveal-password modal if practical.

## Acceptance Criteria

* [ ] Browser session works with cookie without requiring localStorage/sessionStorage access token for `/api/auth/me`.
* [ ] Bearer token still works for non-browser clients.
* [ ] Logout clears cookie.
* [ ] EnvManager/UserProfile/UserManagement line counts reduced by real extractions (not only comments).
* [ ] Static auth policy check still passes.
* [ ] Conventional commit pushed.

## Out of Scope

* Full refresh-token rotation service.
* Mobile native cookie jar redesign beyond Bearer compatibility.
* Visual redesign of admin pages.
