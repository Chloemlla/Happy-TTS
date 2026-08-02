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
