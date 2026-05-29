import {
  getRouteSecurityBypassFlag,
  postTamperRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  validateRouteGovernance,
} from "../routes";
import { getSecurityPipelineSteps } from "../security/securityPipeline";
import { shouldBypassSecurityComponent } from "../security/securityPolicy";

describe("security pipeline", () => {
  it("keeps the global security middleware order stable", () => {
    const preBodySteps = getSecurityPipelineSteps("preBodyParser").map((step) => step.name);
    const steps = getSecurityPipelineSteps("postBodyParser").map((step) => step.name);
    expect(preBodySteps).toEqual(["ip-ban-check"]);
    expect(steps).toEqual(["audit-log", "waf"]);
  });

  it("keeps tamper protection in its dedicated later phase", () => {
    const steps = getSecurityPipelineSteps("prePostTamperRoutes").map((step) => step.name);
    expect(steps).toEqual(["tamper-protection"]);
  });
});

describe("security bypass policy", () => {
  it("matches the WAF bypass whitelist", () => {
    expect(shouldBypassSecurityComponent("waf", "/api/webhooks/generic")).toBe(true);
    expect(shouldBypassSecurityComponent("waf", "/api/data-collection/events")).toBe(true);
    expect(shouldBypassSecurityComponent("waf", "/api/tts/generate")).toBe(false);
  });

  it("matches the IP verification bypass whitelist", () => {
    expect(shouldBypassSecurityComponent("ipVerification", "/api/turnstile/verify-token")).toBe(true);
    expect(shouldBypassSecurityComponent("ipVerification", "/api/auth/linuxdo/callback")).toBe(true);
    expect(shouldBypassSecurityComponent("ipVerification", "/api/tts/generate")).toBe(false);
  });

  it("matches the IP ban bypass whitelist", () => {
    expect(shouldBypassSecurityComponent("ipBan", "/health")).toBe(true);
    expect(shouldBypassSecurityComponent("ipBan", "/api/status")).toBe(true);
    expect(shouldBypassSecurityComponent("ipBan", "/api/tts/generate")).toBe(false);
  });
});

describe("route registry security metadata", () => {
  it("records pre-parser security exceptions in the registry", () => {
    const webhookRoute = preParserRouteModules.find((route) => route.name === "webhook-routes");
    const dataCollectionRoute = preParserRouteModules.find((route) => route.name === "data-collection-routes");

    expect(webhookRoute && getRouteSecurityBypassFlag(webhookRoute, "waf")).toBe(true);
    expect(dataCollectionRoute && getRouteSecurityBypassFlag(dataCollectionRoute, "waf")).toBe(true);
  });

  it("records mixed and full-route bypasses for API modules", () => {
    const authRoute = preTamperRouteModules.find((route) => route.name === "auth-routes");
    const frontendConfigRoute = preTamperRouteModules.find((route) => route.name === "frontend-config-route");
    const statusRoute = preTamperRouteModules.find((route) => route.name === "status-routes");
    const humanCheckRoute = postTamperRouteModules.find((route) => route.name === "human-check-routes");

    expect(authRoute && getRouteSecurityBypassFlag(authRoute, "ipVerification")).toBe("mixed");
    expect(frontendConfigRoute && getRouteSecurityBypassFlag(frontendConfigRoute, "ipVerification")).toBe(true);
    expect(statusRoute && getRouteSecurityBypassFlag(statusRoute, "ipBan")).toBe(true);
    expect(statusRoute && getRouteSecurityBypassFlag(statusRoute, "ipVerification")).toBe(true);
    expect(humanCheckRoute && getRouteSecurityBypassFlag(humanCheckRoute, "ipVerification")).toBe(true);
  });

  it("keeps route governance validation clean", () => {
    expect(validateRouteGovernance()).toEqual([]);
  });
});
