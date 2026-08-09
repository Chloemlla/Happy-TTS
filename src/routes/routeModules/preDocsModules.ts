import type { RouteModule } from "../index";
import { libreChatLimiter } from "../../middleware/routeLimiters";
import libreChatRoutes from "../libreChatRoutes";
import ttsRoutes from "../ttsRoutes";

export const preDocsRouteModules: RouteModule[] = [
  {
    name: "tts-routes",
    path: "/api/tts",
    router: ttsRoutes,
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateAdmin", "authenticateSuperAdmin"],
      note: "TTS generation is gated by API-key auth; admin history reads are admin-level and clarity config writes are gated to superadmin inside the router.",
    },
    securityBypass: {
      ipVerification: {
        value: "mixed",
        reason:
          "Only the /assets subtree (browser audio streaming with scoped, expiring asset tokens) bypasses IP verification; generation and job endpoints remain gated.",
      },
    },
  },
  {
    name: "librechat-compat-routes",
    path: "/api/librechat",
    router: libreChatRoutes,
    middlewares: [libreChatLimiter],
    requiresAuth: "mixed",
    rateLimited: true,
    isPublic: "mixed",
    authPolicy: {
      mode: "mixed",
      handlers: ["authenticateAdmin", "authenticateSuperAdmin"],
      note: "LibreChat compatibility APIs are mixed; admin users/providers reads are admin-level and user/provider mutations are gated to superadmin inside the router.",
    },
  },
];
