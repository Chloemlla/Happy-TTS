import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { ipVerificationMiddleware } from "../middleware/ipVerification";
import { passkeyAutoFixMiddleware } from "../middleware/passkeyAutoFix";
import {
  adminLimiter,
  antaLimiter,
  authLimiter,
  bilibiliSyncLimiter,
  cdkMountLimiter,
  commandLimiter,
  dataCollectionLimiter,
  dataProcessLimiter,
  deeplxLimiter,
  deeplxPublicLimiter,
  githubBillingLimiter,
  historyLimiter,
  ipfsLimiter,
  libreChatLimiter,
  lifeLimiter,
  mediaLimiter,
  meEndpointLimiter,
  miniapiLimiter,
  modlistMountLimiter,
  networkLimiter,
  nexaiSecurityLimiter,
  oauthLimiter,
  passkeyLimiter,
  socialLimiter,
  statusLimiter,
  tamperLimiter,
  ticketAdminLimiter,
  ticketReadLimiter,
  ticketWriteLimiter,
  totpLimiter,
  ttsLimiter,
} from "../middleware/routeLimiters";
import { adminOnly } from "../middleware/adminOnly";
import { authMiddleware, authenticateAdmin } from "../middleware/auth";
import { authMiddleware as authMiddlewareV2, adminAuthMiddleware } from "../middleware/authMiddleware";
import adminRoutes from "./adminRoutes";
import antaRoutes from "./antaRoutes";
import apiKeyRoutes from "./apiKeyRoutes";
import auditLogRoutes from "./auditLogRoutes";
import authLogoutRoutes from "./authLogoutRoutes";
import authRoutes from "./authRoutes";
import bilibiliSyncRoutes from "./bilibiliSyncRoutes";
import cdkRoutes from "./cdkRoutes";
import commandRoutes from "./commandRoutes";
import compatRoutes from "./compatRoutes";
import dataCollectionAdminRoutes from "./dataCollectionAdminRoutes";
import dataCollectionRoutes from "./dataCollectionRoutes";
import dataProcessRoutes from "./dataProcessRoutes";
import deeplxPublicRoutes from "./deeplxPublicRoutes";
import deeplxRoutes from "./deeplxRoutes";
import diagnosticsRoutes from "./diagnosticsRoutes";
import emailRoutes from "./emailRoutes";
import ecoEnchantsRoutes from "./ecoEnchantsRoutes";
import ecoEnchantsWebhookRoutes from "./ecoEnchantsWebhookRoutes";
import fbiWantedRoutes from "./fbiWantedRoutes";
import frontendConfigRoutes from "./frontendConfigRoutes";
import githubBillingRoutes from "./githubBillingRoutes";
import linuxDoCreditRoutes from "./linuxDoCreditRoutes";
import healthRoutes from "./healthRoutes";
import humanCheckRoutes from "./humanCheckRoutes";
import imageDataRoutes from "./imageDataRoutes";
import ipInfoRoutes from "./ipInfoRoutes";
import ipfsRoutes from "./ipfsRoutes";
import ipVerificationRoutes from "./ipVerificationRoutes";
import libreChatRoutes from "./libreChatRoutes";
import lifeRoutes from "./lifeRoutes";
import logRoutes from "./logRoutes";
import lotteryRoutes from "./lotteryRoutes";
import mediaRoutes from "./mediaRoutes";
import markdownArticleRoutes from "./markdownArticleRoutes";
import miniapiRoutes from "./miniapiRoutes";
import modlistRoutes from "./modlistRoutes";
import networkRoutes from "./networkRoutes";
import nexaiRoutes from "./nexaiRoutes";
import nexaiSecurityRoutes from "./nexaiSecurityRoutes";
import { nexaiRequestSignature } from "../middleware/nexaiRequestSignature";
import openapiJsonRoutes from "./openapiJsonRoutes";
import oauthRoutes from "./oauthRoutes";
import outemailRoutes from "./outemailRoutes";
import passkeyRoutes from "./passkeyRoutes";
import policyRoutes from "./policyRoutes";
import resourceRoutes from "./resourceRoutes";
import rustBenchmarkRoutes from "./rustBenchmarkRoutes";
import { assetLinksRoutes, faviconRoutes } from "./siteMetadataRoutes";
import shortUrlRoutes, { shortUrlRedirectRoutes } from "./shortUrlRoutes";
import socialRoutes from "./socialRoutes";
import statusRouter from "./status";
import tamperRoutes from "./tamperRoutes";
import ticketRoutes from "./ticketRoutes";
import totpRoutes, { totpStatusHandler } from "./totpRoutes";
import ttsRoutes from "./ttsRoutes";
import turnstileRoutes from "./turnstileRoutes";
import webhookEventRoutes from "./webhookEventRoutes";
import webhookRoutes from "./webhookRoutes";
import logger from "../utils/logger";
import type { SecurityComponent } from "../security/securityPolicy";
import { AUDIT_LOG_ADAPTATION_STATUS, AUDIT_LOG_SOURCE, isBackendApiPath } from "../services/auditLogMetadata";

export type RouteMetaFlag = boolean | "mixed";
export type RouteModuleKind = "route" | "limiter" | "middleware";
export type RouteModulePhase = "route-limiters" | "pre-parser" | "early" | "pre-docs" | "pre-tamper" | "post-tamper";

export interface RouteAuthPolicy {
  mode: "mount" | "router" | "route" | "mixed";
  handlers: string[];
  note?: string;
}

export interface RouteRateLimitPolicy {
  mode: "mount" | "route-module" | "route" | "router" | "mixed";
  limiters: string[];
  note?: string;
}

export interface RouteAuditLogPolicy {
  enabled: boolean;
  coverage: "all-api-routes" | "not-applicable";
  adaptationStatus: typeof AUDIT_LOG_ADAPTATION_STATUS | "not-applicable";
  source: typeof AUDIT_LOG_SOURCE | "not-applicable";
  note: string;
}

export interface RouteSecurityBypassEntry {
  value: RouteMetaFlag;
  reason: string;
}

export type RouteSecurityBypass = Partial<Record<SecurityComponent, RouteSecurityBypassEntry>>;

export interface OpenCorsException {
  path: string;
  reason: string;
}

export interface RouteGovernanceViolation {
  moduleName: string;
  path: string;
  phase: RouteModulePhase;
  code:
    | "missing-auth-policy"
    | "missing-auth-handlers"
    | "missing-rate-limit-policy"
    | "missing-rate-limit-target"
    | "missing-audit-log-policy"
    | "missing-security-bypass-reason"
    | "private-route-open-cors-conflict"
    | "auth-middleware-not-found"
    | "rate-limit-not-found"
    | "auth-handler-unknown"
    | "middleware-consistency-violation";
  message: string;
}

