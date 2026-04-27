import { postTamperRouteModules, preParserRouteModules, preTamperRouteModules } from "../routes";
import { getSecurityPipelineSteps } from "../security/securityPipeline";
import { shouldBypassSecurityComponent } from "../security/securityPolicy";

describe("security pipeline", () => {
  it("keeps the global security middleware order stable", () => {
    const steps = getSecurityPipelineSteps("postBodyParser").map((step) => step.name);
    expect(steps).toEqual(["ip-ban-check", "audit-log", "waf"]);
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

    expect(webhookRoute?.securityBypass?.waf).toBe(true);
    expect(dataCollectionRoute?.securityBypass?.waf).toBe(true);
  });

  it("records mixed and full-route bypasses for API modules", () => {
    const authRoute = preTamperRouteModules.find((route) => route.name === "auth-routes");
    const statusRoute = preTamperRouteModules.find((route) => route.name === "status-routes");
    const humanCheckRoute = postTamperRouteModules.find((route) => route.name === "human-check-routes");

    expect(authRoute?.securityBypass?.ipVerification).toBe("mixed");
    expect(statusRoute?.securityBypass?.ipBan).toBe(true);
    expect(statusRoute?.securityBypass?.ipVerification).toBe(true);
    expect(humanCheckRoute?.securityBypass?.ipVerification).toBe(true);
  });
});
