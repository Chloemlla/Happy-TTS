import express from "express";
import request from "supertest";
import { legacyApiRedirectMiddleware, resolveLegacyApiPath } from "../routes/legacyApiRedirect";

function createApp() {
  const app = express();
  app.use(legacyApiRedirectMiddleware);
  app.use((_req, res) => res.status(204).end());
  return app;
}

describe("legacyApiRedirectMiddleware", () => {
  it("resolves legacy API paths without rewriting canonical API paths", () => {
    expect(resolveLegacyApiPath("/api/admin/users")).toBeNull();
    expect(resolveLegacyApiPath("/admin/users")).toBe("/api/admin/users");
    expect(resolveLegacyApiPath("/nexai/auth/login")).toBeNull();
    expect(resolveLegacyApiPath("/s/admin/export")).toBe("/api/shorturl/admin/export");
  });

  it("does not redirect removed NexAI legacy API paths", async () => {
    await request(createApp()).post("/nexai/auth/login").set("Accept", "application/json").expect(204);
  });

  it("redirects API-like legacy prefix requests and preserves the query string", async () => {
    await request(createApp())
      .get("/admin/users?page=1")
      .set("Accept", "application/json")
      .expect(308)
      .expect("Location", "/api/admin/users?page=1")
      .expect("X-Canonical-API-Path", "/api/admin/users");
  });

  it("shows a choice page for browser document navigation on frontend/API route collisions", async () => {
    const response = await request(createApp())
      .get("/admin?tab=oauth")
      .set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(300)
      .expect("X-Canonical-API-Path", "/api/admin");

    expect(response.text).toContain("This address has two destinations");
    expect(response.text).toContain("/api/admin?tab=oauth");
    expect(response.text).toContain("/admin?tab=oauth");
  });

  it("passes remembered frontend choices through to the frontend route", async () => {
    await request(createApp())
      .get("/admin/users")
      .set("Accept", "text/html")
      .set("Cookie", "legacyApiNavigationChoice=frontend")
      .expect(204);
  });

  it("redirects remembered API choices to the canonical API route", async () => {
    await request(createApp())
      .get("/admin/users")
      .set("Accept", "text/html")
      .set("Cookie", "legacyApiNavigationChoice=api")
      .expect(308)
      .expect("Location", "/api/admin/users")
      .expect("X-Canonical-API-Path", "/api/admin/users");
  });

  it("stores explicit choices when requested", async () => {
    const apiResponse = await request(createApp())
      .get("/policy?view=terms&__legacy_api_choice=api&__legacy_api_remember=1")
      .set("Accept", "text/html")
      .expect(308)
      .expect("Location", "/api/policy?view=terms");

    expect(apiResponse.headers["set-cookie"]?.[0]).toContain("legacyApiNavigationChoice=api");

    const frontendResponse = await request(createApp())
      .get("/policy?view=terms&__legacy_api_choice=frontend&__legacy_api_remember=1")
      .set("Accept", "text/html")
      .expect(302)
      .expect("Location", "/policy?view=terms");

    expect(frontendResponse.headers["set-cookie"]?.[0]).toContain("legacyApiNavigationChoice=frontend");
  });

  it("uses a transient bypass for one-time frontend choices", async () => {
    const frontendResponse = await request(createApp())
      .get("/policy?view=terms&__legacy_api_choice=frontend")
      .set("Accept", "text/html")
      .set("Cookie", "legacyApiNavigationChoice=api")
      .expect(302)
      .expect("Location", "/policy?view=terms");

    expect(frontendResponse.headers["set-cookie"]?.[0]).toContain("legacyApiFrontendBypass=1");
    expect(frontendResponse.headers["set-cookie"]?.[0]).not.toContain("legacyApiNavigationChoice=frontend");

    await request(createApp())
      .get("/policy?view=terms")
      .set("Accept", "text/html")
      .set("Cookie", "legacyApiNavigationChoice=api; legacyApiFrontendBypass=1")
      .expect(204);
  });

  it("redirects browser navigation to legacy API paths when no matching frontend page exists", async () => {
    await request(createApp())
      .get("/admin/audit-events")
      .set("Accept", "text/html")
      .expect(308)
      .expect("Location", "/api/admin/audit-events");
  });

  it("still redirects exact legacy endpoints for browser requests", async () => {
    await request(createApp())
      .get("/api-docs.json")
      .set("Accept", "text/html")
      .set("Sec-Fetch-Mode", "navigate")
      .expect(308)
      .expect("Location", "/api/openapi.json");
  });

  it("redirects non-navigation legacy requests even when they accept html", async () => {
    await request(createApp())
      .post("/auth/login")
      .set("Accept", "text/html")
      .expect(308)
      .expect("Location", "/api/auth/login");
  });
});