export interface RouteAuditRecord {
  name: string;
  path: string;
  phase: RouteModulePhase;
  kind: RouteModuleKind;
  requiresAuth: RouteMetaFlag;
  rateLimited: RouteMetaFlag;
  isPublic: RouteMetaFlag;
  auditLogPolicy: RouteAuditLogPolicy;
  authPolicy?: RouteAuthPolicy;
  rateLimitPolicy?: RouteRateLimitPolicy;
  securityBypass?: RouteSecurityBypass;
  /** Cross-layer: middleware found in the module's middlewares array */
  mountMiddlewareNames?: string[];
  /** Cross-layer: rate limiter modules that scope-overlap this route */
  matchedLimiterModules?: string[];
}

export interface RouteModule {
  name: string;
  path: string;
  router: RequestHandler;
  middlewares?: RequestHandler[];
  kind?: RouteModuleKind;
  requiresAuth: RouteMetaFlag;
  rateLimited: RouteMetaFlag;
  isPublic: RouteMetaFlag;
  authPolicy?: RouteAuthPolicy;
  rateLimitPolicy?: RouteRateLimitPolicy;
  securityBypass?: RouteSecurityBypass;
}

export const NON_API_ROUTE_EXEMPTION_PATHS = [
  "/s",
  "/s/*path",
  "/health",
  "/.well-known/assetlinks.json",
  "/favicon.ico",
] as const;

