# Route Governance Audit

Generated route modules: 65
Validation violations: 0

## Route Registry

| Name | Phase | Kind | Path | Auth | Rate Limit | Public | Security Bypass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| auth-limiter | route-limiters | limiter | `/api/auth` | mixed<br>- | true<br>- | mixed | - |
| auth-me-limiter | route-limiters | limiter | `/api/auth/me` | true<br>- | true<br>mount: meEndpointLimiter | false | - |
| tts-generate-limiter | route-limiters | limiter | `/api/tts/generate` | mixed<br>- | true<br>- | mixed | - |
| tts-history-limiter | route-limiters | limiter | `/api/tts/history` | mixed<br>- | true<br>- | mixed | - |
| tts-jobs-limiter | route-limiters | limiter | `/api/tts/jobs` | mixed<br>- | true<br>- | mixed | - |
| totp-limiter | route-limiters | limiter | `/api/totp` | mixed<br>- | true<br>- | mixed | - |
| passkey-limiter | route-limiters | limiter | `/api/passkey` | mixed<br>- | true<br>- | mixed | - |
| tamper-limiter | route-limiters | limiter | `/api/tamper` | false<br>- | true<br>- | true | - |
| command-limiter | route-limiters | limiter | `/api/command` | mixed<br>- | true<br>- | mixed | - |
| libre-chat-limiter | route-limiters | limiter | `/api/libre-chat` | mixed<br>- | true<br>- | mixed | - |
| data-collection-limiter | route-limiters | limiter | `/api/data-collection` | false<br>- | true<br>- | true | - |
| ipfs-limiter | route-limiters | limiter | `/api/ipfs` | mixed<br>- | true<br>- | mixed | - |
| network-limiter | route-limiters | limiter | `/api/network` | false<br>- | true<br>- | true | - |
| data-process-limiter | route-limiters | limiter | `/api/data` | false<br>- | true<br>- | true | - |
| deeplx-limiter | route-limiters | limiter | `/api/deeplx` | false<br>- | true<br>- | true | - |
| media-limiter | route-limiters | limiter | `/api/media` | false<br>- | true<br>- | true | - |
| social-limiter | route-limiters | limiter | `/api/social` | false<br>- | true<br>- | true | - |
| life-limiter | route-limiters | limiter | `/api/life` | false<br>- | true<br>- | true | - |
| status-limiter | route-limiters | limiter | `/api/status` | mixed<br>- | true<br>- | mixed | - |
| webhook-routes | pre-parser | route | `/api/webhooks` | false<br>- | true<br>route: webhookLimiter | true | waf=true (Webhook signature verification requires raw payload compatibility before WAF normalization.) |
| data-collection-routes | pre-parser | route | `/api/data-collection` | false<br>- | true<br>route-module: dataCollectionLimiter | true | waf=true (Telemetry ingestion accepts browser-originated payloads that the WAF would over-block.) |
| root-data-collection-routes | pre-parser | route | `/api` | false<br>- | true<br>route-module: dataCollectionLimiter | true | waf=mixed (Only the data-collection branch under /api should bypass WAF; sibling routes remain protected.) |
| email-routes | early | route | `/api/email` | mixed<br>- | mixed<br>- | mixed | - |
| outemail-routes | early | route | `/api/outemail` | false<br>- | true<br>route: outEmailLimiter, statusQueryLimiter | true | - |
| tts-routes | pre-docs | route | `/api/tts` | mixed<br>- | true<br>route-module: tts-generate-limiter, tts-history-limiter, tts-jobs-limiter | mixed | - |
| librechat-compat-routes | pre-docs | route | `/api/librechat` | mixed<br>- | true<br>mount: libreChatLimiter | mixed | - |
| ip-verification-routes | pre-tamper | route | `/api/ip-verification` | false<br>- | false<br>- | true | ipVerification=true (This endpoint bootstraps IP verification and cannot be gated by itself.) |
| ip-verification-middleware | pre-tamper | middleware | `/api` | false<br>- | false<br>- | mixed | - |
| auth-routes | pre-tamper | route | `/api/auth` | mixed<br>- | true<br>route-module: auth-limiter | mixed | waf=mixed (Login and register payloads need selective compatibility exceptions, not a full-module bypass.)<br>ipVerification=mixed (Third-party callback and bootstrap branches must remain reachable before verification completes.) |
| totp-routes | pre-tamper | route | `/api/totp` | mixed<br>- | true<br>route-module: totp-limiter | mixed | - |
| totp-status-route | pre-tamper | route | `/api/totp/status` | true<br>mount: authenticateToken | true<br>route-module: totpLimiter | false | - |
| admin-routes | pre-tamper | route | `/api/admin` | true<br>router: authMiddleware, adminAuthMiddleware | true<br>mixed: adminLimiter | false | - |
| admin-audit-log-routes | pre-tamper | route | `/api/admin/audit-logs` | true<br>mount: authenticateToken | true<br>mount: adminLimiter | false | - |
| api-key-routes | pre-tamper | route | `/api/apikeys` | true<br>router: authMiddleware | false<br>- | false | - |
| status-routes | pre-tamper | route | `/api/status` | mixed<br>- | true<br>route-module: status-limiter | mixed | ipBan=true (Status endpoints must remain available for health probes even when ban infrastructure is active.)<br>ipVerification=true (Operational status must be reachable before user-facing verification bootstraps.) |
| turnstile-routes | pre-tamper | route | `/api/turnstile` | mixed<br>- | true<br>route-module: passkeyLimiter | mixed | ipVerification=true (Turnstile bootstrap routes are intentionally public and must bypass IP verification.) |
| policy-routes | pre-tamper | route | `/api/policy` | mixed<br>- | true<br>route: policyRateLimit, adminRateLimit | mixed | - |
| tamper-routes | pre-tamper | route | `/api/tamper` | false<br>- | true<br>route-module: tamper-limiter | true | - |
| ticket-routes | pre-tamper | route | `/api/tickets` | true<br>router: authenticateToken | false<br>- | false | - |
| command-routes | post-tamper | route | `/api/command` | mixed<br>- | true<br>route-module: command-limiter | mixed | - |
| libre-chat-routes | post-tamper | route | `/api/libre-chat` | mixed<br>- | true<br>route-module: libre-chat-limiter | mixed | - |
| human-check-routes | post-tamper | route | `/api/human-check` | false<br>- | false<br>- | true | ipVerification=true (Human-check bootstrap must be callable before IP verification has established trust.) |
| debug-console-routes | post-tamper | route | `/api/debug-console` | mixed<br>- | false<br>- | mixed | - |
| data-collection-admin-routes | post-tamper | route | `/api/data-collection/admin` | true<br>route: authenticateToken, authenticateAdmin | true<br>route: dataCollectionLimiter | false | - |
| ipfs-routes | post-tamper | route | `/api/ipfs` | mixed<br>- | true<br>route-module: ipfs-limiter | mixed | - |
| network-routes | post-tamper | route | `/api/network` | false<br>- | true<br>route-module: network-limiter | true | - |
| data-process-routes | post-tamper | route | `/api/data` | false<br>- | true<br>route-module: data-process-limiter | true | - |
| deeplx-routes | post-tamper | route | `/api/deeplx` | false<br>- | true<br>route-module: deeplx-limiter | true | - |
| lottery-routes | post-tamper | route | `/api/lottery` | false<br>- | false<br>- | true | - |
| media-routes | post-tamper | route | `/api/media` | false<br>- | true<br>route-module: media-limiter | true | - |
| social-routes | post-tamper | route | `/api/social` | false<br>- | true<br>route-module: social-limiter | true | - |
| life-routes | post-tamper | route | `/api/life` | false<br>- | true<br>route-module: life-limiter | true | - |
| log-routes | post-tamper | route | `/api` | false<br>- | false<br>- | true | - |
| passkey-routes | post-tamper | route | `/api/passkey` | mixed<br>- | true<br>route-module: passkey-limiter | mixed | - |
| miniapi-routes | post-tamper | route | `/api/miniapi` | false<br>- | true<br>mount: miniapiLimiter | true | - |
| anta-routes | post-tamper | route | `/api/anta` | false<br>- | true<br>mount: antaLimiter | true | - |
| modlist-routes | post-tamper | route | `/api/modlist` | false<br>- | true<br>mount: modlistMountLimiter | true | - |
| image-data-routes | post-tamper | route | `/api/image-data` | false<br>- | false<br>- | true | - |
| resource-routes | post-tamper | route | `/api` | mixed<br>- | true<br>route-module: auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, media-limiter, social-limiter, life-limiter, status-limiter | mixed | - |
| cdk-routes | post-tamper | route | `/api/cdks` | mixed<br>- | true<br>mount: cdkMountLimiter | mixed | - |
| webhook-event-routes | post-tamper | route | `/api/webhook-events` | true<br>mount: authenticateToken | true<br>mount: adminLimiter | false | - |
| fbi-wanted-routes | post-tamper | route | `/api/fbi-wanted` | false<br>- | false<br>- | true | - |
| github-billing-routes | post-tamper | route | `/api/github-billing` | false<br>- | true<br>mount: githubBillingLimiter | true | - |
| nexai-routes | post-tamper | route | `/api/nexai` | mixed<br>- | false<br>- | mixed | - |
| nexai-security-routes | post-tamper | route | `/api/nexai` | mixed<br>- | true<br>mount: nexaiSecurityLimiter | mixed | - |
