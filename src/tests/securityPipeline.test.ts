import {
  getRouteSecurityBypassFlag,
  getAllRouteAuditRecords,
  postTamperRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  validateRouteGovernance,
} from "../routes";
import { AUDIT_LOG_OPENAPI_EXTENSION } from "../services/auditLogMetadata";
import { addAuditLogMetadataToOpenapiDocument } from "../services/openapiDocumentService";
import { getSecurityPipelineSteps } from "../security/securityPipeline";
import { shouldBypassSecurityComponent } from "../security/securityPolicy";

describe("security pipeline", () => {
  it("keeps the global security middleware order stable", () => {
    const preBodySteps = getSecurityPipelineSteps("preBodyParser").map((step) => step.name);
    const steps = getSecurityPipelineSteps("postBodyParser").map((step) => step.name);
    expect(preBodySteps).toEqual(["ip-ban-check", "audit-log"]);
    expect(steps).toEqual(["waf"]);
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
    expect(shouldBypassSecurityComponent("ipVerification", "/api/tts/assets/audio.mp3")).toBe(true);
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

  it("marks API route modules as audit-log adapted", () => {
    const apiRouteRecords = getAllRouteAuditRecords().filter((record) => record.kind === "route" && record.path.startsWith("/api"));

    expect(apiRouteRecords.length).toBeGreaterThan(0);
    expect(apiRouteRecords.every((record) => record.auditLogPolicy.enabled)).toBe(true);
    expect(apiRouteRecords.every((record) => record.auditLogPolicy.adaptationStatus === "completed")).toBe(true);
  });
});

describe("OpenAPI audit metadata", () => {
  it("adds dynamic audit-log metadata to API operations", () => {
    const document = addAuditLogMetadataToOpenapiDocument({
      openapi: "3.0.0",
      paths: {
        "/api/tts/generate": {
          post: {
            summary: "Generate TTS",
          },
        },
      },
    });

    expect(document[AUDIT_LOG_OPENAPI_EXTENSION]).toMatchObject({
      coverage: "all-api-routes",
      adaptationStatus: "completed",
      dynamic: true,
    });
    expect(document.paths["/api/tts/generate"].post[AUDIT_LOG_OPENAPI_EXTENSION]).toMatchObject({
      coverage: "all-api-routes",
      adaptationStatus: "completed",
      module: "tts",
      action: "POST /api/tts/generate",
    });
  });
});
