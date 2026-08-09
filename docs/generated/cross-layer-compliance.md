# Cross-Layer Compliance Report

Generated: 2026-08-09T03:33:21.872Z

## Summary

| Metric | Value |
| --- | --- |
| Total route modules | 85 |
| Cross-layer violations | 0 |
| Other violations | 0 |
| Auth-required routes | 10 |
| Rate-limited routes | 78 |
| Public routes | 36 |
| Mixed auth routes | 38 |

## Auth Middleware Compliance

| Module | Phase | requiresAuth | Auth Mode | Declared Handlers | Mount Middleware | Status |
| --- | --- | --- | --- | --- | --- | --- |
| email-routes | early | mixed | mixed | authMiddleware, adminAuthMiddleware, authenticateSuperAdmin | - | ⚠️ Mixed |
| tts-routes | pre-docs | mixed | mixed | authenticateAdmin, authenticateSuperAdmin | - | ⚠️ Mixed |
| librechat-compat-routes | pre-docs | mixed | mixed | authenticateAdmin, authenticateSuperAdmin | libreChatLimiter | ⚠️ Mixed |
| short-url-api-routes | pre-tamper | mixed | mixed | authMiddleware, adminAuthMiddleware, authenticateSuperAdmin | - | ⚠️ Mixed |
| auth-routes | pre-tamper | mixed | none | - | - | ⚠️ Mixed |
| oauth-routes | pre-tamper | mixed | route | authMiddleware, adminAuthMiddleware, oauthTokenAuth, client_secret_basic | - | ⚠️ Mixed |
| totp-routes | pre-tamper | mixed | none | - | - | ⚠️ Mixed |
| admin-routes | pre-tamper | true | mixed | authMiddleware, adminAuthMiddleware, authenticateSuperAdmin | adminLimiter | ✅ Compliant |
| admin-audit-log-routes | pre-tamper | true | mixed | authenticateToken, authenticateAdmin | adminLimiter, authenticateToken | ✅ Compliant |
| api-key-routes | pre-tamper | true | mixed | authMiddleware, authenticateSuperAdmin | - | ✅ Compliant |
| status-routes | pre-tamper | mixed | none | - | - | ⚠️ Mixed |
| turnstile-routes | pre-tamper | mixed | mixed | authenticateAdmin, authenticateSuperAdmin | - | ⚠️ Mixed |
| policy-routes | pre-tamper | mixed | mixed | authenticateToken, adminOnly, authenticateSuperAdmin | - | ⚠️ Mixed |
| tamper-routes | pre-tamper | mixed | mixed | authenticateToken, adminOnly, authenticateSuperAdmin | - | ⚠️ Mixed |
| ticket-routes | pre-tamper | true | mixed | authenticateToken, adminOnly, authenticateSuperAdmin | - | ✅ Compliant |
| command-routes | post-tamper | mixed | mixed | authenticateToken, authenticateSuperAdmin | - | ⚠️ Mixed |
| libre-chat-routes | post-tamper | mixed | mixed | authenticateAdmin, authenticateSuperAdmin | - | ⚠️ Mixed |
| human-check-routes | post-tamper | mixed | mixed | authenticateToken, adminOnly, authenticateSuperAdmin | - | ⚠️ Mixed |
| data-collection-admin-routes | post-tamper | true | mixed | authenticateToken, authenticateAdmin, authenticateSuperAdmin | - | ✅ Compliant |
| ipfs-routes | post-tamper | mixed | mixed | authenticateAdmin, authenticateSuperAdmin | - | ⚠️ Mixed |
| deeplx-routes | post-tamper | true | router | authenticateToken | - | ✅ Compliant |
| lottery-routes | post-tamper | mixed | mixed | authenticateToken, authenticateSuperAdmin | - | ⚠️ Mixed |
| markdown-article-routes | post-tamper | mixed | mixed | authenticateToken, authenticateAdmin, authenticateSuperAdmin | statusLimiter | ⚠️ Mixed |
| log-routes | post-tamper | mixed | mixed | authenticateToken, authenticateSuperAdmin | - | ⚠️ Mixed |
| passkey-routes | post-tamper | mixed | mixed | authenticateToken, authenticateSuperAdmin | - | ⚠️ Mixed |
| image-data-routes | post-tamper | true | route | authenticateToken | - | ✅ Compliant |
| resource-routes | post-tamper | mixed | mixed | authenticateToken, authenticateAdmin, authenticateSuperAdmin | - | ⚠️ Mixed |
| cdk-routes | post-tamper | mixed | mixed | authenticateAdmin, authenticateSuperAdmin | cdkMountLimiter | ⚠️ Mixed |
| webhook-event-routes | post-tamper | true | mixed | authenticateToken, authenticateAdmin, authenticateSuperAdmin | authenticateToken, adminLimiter | ✅ Compliant |
| fbi-wanted-routes | post-tamper | mixed | mixed | authenticateToken, authenticateAdmin, authenticateSuperAdmin | - | ⚠️ Mixed |
| github-billing-routes | post-tamper | mixed | mixed | authenticateToken, authenticateAdmin, authenticateSuperAdmin | githubBillingLimiter | ⚠️ Mixed |
| linuxdo-credit-routes | post-tamper | mixed | route | authMiddleware | - | ⚠️ Mixed |
| ecoenchants-routes | post-tamper | mixed | route | authenticateEcoCustomer, requireEcoAdmin, verifyEcoEnchantsDownloadToken | - | ⚠️ Mixed |
| nexai-routes | post-tamper | mixed | route | nexaiAuthRequired, nexaiAuthOptional | nexaiRequestSignature | ⚠️ Mixed |
| bilibili-sync-routes | post-tamper | true | router | oauthTokenAuth, authenticateToken | - | ✅ Compliant |
| nexai-security-routes | post-tamper | mixed | none | - | nexaiRequestSignature, nexaiSecurityLimiter | ⚠️ Mixed |