const antaRequestLogger: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  logger.info(`安踏防伪查询请求: ${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    productId: req.params?.productId || req.body?.productId || "unknown",
  });
  next();
};

const API_ROUTE_PREFIX = "/api";
const NON_API_ROUTE_EXEMPTION_SET = new Set<string>(NON_API_ROUTE_EXEMPTION_PATHS);

export const openCorsExceptions: OpenCorsException[] = [
  {
    path: "/api/shorturl/*path",
    reason: "Public short URL resolution and preflight flow",
  },
  {
    path: "/api/turnstile/verify-token",
    reason: "Public Turnstile verification bootstrap",
  },
  {
    path: "/api/turnstile/public-turnstile",
    reason: "Public Turnstile config bootstrap",
  },
] as const;

export function isExemptNonApiRoutePath(routePath: string): boolean {
  return NON_API_ROUTE_EXEMPTION_SET.has(routePath);
}

export function getRouteSecurityBypassFlag(
  module: Pick<RouteModule, "securityBypass">,
  component: SecurityComponent,
): RouteMetaFlag | undefined {
  return module.securityBypass?.[component]?.value;
}

function assertApiRouteModulePath(module: RouteModule): void {
  if (!module.path.startsWith(API_ROUTE_PREFIX) && !isExemptNonApiRoutePath(module.path)) {
    throw new Error(
      `[routes] Route module "${module.name}" must be mounted under ${API_ROUTE_PREFIX} or match an explicit exemption, received "${module.path}"`,
    );
  }
}

function stripWildcardPath(pathname: string): string {
  return pathname.replace(/\/\*.*$/, "");
}

function normalizeScopedPath(pathname: string): string {
  const normalized = stripWildcardPath(pathname).replace(/\/+$/, "");
  return normalized || "/";
}

function pathScopesOverlap(left: string, right: string): boolean {
  const a = normalizeScopedPath(left);
  const b = normalizeScopedPath(right);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export const routeLimiterModules: RouteModule[] = [
  {
    name: "auth-limiter",
    path: "/api/auth",
    router: authLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "auth-me-limiter",
    path: "/api/auth/me",
    router: meEndpointLimiter,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    rateLimitPolicy: {
      mode: "mount",
      limiters: ["meEndpointLimiter"],
      note: "Dedicated limiter mount for the authenticated /auth/me endpoint",
    },
  },
  {
    name: "tts-generate-limiter",
    path: "/api/tts/generate",
    router: ttsLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "tts-history-limiter",
    path: "/api/tts/history",
    router: historyLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "tts-jobs-limiter",
    path: "/api/tts/jobs",
    router: historyLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "totp-limiter",
    path: "/api/totp",
    router: totpLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "passkey-limiter",
    path: "/api/passkey",
    router: passkeyLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "tamper-limiter",
    path: "/api/tamper",
    router: tamperLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "command-limiter",
    path: "/api/command",
    router: commandLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "libre-chat-limiter",
    path: "/api/libre-chat",
    router: libreChatLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "data-collection-limiter",
    path: "/api/data-collection",
    router: dataCollectionLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "ipfs-limiter",
    path: "/api/ipfs",
    router: ipfsLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "network-limiter",
    path: "/api/network",
    router: networkLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "data-process-limiter",
    path: "/api/data",
    router: dataProcessLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "deeplx-limiter",
    path: "/api/deeplx",
    router: deeplxLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "deeplx-public-limiter",
    path: "/api/public/deeplx",
    router: deeplxPublicLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "media-limiter",
    path: "/api/media",
    router: mediaLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "social-limiter",
    path: "/api/social",
    router: socialLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "life-limiter",
    path: "/api/life",
    router: lifeLimiter,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "status-limiter",
    path: "/api/status",
    router: statusLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "oauth-limiter",
    path: "/api/oauth",
    router: oauthLimiter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
];

export const preParserRouteModules: RouteModule[] = [
  {
    name: "health-route",
    path: "/health",
    router: healthRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipBan: {
        value: true,
        reason: "Liveness/readiness probes must remain available while ban infrastructure is active.",
      },
    },
  },
  {
    name: "api-health-route",
    path: "/api/health",
    router: healthRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipBan: {
        value: true,
        reason: "Canonical API health checks must remain available while ban infrastructure is active.",
      },
    },
  },
  {
    name: "webhook-routes",
    path: "/api/webhooks",
    router: webhookRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["webhookLimiter"],
      note: "Webhook routes apply a dedicated route-level limiter inside the router.",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "Webhook signature verification requires raw payload compatibility before WAF normalization.",
      },
    },
  },
  {
    name: "ecoenchants-webhook-routes",
    path: "/api/ecoenchants/v1/webhooks",
    router: ecoEnchantsWebhookRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["ecoenchantsWebhook"],
      note: "Payment and marketplace webhooks apply a route-level limiter and verify provider signatures from raw payloads.",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "Webhook signature verification requires raw payload compatibility before WAF normalization.",
      },
    },
  },
  {
    name: "data-collection-routes",
    path: "/api/data-collection",
    router: dataCollectionRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["dataCollectionLimiter"],
      note: "Ingress is protected by the dedicated /api/data-collection limiter mount.",
    },
    securityBypass: {
      waf: {
        value: true,
        reason: "Telemetry ingestion accepts browser-originated payloads that the WAF would over-block.",
      },
    },
  },
  {
    name: "root-data-collection-routes",
    path: "/api",
    router: dataCollectionRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["dataCollectionLimiter"],
      note: "The root /api mount shares the same data-collection limiter coverage.",
    },
    securityBypass: {
      waf: {
        value: "mixed",
        reason: "Only the data-collection branch under /api should bypass WAF; sibling routes remain protected.",
      },
    },
  },
];

export const earlyRouteModules: RouteModule[] = [
  {
    name: "email-routes",
    path: "/api/email",
    router: emailRoutes,
    requiresAuth: "mixed",
    rateLimited: "mixed",
    isPublic: "mixed",
  },
  {
    name: "outemail-routes",
    path: "/api/outemail",
    router: outemailRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["outEmailLimiter", "statusQueryLimiter"],
      note: "Public outemail endpoints apply dedicated route-level limiters for send and status flows.",
    },
  },
];

export const preDocsRouteModules: RouteModule[] = [
  {
    name: "tts-routes",
    path: "/api/tts",
    router: ttsRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "librechat-compat-routes",
    path: "/api/librechat",
    router: libreChatRoutes,
    middlewares: [libreChatLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
];

export const preTamperRouteModules: RouteModule[] = [
  {
    name: "frontend-config-route",
    path: "/api/frontend-config",
    router: frontendConfigRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["statusLimiter"],
      note: "Frontend bootstrap config is protected by a route-level status limiter.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Frontend boot config must be reachable before IP verification can initialize.",
      },
      tamperProtection: {
        value: true,
        reason: "Frontend boot config is mounted before tamper protection so first-visit clients can initialize.",
      },
    },
  },
  {
    name: "auth-logout-route",
    path: "/api/auth/logout",
    router: authLogoutRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["auth-limiter"],
      note: "Logout remains covered by the /api/auth limiter mounted earlier in the registry pipeline.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Logout must remain callable to clear local auth state even before IP verification completes.",
      },
      tamperProtection: {
        value: true,
        reason: "Logout is mounted before tamper protection to preserve the historical early-exit behavior.",
      },
    },
  },
  {
    name: "short-url-non-api-routes",
    path: "/s",
    router: shortUrlRedirectRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["redirectLimiter"],
      note: "The non-API /s mount is limited to public short-link redirects; management APIs live under /api/shorturl.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Public short URL resolution must be reachable before browser verification bootstraps.",
      },
      tamperProtection: {
        value: true,
        reason: "Public short URL redirects execute before tamper protection to preserve shared-link behavior.",
      },
    },
  },
  {
    name: "short-url-api-routes",
    path: "/api/shorturl",
    router: shortUrlRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    rateLimitPolicy: {
      mode: "route",
      limiters: ["redirectLimiter", "userManageLimiter", "adminLimiter", "publicCreateLimiter"],
      note: "The short URL router applies dedicated route-level limiters for redirect, user, admin, and public-create flows.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Short URL public and compatibility flows are mounted before IP verification by design.",
      },
      tamperProtection: {
        value: true,
        reason: "The /api/shorturl compatibility mount historically executes before tamper protection.",
      },
    },
  },
  {
    name: "ip-verification-routes",
    path: "/api/ip-verification",
    router: ipVerificationRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["sessionLimiter"],
      note: "IP verification session and completion endpoints apply a route-level session limiter.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "This endpoint bootstraps IP verification and cannot be gated by itself.",
      },
    },
  },
  {
    name: "ip-verification-middleware",
    path: "/api",
    router: ipVerificationMiddleware,
    kind: "middleware",
    requiresAuth: false,
    rateLimited: false,
    isPublic: "mixed",
  },
  {
    name: "auth-routes",
    path: "/api/auth",
    router: authRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["auth-limiter"],
      note: "Authentication endpoints are covered by the dedicated /api/auth limiter mount.",
    },
    securityBypass: {
      waf: {
        value: "mixed",
        reason: "Login and register payloads need selective compatibility exceptions, not a full-module bypass.",
      },
      ipVerification: {
        value: "mixed",
        reason: "Third-party callback and bootstrap branches must remain reachable before verification completes.",
      },
    },
  },
  {
    name: "oauth-routes",
    path: "/api/oauth",
    router: oauthRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authMiddleware", "adminAuthMiddleware", "oauthTokenAuth", "client_secret_basic"],
      note: "Authorization and client/grant management require Synapse admin JWT; userinfo requires OAuth Bearer; token/introspection/revocation authenticate OAuth clients.",
    },
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["oauth-limiter"],
      note: "OAuth endpoints are covered by the dedicated /api/oauth limiter module.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "OAuth token and authorization endpoints must be callable by third-party clients outside browser IP-verification bootstrap.",
      },
      tamperProtection: {
        value: true,
        reason: "OAuth endpoints are mounted before tamper protection so external server-to-server token flows are not blocked by browser tamper state.",
      },
    },
  },
  {
    name: "totp-routes",
    path: "/api/totp",
    router: totpRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "totp-status-route",
    path: "/api/totp/status",
    router: totpStatusHandler as RequestHandler,
    middlewares: [authenticateToken],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "mount",
      handlers: ["authenticateToken"],
      note: "The status endpoint is mounted with an explicit JWT guard.",
    },
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["totpLimiter"],
      note: "Covered by the dedicated /api/totp limiter module.",
    },
  },
  {
    name: "admin-routes",
    path: "/api/admin",
    router: adminRoutes,
    middlewares: [adminLimiter],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authMiddleware", "adminAuthMiddleware"],
      note: "Admin routes enforce authentication and role checks inside the router before handler dispatch.",
    },
    rateLimitPolicy: {
      mode: "mixed",
      limiters: ["adminLimiter"],
      note: "Admin ingress is rate-limited both at mount and within the router for sensitive subflows.",
    },
  },
  {
    name: "admin-audit-log-routes",
    path: "/api/admin/audit-logs",
    router: auditLogRoutes,
    middlewares: [adminLimiter, authenticateToken],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Audit log ingress is JWT-guarded at mount and enforces administrator role checks inside the router.",
    },
    rateLimitPolicy: {
      mode: "mount",
      limiters: ["adminLimiter"],
      note: "Audit log access reuses the stricter admin mount limiter.",
    },
  },
  {
    name: "api-key-routes",
    path: "/api/apikeys",
    router: apiKeyRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authMiddleware"],
      note: "API key management is fully protected by router-level JWT authentication.",
    },
    rateLimitPolicy: {
      mode: "router",
      limiters: ["apiKeyManagementLimiter"],
      note: "API key routes apply a router-wide management limiter after authentication.",
    },
  },
  {
    name: "status-routes",
    path: "/api/status",
    router: statusRouter,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    securityBypass: {
      ipBan: {
        value: true,
        reason: "Status endpoints must remain available for health probes even when ban infrastructure is active.",
      },
      ipVerification: {
        value: true,
        reason: "Operational status must be reachable before user-facing verification bootstraps.",
      },
    },
  },
  {
    name: "turnstile-routes",
    path: "/api/turnstile",
    router: turnstileRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["passkeyLimiter"],
      note: "Passkey endpoints are covered by the dedicated /api/passkey limiter mount.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Turnstile bootstrap routes are intentionally public and must bypass IP verification.",
      },
    },
  },
  {
    name: "policy-routes",
    path: "/api/policy",
    router: policyRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    rateLimitPolicy: {
      mode: "route",
      limiters: ["policyRateLimit", "adminRateLimit"],
      note: "Policy routes enforce separate public and admin rate-limiters at route level.",
    },
  },
  {
    name: "tamper-routes",
    path: "/api/tamper",
    router: tamperRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken", "adminOnly"],
      note: "Public clients may submit signed tamper reports; administrative summary and blocklist actions require JWT admin checks inside the router.",
    },
  },
  {
    name: "ticket-routes",
    path: "/api/tickets",
    router: ticketRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken"],
      note: "Ticket routes apply a router-wide JWT guard before all ticket handlers.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["ticketReadLimiter", "ticketWriteLimiter", "ticketAdminLimiter"],
      note: "Ticket routes apply separate read, write, and admin route-level limiters inside the router.",
    },
  },
];

export const postTamperRouteModules: RouteModule[] = [
  {
    name: "command-routes",
    path: "/api/command",
    router: commandRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "libre-chat-routes",
    path: "/api/libre-chat",
    router: libreChatRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "human-check-routes",
    path: "/api/human-check",
    router: humanCheckRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken", "adminOnly"],
      note: "Public nonce and verification endpoints are open; statistics and trace administration require JWT admin checks.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["humanCheckLimiter", "verifyLimiter", "adminLimiter"],
      note: "Human-check routes apply separate bootstrap, verification, and admin route-level limiters.",
    },
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Human-check bootstrap must be callable before IP verification has established trust.",
      },
    },
  },
  {
    name: "data-collection-admin-routes",
    path: "/api/data-collection/admin",
    router: dataCollectionAdminRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Every admin route composes the guard tuple directly at route level.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["dataCollectionLimiter"],
      note: "The admin data-collection router rate-limits each route through its shared guard tuple.",
    },
  },
  {
    name: "ipfs-routes",
    path: "/api/ipfs",
    router: ipfsRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "network-routes",
    path: "/api/network",
    router: networkRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "data-process-routes",
    path: "/api/data",
    router: dataProcessRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "deeplx-routes",
    path: "/api/deeplx",
    router: deeplxRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken"],
      note: "DeepLX page APIs use a router-wide JWT guard before exposing config or translation actions.",
    },
  },
  {
    name: "deeplx-public-routes",
    path: "/api/public/deeplx",
    router: deeplxPublicRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route-module",
      limiters: ["deeplx-public-limiter"],
      note: "Public translation API is protected by a dedicated loose limiter.",
    },
  },
  {
    name: "lottery-routes",
    path: "/api/lottery",
    router: lotteryRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken"],
      note: "Public lottery read endpoints are open; user participation and administrative mutation routes require JWT authentication.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["lotteryLimiter", "participationLimiter"],
      note: "Lottery routes apply general lottery and stricter participation route-level limiters.",
    },
  },
  {
    name: "media-routes",
    path: "/api/media",
    router: mediaRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "markdown-article-routes",
    path: "/api/articles",
    router: markdownArticleRoutes,
    middlewares: [statusLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Public article reads are open; article creation, updates, publishing, and deletion require administrator JWT checks inside the router.",
    },
    rateLimitPolicy: {
      mode: "mixed",
      limiters: ["statusLimiter", "adminLimiter"],
      note: "Public article reads use the status limiter at mount; administrator mutations apply the stricter admin limiter inside the router.",
    },
  },
  {
    name: "social-routes",
    path: "/api/social",
    router: socialRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "life-routes",
    path: "/api/life",
    router: lifeRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "log-routes",
    path: "/api",
    router: logRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken"],
      note: "Share upload/query flows use an admin operation password; list/delete/archive administration requires JWT admin checks inside the router.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["logLimiter"],
      note: "LogShare upload, query, list, delete, and archive routes share a dedicated route-level limiter.",
    },
  },
  {
    name: "passkey-routes",
    path: "/api/passkey",
    router: passkeyRoutes,
    middlewares: [passkeyAutoFixMiddleware],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "miniapi-routes",
    path: "/api/miniapi",
    router: miniapiRoutes,
    middlewares: [miniapiLimiter],
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "anta-routes",
    path: "/api/anta",
    router: antaRoutes,
    middlewares: [antaLimiter, antaRequestLogger],
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "modlist-routes",
    path: "/api/modlist",
    router: modlistRoutes,
    middlewares: [modlistMountLimiter],
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "image-data-routes",
    path: "/api/image-data",
    router: imageDataRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken"],
      note: "Every image-data route composes JWT authentication directly at route level.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["imageDataLimiter"],
      note: "Image-data validation, metadata lookup, and recording routes share a dedicated route-level limiter.",
    },
  },
  {
    name: "resource-routes",
    path: "/api",
    router: resourceRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "cdk-routes",
    path: "/api/cdks",
    router: cdkRoutes,
    middlewares: [cdkMountLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
  },
  {
    name: "webhook-event-routes",
    path: "/api/webhook-events",
    router: webhookEventRoutes,
    middlewares: [authenticateToken, adminLimiter],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "mount",
      handlers: ["authenticateToken"],
      note: "JWT authentication is enforced at mount; route handlers add admin authorization checks.",
    },
    rateLimitPolicy: {
      mode: "mount",
      limiters: ["adminLimiter"],
      note: "Webhook event administration is protected by the admin mount limiter.",
    },
  },
  {
    name: "fbi-wanted-routes",
    path: "/api/fbi-wanted",
    router: fbiWantedRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Public wanted-list reads use /public routes; administrative list and mutation routes require JWT admin checks.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["publicLimiter", "adminLimiter", "uploadPhotoLimiter"],
      note: "FBI wanted routes apply separate public, admin, and photo-upload route-level limiters.",
    },
  },
  {
    name: "github-billing-routes",
    path: "/api/github-billing",
    router: githubBillingRoutes,
    middlewares: [githubBillingLimiter],
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "linuxdo-credit-routes",
    path: "/api/linuxdo-credit",
    router: linuxDoCreditRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authMiddleware"],
      note: "Notify endpoints are public for merchant callbacks; recharge/order APIs require JWT.",
    },
    rateLimitPolicy: {
      mode: "router",
      limiters: ["linuxdo-credit-notify", "linuxdo-credit-recharge", "linuxdo-credit-read"],
      note: "LINUX DO Credit routes apply route-level limiters inside the router.",
    },
  },
  {
    name: "ecoenchants-routes",
    path: "/api/ecoenchants",
    router: ecoEnchantsRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["authenticateEcoCustomer", "requireEcoAdmin", "verifyEcoEnchantsDownloadToken"],
      note: "Public license boot endpoints are open; ops registration enforces signed activation tokens; customer, download, and admin branches enforce EcoEnchants-specific JWT/admin/download-token guards.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: [
        "ecoenchantsLicenseVerify",
        "ecoenchantsLicenseActivate",
        "ecoenchantsLicenseDeactivate",
        "ecoenchantsTelemetryEvents",
        "ecoenchantsCustomerIp",
        "ecoenchantsCustomer",
        "ecoenchantsDownloadIp",
        "ecoenchantsDownload",
        "ecoenchantsAdminIp",
        "ecoenchantsAdmin",
        "ecoenchantsOpsRegister",
      ],
      note: "The EcoEnchants router applies dedicated route-level IP and authenticated-subject limiters for license, telemetry, customer, download, admin, and ops-registration flows.",
    },
  },
  {
    name: "nexai-routes",
    path: "/api/nexai",
    router: nexaiRoutes,
    middlewares: [nexaiRequestSignature],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "route",
      handlers: ["nexaiAuthRequired", "nexaiAuthOptional"],
      note: "Public auth and artifact view routes are open or optional; profile, sync, and artifact management routes require NexAI authentication.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: [
        "nexaiAuthLimiter",
        "nexaiLoginLimiter",
        "nexaiRegisterLimiter",
        "nexaiOAuthLimiter",
        "nexaiRefreshLimiter",
        "nexaiProfileLimiter",
        "nexaiSyncLimiter",
        "artifactCreateLimiter",
        "artifactViewLimiter",
        "artifactManageLimiter",
        "releaseManifestLimiter",
      ],
      note: "NexAI routes apply dedicated route-level limiters for auth, OAuth, refresh, profile, sync, release manifests, and artifact flows.",
    },
  },
  {
    name: "bilibili-sync-routes",
    path: "/api/bilibili-sync",
    router: bilibiliSyncRoutes,
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken"],
      note: "Bilibili UID binding and sync routes use the existing account JWT and derive user scope from the authenticated request.",
    },
    rateLimitPolicy: {
      mode: "router",
      limiters: ["bilibiliSyncLimiter"],
      note: "All Bilibili binding and sync operations share the authenticated sync limiter.",
    },
  },
  {
    name: "nexai-security-routes",
    path: "/api/nexai",
    router: nexaiSecurityRoutes,
    middlewares: [nexaiRequestSignature, nexaiSecurityLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    rateLimitPolicy: {
      mode: "mixed",
      limiters: [
        "nexaiSecurityLimiter",
        "nexaiSecurityReportLimiter",
        "nexaiSecurityStatusLimiter",
        "nexaiSecurityAuthLimiter",
        "nexaiSecurityAdminLimiter",
      ],
      note: "NexAI security routes keep the mount limiter and add route-level createLimiter handlers for CodeQL-visible coverage on auth and admin endpoints.",
    },
  },
  {
    name: "rust-benchmark-routes",
    path: "/api/rust-benchmark",
    router: rustBenchmarkRoutes,
    middlewares: [adminLimiter],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken", "adminOnly"],
      note: "Rust benchmark routes are guarded inside the router and are available only to administrators.",
    },
    rateLimitPolicy: {
      mode: "mount",
      limiters: ["adminLimiter"],
      note: "Benchmark start, stop, and status endpoints share the admin limiter at mount time.",
    },
  },
  {
    name: "diagnostics-routes",
    path: "/api",
    router: diagnosticsRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["integrityLimiter", "docsTimeoutLimiter", "serverStatusLimiter"],
      note: "Diagnostics and operational endpoints apply dedicated route-level limiters.",
    },
  },
  {
    name: "ip-info-routes",
    path: "/api",
    router: ipInfoRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["ipQueryLimiter", "ipReportLimiter", "ipLocationLimiter"],
      note: "IP query, report, and location endpoints apply dedicated route-level limiters.",
    },
  },
  {
    name: "librechat-compat-api-routes",
    path: "/api",
    router: compatRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["lcCompatLimiter"],
      note: "LibreChat compatibility endpoints apply their dedicated route-level limiter.",
    },
  },
  {
    name: "openapi-json-routes",
    path: "/api",
    router: openapiJsonRoutes,
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
    rateLimitPolicy: {
      mode: "route",
      limiters: ["openapiLimiter"],
      note: "OpenAPI JSON endpoints apply the dedicated route-level OpenAPI limiter.",
    },
  },
  {
    name: "assetlinks-route",
    path: "/.well-known/assetlinks.json",
    router: assetLinksRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
  },
  {
    name: "favicon-route",
    path: "/favicon.ico",
    router: faviconRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
  },
];

const routeModuleGroups: Array<{ phase: RouteModulePhase; kind: RouteModuleKind; modules: RouteModule[] }> = [
  { phase: "route-limiters", kind: "limiter", modules: routeLimiterModules },
  { phase: "pre-parser", kind: "route", modules: preParserRouteModules },
  { phase: "early", kind: "route", modules: earlyRouteModules },
  { phase: "pre-docs", kind: "route", modules: preDocsRouteModules },
  { phase: "pre-tamper", kind: "route", modules: preTamperRouteModules },
  { phase: "post-tamper", kind: "route", modules: postTamperRouteModules },
];

const knownMountLimiters = new Map<RequestHandler, string>([
  [adminLimiter, "adminLimiter"],
  [antaLimiter, "antaLimiter"],
  [authLimiter, "authLimiter"],
  [cdkMountLimiter, "cdkMountLimiter"],
  [commandLimiter, "commandLimiter"],
  [dataCollectionLimiter, "dataCollectionLimiter"],
  [dataProcessLimiter, "dataProcessLimiter"],
  [deeplxLimiter, "deeplxLimiter"],
  [deeplxPublicLimiter, "deeplxPublicLimiter"],
  [githubBillingLimiter, "githubBillingLimiter"],
  [historyLimiter, "historyLimiter"],
  [ipfsLimiter, "ipfsLimiter"],
  [libreChatLimiter, "libreChatLimiter"],
  [lifeLimiter, "lifeLimiter"],
  [mediaLimiter, "mediaLimiter"],
  [meEndpointLimiter, "meEndpointLimiter"],
  [miniapiLimiter, "miniapiLimiter"],
  [modlistMountLimiter, "modlistMountLimiter"],
  [networkLimiter, "networkLimiter"],
  [nexaiSecurityLimiter, "nexaiSecurityLimiter"],
  [oauthLimiter, "oauthLimiter"],
  [passkeyLimiter, "passkeyLimiter"],
  [socialLimiter, "socialLimiter"],
  [statusLimiter, "statusLimiter"],
  [tamperLimiter, "tamperLimiter"],
  [ticketAdminLimiter, "ticketAdminLimiter"],
  [ticketReadLimiter, "ticketReadLimiter"],
  [ticketWriteLimiter, "ticketWriteLimiter"],
  [totpLimiter, "totpLimiter"],
  [ttsLimiter, "ttsLimiter"],
]);

/**
 * Known auth middleware function references used for cross-layer validation.
 * Maps a middleware function to its canonical name so the governance system
 * can verify that declared auth handlers are actually present in the module's
 * middleware chain.
 */
const knownAuthMiddleware = new Map<RequestHandler, string>([
  [authenticateToken, "authenticateToken"],
  [authMiddleware, "authMiddleware"],
  [authMiddlewareV2, "authMiddleware"],
  [adminAuthMiddleware, "adminAuthMiddleware"],
  [authenticateAdmin, "authenticateAdmin"],
  [adminOnly, "adminOnly"],
  [nexaiRequestSignature, "nexaiRequestSignature"],
]);

/**
 * Known auth handler names used in route-level or router-level authPolicy
 * declarations. These are names that appear in the route registry but are
 * implemented in middleware files that may not be directly importable in
 * this module. Any handler name used in authPolicy.handlers must be listed
 * here or be a known function reference in knownAuthMiddleware.
 */
const knownAuthHandlerNames = new Set([
  "authenticateToken",
  "authMiddleware",
  "adminAuthMiddleware",
  "authenticateAdmin",
  "adminOnly",
  "nexaiAuthRequired",
  "nexaiAuthOptional",
  "nexaiRequestSignature",
  "authenticateEcoCustomer",
  "requireEcoAdmin",
  "verifyEcoEnchantsDownloadToken",
  "oauthTokenAuth",
  "client_secret_basic",
]);

/**
 * Validate that auth middleware declared in authPolicy is actually present
 * in the module's middleware chain. This bridges the gap between route
 * registry declarations and the actual Express middleware composition.
 */
function validateAuthMiddlewarePresence(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const isConcreteRoute = record.kind === "route";

  if (!isConcreteRoute || record.requiresAuth !== true || !record.authPolicy) {
    return violations;
  }

  const declaredHandlers = new Set(record.authPolicy.handlers.map((h) => h.toLowerCase()));

  switch (record.authPolicy.mode) {
    case "mount": {
      // For mount mode, auth middleware should be in the module's middlewares array
      const mountHandlers = new Set(
        (module.middlewares || [])
          .map((mw) => knownAuthMiddleware.get(mw))
          .filter(Boolean)
          .map((name) => name!.toLowerCase()),
      );

      for (const declared of declaredHandlers) {
        if (!mountHandlers.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "auth-middleware-not-found",
            message: `Route module "${record.name}" declares authPolicy.mode="mount" with handler "${declared}" but the middleware is not found in the module's middlewares array.`,
          });
        }
      }
      break;
    }
    case "router": {
      // For router mode, verify that the declared handlers are known middleware names.
      // Full router-level validation requires inspecting the router's internal stack,
      // which is done separately via validateRouterMiddlewarePresence().
      const knownHandlerNames = new Set(
        Array.from(knownAuthHandlerNames).map((name) => name.toLowerCase()),
      );

      for (const declared of declaredHandlers) {
        if (!knownHandlerNames.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "auth-handler-unknown",
            message: `Route module "${record.name}" declares authPolicy.mode="router" with handler "${declared}" which is not in the known auth middleware registry.`,
          });
        }
      }
      break;
    }
    case "route": {
      // Route-level auth is harder to validate statically, but we can check
      // that the handler names are at least known.
      const knownHandlerNames = new Set(
        Array.from(knownAuthHandlerNames).map((name) => name.toLowerCase()),
      );

      for (const declared of declaredHandlers) {
        if (!knownHandlerNames.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "auth-handler-unknown",
            message: `Route module "${record.name}" declares authPolicy.mode="route" with handler "${declared}" which is not in the known auth middleware registry.`,
          });
        }
      }
      break;
    }
    case "mixed":
      break;
  }

  return violations;
}

