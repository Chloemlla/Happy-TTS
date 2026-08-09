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
