import {
  broadScopeRouteExemptions,
  getModuleScopes,
  isBroadRouteScope,
  normalizeScopedPath,
  pathScopesOverlap,
  scopeCoversPath,
} from "../routes";

describe("route scope governance helpers", () => {
  it("normalizes wildcard suffixes and trailing slashes", () => {
    expect(normalizeScopedPath("/api/shorturl/*path")).toBe("/api/shorturl");
    expect(normalizeScopedPath("/api/logs/")).toBe("/api/logs");
    expect(normalizeScopedPath("/")).toBe("/");
  });

  it("keeps overlap symmetric while coverage stays directional", () => {
    expect(pathScopesOverlap("/api/tts", "/api/tts/generate")).toBe(true);
    expect(pathScopesOverlap("/api/tts/generate", "/api/tts")).toBe(true);
    expect(scopeCoversPath("/api/tts", "/api/tts/generate")).toBe(true);
    expect(scopeCoversPath("/api/tts/generate", "/api/tts")).toBe(false);
  });

  it("does not treat a shared name prefix as a scope relation", () => {
    expect(pathScopesOverlap("/api/logs", "/api/logsearch")).toBe(false);
    expect(scopeCoversPath("/api/logs", "/api/logsearch")).toBe(false);
  });

  it("flags only the root and /api as over-broad governance scopes", () => {
    expect(isBroadRouteScope("/")).toBe(true);
    expect(isBroadRouteScope("/api")).toBe(true);
    expect(isBroadRouteScope("/api/")).toBe(true);
    expect(isBroadRouteScope("/api/logs")).toBe(false);
  });

  it("prefers declared scopes, then the broad-mount exemption, then the mount path", () => {
    expect(getModuleScopes({ name: "lumen-routes", path: "/", scopes: ["/api/lumen"] })).toEqual(["/api/lumen"]);
    expect(getModuleScopes({ name: "log-routes", path: "/api" })).toEqual(broadScopeRouteExemptions["log-routes"].owns);
    expect(getModuleScopes({ name: "tts-routes", path: "/api/tts" })).toEqual(["/api/tts"]);
  });

  it("keeps every broad-mount exemption narrow enough to be governed", () => {
    for (const exemption of Object.values(broadScopeRouteExemptions)) {
      expect(exemption.owns.length).toBeGreaterThan(0);
      expect(exemption.reason.trim().length).toBeGreaterThan(0);
      for (const owned of exemption.owns) {
        expect(isBroadRouteScope(owned)).toBe(false);
      }
    }
  });
});
