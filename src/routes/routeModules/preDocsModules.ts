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
  },
];