## Rate Limit Compliance

| Module | Phase | rateLimited | R-L Mode | Declared Limiters | Mount Limiters | Matched Limiter Modules | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| webhook-routes | pre-parser | true | route | webhookLimiter | - | - | ✅ Compliant |
| ecoenchants-webhook-routes | pre-parser | true | route | ecoenchantsWebhook | - | - | ✅ Compliant |
| data-collection-routes | pre-parser | true | route-module | data-collection-limiter | - | data-collection-limiter | ✅ Compliant |
| root-data-collection-routes | pre-parser | true | route-module | data-collection-limiter | - | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | ✅ Compliant |
| email-routes | early | mixed | none | - | - | - | ⚠️ Mixed |
| outemail-routes | early | true | route | outEmailLimiter, statusQueryLimiter | - | - | ✅ Compliant |
| tts-routes | pre-docs | true | route-module | tts-generate-limiter, tts-history-limiter, tts-jobs-limiter | - | tts-generate-limiter, tts-history-limiter, tts-jobs-limiter | ✅ Compliant |
| librechat-compat-routes | pre-docs | true | mount | libreChatLimiter | libreChatLimiter | - | ✅ Compliant |
| frontend-config-route | pre-tamper | true | route | statusLimiter | - | - | ✅ Compliant |
| auth-logout-route | pre-tamper | true | route-module | auth-limiter | - | auth-limiter | ✅ Compliant |
| short-url-non-api-routes | pre-tamper | true | route | redirectLimiter | - | - | ✅ Compliant |
| short-url-api-routes | pre-tamper | true | route | redirectLimiter, userManageLimiter, adminLimiter, publicCreateLimiter | - | - | ✅ Compliant |
| ip-verification-routes | pre-tamper | true | route | sessionLimiter | - | - | ✅ Compliant |
| auth-routes | pre-tamper | true | route-module | auth-limiter | - | auth-limiter, auth-me-limiter | ✅ Compliant |
| oauth-routes | pre-tamper | true | route-module | oauth-limiter | - | oauth-limiter | ✅ Compliant |
| totp-routes | pre-tamper | true | route-module | totp-limiter | - | totp-limiter | ✅ Compliant |
| admin-routes | pre-tamper | true | mixed | adminLimiter | adminLimiter | - | ✅ Compliant |
| admin-audit-log-routes | pre-tamper | true | mount | adminLimiter | adminLimiter | - | ✅ Compliant |
| api-key-routes | pre-tamper | true | router | apiKeyManagementLimiter | - | - | ✅ Compliant |
| status-routes | pre-tamper | true | route-module | status-limiter | - | status-limiter | ✅ Compliant |
| turnstile-routes | pre-tamper | true | route | publicLimiter, fingerprintLimiter, authenticatedFingerprintLimiter, adminLimiter, configLimiter | - | - | ✅ Compliant |
| policy-routes | pre-tamper | true | route | policyRateLimit, adminRateLimit | - | - | ✅ Compliant |
| tamper-routes | pre-tamper | true | route-module | tamper-limiter | - | tamper-limiter | ✅ Compliant |
| ticket-routes | pre-tamper | true | route | ticketReadLimiter, ticketWriteLimiter, ticketAdminLimiter | - | - | ✅ Compliant |
| command-routes | post-tamper | true | route-module | command-limiter | - | command-limiter | ✅ Compliant |
| libre-chat-routes | post-tamper | true | route-module | libre-chat-limiter | - | libre-chat-limiter | ✅ Compliant |
| human-check-routes | post-tamper | true | route | humanCheckLimiter, verifyLimiter, adminLimiter | - | - | ✅ Compliant |
| data-collection-admin-routes | post-tamper | true | route | dataCollectionLimiter | - | data-collection-limiter | ✅ Compliant |
| ipfs-routes | post-tamper | true | route-module | ipfs-limiter | - | ipfs-limiter | ✅ Compliant |
| network-routes | post-tamper | true | route-module | network-limiter | - | network-limiter | ✅ Compliant |
| data-process-routes | post-tamper | true | route-module | data-process-limiter | - | data-process-limiter | ✅ Compliant |
| deeplx-routes | post-tamper | true | route-module | deeplx-limiter | - | deeplx-limiter | ✅ Compliant |
| deeplx-public-routes | post-tamper | true | route-module | deeplx-public-limiter | - | deeplx-public-limiter | ✅ Compliant |
| lottery-routes | post-tamper | true | route | lotteryLimiter, participationLimiter | - | - | ✅ Compliant |
| media-routes | post-tamper | true | route-module | media-limiter | - | media-limiter | ✅ Compliant |
| markdown-article-routes | post-tamper | true | mixed | statusLimiter, adminLimiter | statusLimiter | - | ✅ Compliant |
| social-routes | post-tamper | true | route-module | social-limiter | - | social-limiter | ✅ Compliant |
| life-routes | post-tamper | true | route-module | life-limiter | - | life-limiter | ✅ Compliant |
| log-routes | post-tamper | true | route | logLimiter | - | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | ✅ Compliant |
| passkey-routes | post-tamper | true | route-module | passkey-limiter | - | passkey-limiter | ✅ Compliant |
| miniapi-routes | post-tamper | true | mount | miniapiLimiter | miniapiLimiter | - | ✅ Compliant |
| anta-routes | post-tamper | true | mount | antaLimiter | antaLimiter | - | ✅ Compliant |
| modlist-routes | post-tamper | true | mount | modlistMountLimiter | modlistMountLimiter | - | ✅ Compliant |
| image-data-routes | post-tamper | true | route | imageDataLimiter | - | - | ✅ Compliant |
| resource-routes | post-tamper | true | route-module | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | - | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | ✅ Compliant |
| cdk-routes | post-tamper | true | mount | cdkMountLimiter | cdkMountLimiter | - | ✅ Compliant |
| webhook-event-routes | post-tamper | true | mount | adminLimiter | adminLimiter | - | ✅ Compliant |
| fbi-wanted-routes | post-tamper | true | route | publicLimiter, adminLimiter, uploadPhotoLimiter | - | - | ✅ Compliant |
| github-billing-routes | post-tamper | true | mount | githubBillingLimiter | githubBillingLimiter | - | ✅ Compliant |
| linuxdo-credit-routes | post-tamper | true | router | linuxdo-credit-notify, linuxdo-credit-recharge, linuxdo-credit-read | - | - | ✅ Compliant |
| ecoenchants-routes | post-tamper | true | route | ecoenchantsLicenseVerify, ecoenchantsLicenseActivate, ecoenchantsLicenseDeactivate, ecoenchantsTelemetryEvents, ecoenchantsCustomerIp, ecoenchantsCustomer, ecoenchantsDownloadIp, ecoenchantsDownload, ecoenchantsAdminIp, ecoenchantsAdmin, ecoenchantsOpsRegister | - | - | ✅ Compliant |
| nexai-routes | post-tamper | true | route | nexaiAuthLimiter, nexaiLoginLimiter, nexaiRegisterLimiter, nexaiOAuthLimiter, nexaiRefreshLimiter, nexaiProfileLimiter, nexaiSyncLimiter, artifactCreateLimiter, artifactViewLimiter, artifactManageLimiter, releaseManifestLimiter | - | - | ✅ Compliant |
| bilibili-sync-routes | post-tamper | true | router | bilibiliSyncLimiter | - | - | ✅ Compliant |
| nexai-security-routes | post-tamper | true | mixed | nexaiSecurityLimiter, nexaiSecurityReportLimiter, nexaiSecurityStatusLimiter, nexaiSecurityAuthLimiter, nexaiSecurityAdminLimiter | nexaiSecurityLimiter | - | ✅ Compliant |
| diagnostics-routes | post-tamper | true | route | integrityLimiter, docsTimeoutLimiter, serverStatusLimiter | - | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | ✅ Compliant |
| ip-info-routes | post-tamper | true | route | ipQueryLimiter, ipReportLimiter, ipLocationLimiter | - | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | ✅ Compliant |
| librechat-compat-api-routes | post-tamper | true | route | lcCompatLimiter | - | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | ✅ Compliant |
| openapi-json-routes | post-tamper | true | route | openapiLimiter | - | auth-limiter, auth-me-limiter, tts-generate-limiter, tts-history-limiter, tts-jobs-limiter, totp-limiter, passkey-limiter, tamper-limiter, command-limiter, libre-chat-limiter, data-collection-limiter, ipfs-limiter, network-limiter, data-process-limiter, deeplx-limiter, deeplx-public-limiter, media-limiter, social-limiter, life-limiter, status-limiter, oauth-limiter | ✅ Compliant |

