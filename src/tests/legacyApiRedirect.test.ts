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

  it("keeps browser document navigation on frontend routes instead of redirecting prefixes", async () => {
    await request(createApp())
      .get("/admin?tab=oauth")
      .set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(204);

    await request(createApp())
      .get("/admin/users")
      .set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(204);

    await request(createApp()).get("/policy").set("Accept", "text/html").expect(204);
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