/**
 * Validate that rate limiters declared in rateLimitPolicy are actually present
 * in the module's middleware chain. This verifies that rate limiting declarations
 * match the actual Express middleware composition.
 */
function validateRateLimitApplied(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const isConcreteRoute = record.kind === "route";

  if (!isConcreteRoute || record.rateLimited !== true || !record.rateLimitPolicy) {
    return violations;
  }

  const declaredLimiters = new Set(record.rateLimitPolicy.limiters.map((l) => l.toLowerCase()));

  switch (record.rateLimitPolicy.mode) {
    case "mount": {
      // For mount mode, limiters should be in the module's middlewares array
      const mountLimiters = new Set(
        (module.middlewares || [])
          .map((mw) => knownMountLimiters.get(mw))
          .filter(Boolean)
          .map((name) => name!.toLowerCase()),
      );

      for (const declared of declaredLimiters) {
        if (!mountLimiters.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "rate-limit-not-found",
            message: `Route module "${record.name}" declares rateLimitPolicy.mode="mount" with limiter "${declared}" but it is not found in the module's middlewares array.`,
          });
        }
      }
      break;
    }
    case "route-module": {
      // For route-module mode, the limiter should be registered as a routeLimiterModule
      const declaredLimiterNames = new Set(
        routeLimiterModules.map((lm) => lm.name.toLowerCase()),
      );

      for (const declared of declaredLimiters) {
        if (!declaredLimiterNames.has(declared)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "rate-limit-not-found",
            message: `Route module "${record.name}" declares rateLimitPolicy.mode="route-module" with limiter "${declared}" but no matching route limiter module is registered.`,
          });
        }
      }
      break;
    }
    case "router":
    case "route":
    case "mixed":
      break;
  }

  return violations;
}

