# Cookie-only browser sessions and deeper admin UI splits

## Goal
1. Browser primary auth must not persist access tokens in JS storage; HttpOnly cookie is the only browser session secret.
2. Keep explicit Bearer only for non-browser / explicit token injection paths.
3. Continue splitting EnvManager, UserProfile, UserManagement into smaller modules.

## Requirements
- login/register/TOTP/passkey browser success: clear JS token storage; rely on cookie + withCredentials
- saved accounts store user metadata only (no token) by default
- multi-account switch without token requires re-login (no silent identity forge)
- command admin payloads: do not require browser-readable JWT for decrypt; return plain JSON under authenticated cookie/admin session (TLS + authz)
- requestSigner: if no JS token, omit signature headers; replayProtection accepts cookie-authenticated requests without HMAC headers
- extract more EnvManager sections and at least one more UserProfile + UserManagement module each
