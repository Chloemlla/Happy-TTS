import type { RouteModule } from "../index";
import emailRoutes from "../emailRoutes";
import outemailRoutes from "../outemailRoutes";

export const earlyRouteModules: RouteModule[] = [
  {
    name: "email-routes",
    path: "/api/email",
    router: emailRoutes,
    requiresAuth: "mixed",
    rateLimited: "mixed",
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authMiddleware", "adminAuthMiddleware", "authenticateSuperAdmin"],
      note: "Admin reads (status, quota, domains) require JWT plus an admin-role check at mount; send and domain-management writes are gated to superadmin at route level.",
    },
  },
  {
    name: "outemail-routes",
    path: "/api/outemail",
    router: outemailRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    rateLimitPolicy: {
      mode: "route",
      limiters: ["outEmailLimiter", "statusQueryLimiter"],
      note: "Public outemail endpoints apply dedicated route-level limiters; records reads are admin-gated with the status limiter.",
    },
    authPolicy: {
      mode: "mixed",
      handlers: ["authMiddleware", "adminAuthMiddleware"],
      note: "Send/quota/status/domain endpoints are public (send authenticates via API key/code); records and records/:id reads require a JWT session plus admin role.",
    },
  },
];
