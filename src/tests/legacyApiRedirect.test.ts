import express from "express";
import request from "supertest";
import { legacyApiRedirectMiddleware, resolveLegacyApiPath } from "../routes/legacyApiRedirect";

function createApp() {
  const app = express();
  app.use(legacyApiRedirectMiddleware);
  app.use((_req, res) => res.status(204).end());
  return app;
}

async function getChoiceLocation(path: string): Promise<URL> {
  const response = await request(createApp()).get(path).set("Accept", "text/html").expect(302);
  return new URL(response.headers.location, "http://local.invalid");
}

describe("legacyApiRedirectMiddleware", () => {
  it("resolves legacy API paths without rewriting canonical API paths", () => {
    expect(resolveLegacyApiPath("/api/admin/users")).toBeNull();
    expect(resolveLegacyApiPath("/admin/users")).toBe("/api/admin/users");
    expect(resolveLegacyApiPath("/nexai/auth/login")).toBeNull();
    expect(resolveLegacyApiPath("/s/admin/export")).toBe("/api/shorturl/admin/export");
    // SPA OAuth completion pages must stay on the frontend path.
    expect(resolveLegacyApiPath("/auth/linuxdo/callback")).toBeNull();
    expect(resolveLegacyApiPath("/auth/provider/bind")).toBeNull();
    expect(resolveLegacyApiPath("/auth/login")).toBe("/api/auth/login");
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

  it("redirects browser document navigation on frontend/API route collisions to the frontend choice page", async () => {
    const response = await request(createApp())
      .get("/admin?tab=oauth")
      .set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(302)
      .expect("X-Canonical-API-Path", "/api/admin");

    const location = new URL(response.headers.location, "http://local.invalid");
    expect(location.pathname).toBe("/legacy-api-choice");
    expect(location.searchParams.get("from")).toBe("/admin?tab=oauth");
    expect(location.searchParams.get("api")).toBe("/api/admin?tab=oauth");
    expect(location.searchParams.get("state")).toBeTruthy();
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
    const apiChoiceLocation = await getChoiceLocation("/policy?view=terms");
    const apiChoiceState = apiChoiceLocation.searchParams.get("state");
    expect(apiChoiceState).toBeTruthy();
    const apiResponse = await request(createApp())
      .get(`/policy?view=terms&__legacy_api_choice=api&__legacy_api_remember=1&__legacy_api_state=${apiChoiceState}`)
      .set("Accept", "text/html")
      .expect(308)
      .expect("Location", "/api/policy?view=terms");

    expect(apiResponse.headers["set-cookie"]?.[0]).toContain("legacyApiNavigationChoice=api");

    const frontendChoiceLocation = await getChoiceLocation("/policy?view=terms");
    const frontendChoiceState = frontendChoiceLocation.searchParams.get("state");
    expect(frontendChoiceState).toBeTruthy();
    const frontendResponse = await request(createApp())
      .get(`/policy?view=terms&__legacy_api_choice=frontend&__legacy_api_remember=1&__legacy_api_state=${frontendChoiceState}`)
      .set("Accept", "text/html")
      .expect(302)
      .expect("Location", "/policy?view=terms");

    expect(frontendResponse.headers["set-cookie"]?.[0]).toContain("legacyApiNavigationChoice=frontend");
  });

  it("uses a transient bypass for one-time frontend choices", async () => {
    const choiceLocation = await getChoiceLocation("/policy?view=terms");
    const choiceState = choiceLocation.searchParams.get("state");
    expect(choiceState).toBeTruthy();
    const frontendResponse = await request(createApp())
      .get(`/policy?view=terms&__legacy_api_choice=frontend&__legacy_api_state=${choiceState}`)
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

  it("ignores forged explicit choices and sends the browser back through backend conflict detection", async () => {
    const response = await request(createApp())
      .get("/policy?view=terms&__legacy_api_choice=frontend&__legacy_api_state=forged")
      .set("Accept", "text/html")
      .expect(302);

    const location = new URL(response.headers.location, "http://local.invalid");
    expect(location.pathname).toBe("/legacy-api-choice");
    expect(location.searchParams.get("from")).toBe("/policy?view=terms");
    expect(location.searchParams.get("api")).toBe("/api/policy?view=terms");
    expect(location.searchParams.get("state")).toBeTruthy();
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

  it("does not rewrite SPA Linux.do callback pages into the API callback path", async () => {
    await request(createApp())
      .get("/auth/linuxdo/callback?ticket=relay-ticket&intent=login")
      .set("Accept", "text/html,application/xhtml+xml")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(204);
  });
});
