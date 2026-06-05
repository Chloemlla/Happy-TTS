import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { authenticateToken } from "../middleware/authenticateToken";
import { ipVerificationMiddleware } from "../middleware/ipVerification";
import { passkeyAutoFixMiddleware } from "../middleware/passkeyAutoFix";
import {
  adminLimiter,
  antaLimiter,
  authLimiter,
  cdkMountLimiter,
  commandLimiter,
  dataCollectionLimiter,
  dataProcessLimiter,
  deeplxLimiter,
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
  passkeyLimiter,
  socialLimiter,
  statusLimiter,
  tamperLimiter,
  totpLimiter,
  ttsLimiter,
} from "../middleware/routeLimiters";
import adminRoutes from "./adminRoutes";
import antaRoutes from "./antaRoutes";
import apiKeyRoutes from "./apiKeyRoutes";
import auditLogRoutes from "./auditLogRoutes";
import authLogoutRoutes from "./authLogoutRoutes";
import authRoutes from "./authRoutes";
import cdkRoutes from "./cdkRoutes";
import commandRoutes from "./commandRoutes";
import compatRoutes from "./compatRoutes";
import dataCollectionAdminRoutes from "./dataCollectionAdminRoutes";
import dataCollectionRoutes from "./dataCollectionRoutes";
import dataProcessRoutes from "./dataProcessRoutes";
import debugConsoleRoutes from "./debugConsoleRoutes";
import deeplxRoutes from "./deeplxRoutes";
import diagnosticsRoutes from "./diagnosticsRoutes";
import emailRoutes from "./emailRoutes";
import ecoEnchantsRoutes from "./ecoEnchantsRoutes";
import ecoEnchantsWebhookRoutes from "./ecoEnchantsWebhookRoutes";
import fbiWantedRoutes from "./fbiWantedRoutes";
import frontendConfigRoutes from "./frontendConfigRoutes";
import githubBillingRoutes from "./githubBillingRoutes";
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
import miniapiRoutes from "./miniapiRoutes";
import modlistRoutes from "./modlistRoutes";
import networkRoutes from "./networkRoutes";
import nexaiRoutes from "./nexaiRoutes";
import nexaiSecurityRoutes from "./nexaiSecurityRoutes";
import openapiJsonRoutes from "./openapiJsonRoutes";
import outemailRoutes from "./outemailRoutes";
import passkeyRoutes from "./passkeyRoutes";
import policyRoutes from "./policyRoutes";
import resourceRoutes from "./resourceRoutes";
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
    | "private-route-open-cors-conflict";
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
    rateLimited: false,
    isPublic: true,
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
      mode: "mount",
      handlers: ["authenticateToken"],
      note: "Audit log ingress is guarded at mount; downstream admin logic remains inside the route implementation.",
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
    rateLimited: false,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authMiddleware"],
      note: "API key management is fully protected by router-level JWT authentication.",
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
    rateLimited: false,
    isPublic: false,
    authPolicy: {
      mode: "router",
      handlers: ["authenticateToken"],
      note: "Ticket routes apply a router-wide JWT guard before all ticket handlers.",
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
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
    securityBypass: {
      ipVerification: {
        value: true,
        reason: "Human-check bootstrap must be callable before IP verification has established trust.",
      },
    },
  },
  {
    name: "debug-console-routes",
    path: "/api/debug-console",
    router: debugConsoleRoutes,
    requiresAuth: "mixed",
    rateLimited: false,
    isPublic: "mixed",
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
    requiresAuth: false,
    rateLimited: true,
    isPublic: true,
  },
  {
    name: "lottery-routes",
    path: "/api/lottery",
    router: lotteryRoutes,
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
    requiresAuth: false,
    rateLimited: false,
    isPublic: true,
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
        "ecoenchantsCustomerIp",
        "ecoenchantsCustomer",
        "ecoenchantsDownloadIp",
        "ecoenchantsDownload",
        "ecoenchantsAdminIp",
        "ecoenchantsAdmin",
        "ecoenchantsOpsRegister",
      ],
      note: "The EcoEnchants router applies dedicated route-level IP and authenticated-subject limiters for license, customer, download, admin, and ops-registration flows.",
    },
  },
  {
    name: "nexai-routes",
    path: "/api/nexai",
    router: nexaiRoutes,
    requiresAuth: "mixed",
    rateLimited: false,
    isPublic: "mixed",
  },
  {
    name: "nexai-security-routes",
    path: "/api/nexai",
    router: nexaiSecurityRoutes,
    middlewares: [nexaiSecurityLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
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
  [passkeyLimiter, "passkeyLimiter"],
  [socialLimiter, "socialLimiter"],
  [statusLimiter, "statusLimiter"],
  [tamperLimiter, "tamperLimiter"],
  [totpLimiter, "totpLimiter"],
  [ttsLimiter, "ttsLimiter"],
]);

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
      };
    }),
  );
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
    "| Name | Phase | Kind | Path | Auth | Rate Limit | Audit Log | Public | Security Bypass |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
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

    lines.push(
      `| ${record.name} | ${record.phase} | ${record.kind} | \`${record.path}\` | ${String(record.requiresAuth)}<br>${authSummary} | ${String(record.rateLimited)}<br>${rateLimitSummary} | ${auditLogSummary} | ${String(record.isPublic)} | ${bypassSummary || "-"} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function registerRouteModules(app: Express, modules: RouteModule[]): void {
  for (const module of modules) {
    assertApiRouteModulePath(module);
    const middlewares = module.middlewares ?? [];
    app.use(module.path, ...middlewares, module.router);
  }
}