/**
 * Validate that the module's middleware composition is consistent with its
 * declared auth and rate-limit policies. This catches cases where middleware
 * is present in the array but not declared in the policy, or vice versa.
 */
function validateMiddlewareConsistency(record: RouteAuditRecord, module: RouteModule): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];
  const isConcreteRoute = record.kind === "route";

  if (!isConcreteRoute) {
    return violations;
  }

  // Check for auth middleware in the middlewares array that isn't declared in authPolicy
  if (module.middlewares && module.middlewares.length > 0) {
    const mountAuthHandlers = module.middlewares
      .map((mw) => knownAuthMiddleware.get(mw))
      .filter(Boolean) as string[];

    for (const handlerName of mountAuthHandlers) {
      if (
        record.requiresAuth === true &&
        record.authPolicy &&
        !record.authPolicy.handlers.some((h) => h.toLowerCase() === handlerName.toLowerCase())
      ) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "middleware-consistency-violation",
          message: `Route module "${record.name}" has auth middleware "${handlerName}" in its middlewares array but it is not declared in authPolicy.handlers.`,
        });
      }
    }

    // Check for rate limiters in the middlewares array that aren't declared in rateLimitPolicy
    const mountLimiters = module.middlewares
      .map((mw) => knownMountLimiters.get(mw))
      .filter(Boolean) as string[];

    for (const limiterName of mountLimiters) {
      if (
        record.rateLimited === true &&
        record.rateLimitPolicy &&
        !record.rateLimitPolicy.limiters.some((l) => l.toLowerCase() === limiterName.toLowerCase())
      ) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "middleware-consistency-violation",
          message: `Route module "${record.name}" has rate limiter "${limiterName}" in its middlewares array but it is not declared in rateLimitPolicy.limiters.`,
        });
      }
    }
  }

  return violations;
}

