import type { RouteModule } from "../index";
import { adminOnly } from "../../middleware/adminOnly";
import { authenticateToken } from "../../middleware/authenticateToken";
import { authenticateAdmin } from "../../middleware/auth";
import { ipVerificationMiddleware } from "../../middleware/ipVerification";
import { adminLimiter } from "../../middleware/routeLimiters";
import adminRoutes from "../adminRoutes";
import apiKeyRoutes from "../apiKeyRoutes";
import auditLogRoutes from "../auditLogRoutes";
import authLogoutRoutes from "../authLogoutRoutes";
import authRoutes from "../authRoutes";
import frontendConfigRoutes from "../frontendConfigRoutes";
import ipVerificationRoutes from "../ipVerificationRoutes";
import oauthRoutes from "../oauthRoutes";
import policyRoutes from "../policyRoutes";
import shortUrlRoutes, { shortUrlRedirectRoutes } from "../shortUrlRoutes";
import statusRouter from "../status";
import tamperRoutes from "../tamperRoutes";
import ticketRoutes from "../ticketRoutes";
import totpRoutes from "../totpRoutes";
import turnstileRoutes from "../turnstileRoutes";

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
    authPolicy: {
      mode: "mixed",
      handlers: ["authMiddleware", "adminAuthMiddleware", "authenticateSuperAdmin"],
      note: "Public and user self-service short-link flows use JWT; admin listing/export reads are admin-level; creation, batch-delete, and migration writes are gated to superadmin inside the router.",
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
    name: "admin-routes",
    path: "/api/admin",
    router: adminRoutes,
    middlewares: [adminLimiter],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "mixed",
      handlers: ["authMiddleware", "adminAuthMiddleware", "authenticateSuperAdmin"],
      note: "Admin ingress enforces authentication and admin-role checks at mount; read endpoints are admin-level while user/config/announcement writes are gated to superadmin inside the router.",
    },
    rateLimitPolicy: {
      mode: "mixed",
      limiters: ["adminLimiter"],
      note: "Admin ingress is rate-limited once at mount; the router-level duplicate was removed to avoid splitting the admin quota (G11-06).",
    },
  },
  {
    name: "admin-audit-log-routes",
    path: "/api/admin/audit-logs",
    router: auditLogRoutes,
    middlewares: [authenticateToken],
    requiresAuth: true,
    rateLimited: true,
    isPublic: false,
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "authenticateAdmin"],
      note: "Audit log ingress is JWT-guarded at mount and enforces administrator role checks inside the router.",
    },
    rateLimitPolicy: {
      mode: "mixed",
      limiters: [],
      note: "Audit log reads are rate-limited once by the /api/admin mount limiter (adminLimiter); no module-level limiter is applied here to avoid double-counting the same instance.",
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
      mode: "mixed",
      handlers: ["authMiddleware", "authenticateSuperAdmin"],
      note: "API key reads (permissions, rates, listing) are admin-level; creation, adjustment, revocation, enable, and deletion are gated to superadmin inside the router.",
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
      mode: "route",
      limiters: ["publicLimiter", "fingerprintLimiter", "authenticatedFingerprintLimiter", "adminLimiter", "configLimiter"],
      note: "Turnstile endpoints apply dedicated route-level limiters for public, fingerprint, administrative, and configuration flows.",
    },
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateAdmin", "authenticateSuperAdmin"],
      note: "Bootstrap and verify endpoints are public; admin stats reads (fingerprint, IP-ban, scheduler) are admin-level; IP-ban and config writes are gated to superadmin inside the router.",
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
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateToken", "adminOnly", "authenticateSuperAdmin"],
      note: "Public policy reads are open; admin stats are admin-level; the admin cleanup mutation is gated to superadmin inside the router.",
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
      mode: "mixed",
      handlers: ["authenticateToken", "adminOnly", "authenticateSuperAdmin"],
      note: "Public clients may submit signed tamper reports; administrative summary reads are admin-level and blocklist mutations are gated to superadmin inside the router.",
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
      mode: "mixed",
      handlers: ["authenticateToken", "adminOnly", "authenticateSuperAdmin"],
      note: "All ticket routes apply a router-wide JWT guard; admin listing reads are admin-level and status/message mutations are gated to superadmin inside the router.",
    },
    rateLimitPolicy: {
      mode: "route",
      limiters: ["ticketReadLimiter", "ticketWriteLimiter", "ticketAdminLimiter"],
      note: "Ticket routes apply separate read, write, and admin route-level limiters inside the router.",
    },
  },
];