function getModuleKind(module: RouteModule, defaultKind: RouteModuleKind): RouteModuleKind {
  return module.kind || defaultKind;
}

function hasNonEmptyText(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

function inferRateLimitPolicy(module: RouteModule, kind: RouteModuleKind): RouteRateLimitPolicy | undefined {
  if (kind !== "route") {
    return module.rateLimitPolicy;
  }

  if (module.rateLimitPolicy) {
    return module.rateLimitPolicy;
  }

  if (module.rateLimited !== true) {
    return undefined;
  }

  const mountLimiters = (module.middlewares || [])
    .map((middleware) => knownMountLimiters.get(middleware))
    .filter((value): value is string => Boolean(value));
  if (mountLimiters.length) {
    return {
      mode: "mount",
      limiters: mountLimiters,
      note: "Inferred from mounted limiter middleware declared on the route module.",
    };
  }

  const matchedLimiterModules = routeLimiterModules
    .filter((limiterModule) => pathScopesOverlap(module.path, limiterModule.path))
    .map((limiterModule) => limiterModule.name);
  if (matchedLimiterModules.length) {
    return {
      mode: "route-module",
      limiters: matchedLimiterModules,
      note: "Inferred from dedicated limiter modules mounted earlier in the registry pipeline.",
    };
  }

  return undefined;
}

function inferAuditLogPolicy(module: RouteModule): RouteAuditLogPolicy {
  const routePath = normalizeScopedPath(module.path);

  if (!isBackendApiPath(routePath)) {
    return {
      enabled: false,
      coverage: "not-applicable",
      adaptationStatus: "not-applicable",
      source: "not-applicable",
      note: "Non-API route; global API audit coverage is not applicable.",
    };
  }

  return {
    enabled: true,
    coverage: "all-api-routes",
    adaptationStatus: AUDIT_LOG_ADAPTATION_STATUS,
    source: AUDIT_LOG_SOURCE,
    note: "Covered by the global audit middleware mounted in the preBodyParser security phase before API route modules.",
  };
}

export function getAllRouteAuditRecords(): RouteAuditRecord[] {
  return routeModuleGroups.flatMap(({ phase, kind, modules }) =>
    modules.map((module) => {
      const resolvedKind = getModuleKind(module, kind);

      // Cross-layer: resolve mount middleware names
      const mountMiddlewareNames = (module.middlewares || [])
        .map((mw) => {
          const known = knownAuthMiddleware.get(mw);
          if (known) return known;
          const limiter = knownMountLimiters.get(mw);
          if (limiter) return limiter;
          return undefined;
        })
        .filter(Boolean) as string[];

      // Cross-layer: resolve matched limiter modules
      const matchedLimiterModules = routeLimiterModules
        .filter((limiterModule) => pathScopesOverlap(module.path, limiterModule.path))
        .map((limiterModule) => limiterModule.name);

      return {
        name: module.name,
        path: module.path,
        phase,
        kind: resolvedKind,
        requiresAuth: module.requiresAuth,
        rateLimited: module.rateLimited,
        isPublic: module.isPublic,
        auditLogPolicy: inferAuditLogPolicy(module),
        authPolicy: module.authPolicy,
        rateLimitPolicy: inferRateLimitPolicy(module, resolvedKind),
        securityBypass: module.securityBypass,
        mountMiddlewareNames: mountMiddlewareNames.length > 0 ? mountMiddlewareNames : undefined,
        matchedLimiterModules: matchedLimiterModules.length > 0 ? matchedLimiterModules : undefined,
      };
    }),
  );
}

/**
 * Get all route module definitions (including non-audit limiter/middleware modules)
 * keyed by name for cross-layer validation lookup.
 */
const allRouteModules: RouteModule[] = [
  ...routeLimiterModules,
  ...preParserRouteModules,
  ...earlyRouteModules,
  ...preDocsRouteModules,
  ...preTamperRouteModules,
  ...postTamperRouteModules,
];

function findRouteModule(name: string): RouteModule | undefined {
  return allRouteModules.find((m) => m.name === name);
}

export function validateRouteGovernance(): RouteGovernanceViolation[] {
  const violations: RouteGovernanceViolation[] = [];

  for (const record of getAllRouteAuditRecords()) {
    const isConcreteRoute = record.kind === "route";

    if (isConcreteRoute && record.requiresAuth === true) {
      if (!record.authPolicy) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-auth-policy",
          message: `Route module "${record.name}" requires authentication but does not declare an authPolicy in the route registry.`,
        });
      } else if (!record.authPolicy.handlers.length) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-auth-handlers",
          message: `Route module "${record.name}" requires authentication but authPolicy.handlers is empty.`,
        });
      }
    }

    if (isConcreteRoute && record.rateLimited === true) {
      if (!record.rateLimitPolicy) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-rate-limit-policy",
          message: `Route module "${record.name}" is marked rateLimited=true but does not declare a rateLimitPolicy.`,
        });
      } else if (!record.rateLimitPolicy.limiters.length) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-rate-limit-target",
          message: `Route module "${record.name}" is marked rateLimited=true but rateLimitPolicy.limiters is empty.`,
        });
      }
    }

    if (
      isConcreteRoute &&
      isBackendApiPath(normalizeScopedPath(record.path)) &&
      (!record.auditLogPolicy.enabled || record.auditLogPolicy.adaptationStatus !== AUDIT_LOG_ADAPTATION_STATUS)
    ) {
      violations.push({
        moduleName: record.name,
        path: record.path,
        phase: record.phase,
        code: "missing-audit-log-policy",
        message: `Route module "${record.name}" is an API route but is not marked as completed for audit log coverage.`,
      });
    }

    for (const [component, entry] of Object.entries(record.securityBypass || {})) {
      if (!hasNonEmptyText(entry?.reason)) {
        violations.push({
          moduleName: record.name,
          path: record.path,
          phase: record.phase,
          code: "missing-security-bypass-reason",
          message: `Route module "${record.name}" bypasses ${component} without a non-empty reason.`,
        });
      }
    }

    if (isConcreteRoute && record.isPublic === false) {
      for (const exception of openCorsExceptions) {
        if (pathScopesOverlap(record.path, exception.path)) {
          violations.push({
            moduleName: record.name,
            path: record.path,
            phase: record.phase,
            code: "private-route-open-cors-conflict",
            message: `Route module "${record.name}" is private but overlaps open CORS exception "${exception.path}".`,
          });
        }
      }
    }

    // === Cross-layer validation ===
    if (isConcreteRoute) {
      const module = findRouteModule(record.name);
      if (module) {
        violations.push(
          ...validateAuthMiddlewarePresence(record, module),
          ...validateRateLimitApplied(record, module),
          ...validateMiddlewareConsistency(record, module),
        );
      }
    }
  }

  return violations;
}

export function assertRouteGovernance(): void {
  const violations = validateRouteGovernance();
  if (!violations.length) {
    return;
  }

  const formatted = violations
    .map((violation) => `[${violation.phase}] ${violation.moduleName} (${violation.path}) ${violation.code}: ${violation.message}`)
    .join("\n");
  throw new Error(`[routes] Route governance validation failed:\n${formatted}`);
}

export function renderRouteAuditMarkdown(records: RouteAuditRecord[], violations: RouteGovernanceViolation[] = []): string {
  const lines = [
    "# Route Governance Audit",
    "",
    `Generated route modules: ${records.length}`,
    `Validation violations: ${violations.length}`,
    "",
  ];

  if (violations.length) {
    lines.push("## Validation Findings", "");
    for (const violation of violations) {
      lines.push(`- [${violation.phase}] \`${violation.moduleName}\` \`${violation.path}\`: ${violation.message}`);
    }
    lines.push("");
  }

  lines.push(
    "## Route Registry",
    "",
    "| Name | Phase | Kind | Path | Auth | Rate Limit | Audit Log | Public | Security Bypass | Mount Middleware | Matched Limiters |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const record of records) {
    const bypassSummary = Object.entries(record.securityBypass || {})
      .map(([component, entry]) => `${component}=${entry.value} (${entry.reason})`)
      .join("<br>");
    const authSummary = record.authPolicy
      ? `${record.authPolicy.mode}: ${record.authPolicy.handlers.join(", ")}`
      : "-";
    const rateLimitSummary = record.rateLimitPolicy
      ? `${record.rateLimitPolicy.mode}: ${record.rateLimitPolicy.limiters.join(", ")}`
      : "-";
    const auditLogSummary = `${record.auditLogPolicy.adaptationStatus}<br>${record.auditLogPolicy.coverage}<br>${record.auditLogPolicy.source}`;
    const mountMiddlewareSummary = (record.mountMiddlewareNames || []).join(", ") || "-";
    const matchedLimiterSummary = (record.matchedLimiterModules || []).join(", ") || "-";

    lines.push(
      `| ${record.name} | ${record.phase} | ${record.kind} | \`${record.path}\` | ${String(record.requiresAuth)}<br>${authSummary} | ${String(record.rateLimited)}<br>${rateLimitSummary} | ${auditLogSummary} | ${String(record.isPublic)} | ${bypassSummary || "-"} | ${mountMiddlewareSummary} | ${matchedLimiterSummary} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Generate a cross-layer compliance report focused on auth middleware and
 * rate limiter consistency between route registry declarations and actual
 * Express middleware composition.
 */
export function renderCrossLayerComplianceReport(
  records: RouteAuditRecord[],
  violations: RouteGovernanceViolation[] = [],
): string {
  const crossLayerViolations = violations.filter(
    (v) =>
      v.code === "auth-middleware-not-found" ||
      v.code === "rate-limit-not-found" ||
      v.code === "auth-handler-unknown" ||
      v.code === "middleware-consistency-violation",
  );
  const otherViolations = violations.filter((v) => !crossLayerViolations.includes(v));

  const lines = [
    "# Cross-Layer Compliance Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Total route modules | ${records.length} |`,
    `| Cross-layer violations | ${crossLayerViolations.length} |`,
    `| Other violations | ${otherViolations.length} |`,
    `| Auth-required routes | ${records.filter((r) => r.requiresAuth === true).length} |`,
    `| Rate-limited routes | ${records.filter((r) => r.rateLimited === true).length} |`,
    `| Public routes | ${records.filter((r) => r.isPublic === true).length} |`,
    `| Mixed auth routes | ${records.filter((r) => r.requiresAuth === "mixed").length} |`,
    "",
  ];

  if (crossLayerViolations.length) {
    lines.push("## Cross-Layer Violations", "");
    for (const violation of crossLayerViolations) {
      lines.push(`- [${violation.code}] \`${violation.moduleName}\` (\`${violation.path}\`, ${violation.phase}): ${violation.message}`);
    }
    lines.push("");
  }

  if (otherViolations.length) {
    lines.push("## Other Governance Violations", "");
    for (const violation of otherViolations) {
      lines.push(`- [${violation.code}] \`${violation.moduleName}\` (\`${violation.path}\`, ${violation.phase}): ${violation.message}`);
    }
    lines.push("");
  }

  // Auth middleware compliance matrix
  lines.push("## Auth Middleware Compliance", "");
  lines.push("| Module | Phase | requiresAuth | Auth Mode | Declared Handlers | Mount Middleware | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");

  const authRecords = records.filter((r) => r.kind === "route" && r.requiresAuth !== false);
  for (const record of authRecords) {
    const authMode = record.authPolicy?.mode || "none";
    const declaredHandlers = record.authPolicy?.handlers.join(", ") || "-";
    const mountMiddleware = (record.mountMiddlewareNames || []).join(", ") || "-";

    const hasViolation = crossLayerViolations.some(
      (v) => v.moduleName === record.name && (v.code === "auth-middleware-not-found" || v.code === "auth-handler-unknown" || v.code === "middleware-consistency-violation"),
    );
    const status = hasViolation ? "❌ VIOLATION" : record.requiresAuth === true ? "✅ Compliant" : "⚠️ Mixed";

    lines.push(`| ${record.name} | ${record.phase} | ${String(record.requiresAuth)} | ${authMode} | ${declaredHandlers} | ${mountMiddleware} | ${status} |`);
  }

  lines.push("");

  // Rate limit compliance matrix
  lines.push("## Rate Limit Compliance", "");
  lines.push("| Module | Phase | rateLimited | R-L Mode | Declared Limiters | Mount Limiters | Matched Limiter Modules | Status |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");

  const rateLimitedRecords = records.filter((r) => r.kind === "route" && r.rateLimited !== false);
  for (const record of rateLimitedRecords) {
    const rlMode = record.rateLimitPolicy?.mode || "none";
    const declaredLimiters = record.rateLimitPolicy?.limiters.join(", ") || "-";
    const mountLimiters = (record.mountMiddlewareNames || []).filter((n) => n.endsWith("Limiter")).join(", ") || "-";
    const matchedModules = (record.matchedLimiterModules || []).join(", ") || "-";

    const hasViolation = crossLayerViolations.some(
      (v) => v.moduleName === record.name && (v.code === "rate-limit-not-found" || v.code === "middleware-consistency-violation"),
    );
    const status = hasViolation ? "❌ VIOLATION" : record.rateLimited === true ? "✅ Compliant" : "⚠️ Mixed";

    lines.push(`| ${record.name} | ${record.phase} | ${String(record.rateLimited)} | ${rlMode} | ${declaredLimiters} | ${mountLimiters} | ${matchedModules} | ${status} |`);
  }

  lines.push("");

  return `${lines.join("\n")}\n`;
}

export function registerRouteModules(app: Express, modules: RouteModule[]): void {
  for (const module of modules) {
    assertApiRouteModulePath(module);
    const middlewares = module.middlewares ?? [];
    app.use(module.path, ...middlewares, module.router);
  }
}
