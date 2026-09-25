import express from "express";
import request from "supertest";
import { legacyApiRedirectMiddleware, resolveLegacyApiPath } from "../routes/legacyApiRedirect";
import {
  ADMIN_SPA_MODULE_PATHS,
  FRONTEND_SPA_ROUTE_PATHS,
  FRONTEND_SPA_ROUTE_PREFIX_PATHS,
} from "../generated/adminSpaModulePaths";

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
    expect(resolveLegacyApiPath("/auth/linuxdo/callback/")).toBeNull();
    expect(resolveLegacyApiPath("/auth/provider/bind")).toBeNull();
    expect(resolveLegacyApiPath("/auth/provider/bind/")).toBeNull();
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

  it("serves the SPA for browser navigation to a modern admin module page", async () => {
    await request(createApp())
      .get("/admin/qq-guard")
      .set("Accept", "text/html,application/xhtml+xml")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(204);

    await request(createApp())
      .get("/admin/env?tab=secrets")
      .set("Accept", "text/html")
      .expect(204);

    await request(createApp())
      .get("/admin/system")
      .set("Accept", "text/html")
      .set("Sec-Fetch-Mode", "navigate")
      .expect(204);

    // /admin/ip-risk-logs 曾在手工维护的清单里漏登记，深链被 308 到 API。
    await request(createApp())
      .get("/admin/ip-risk-logs")
      .set("Accept", "text/html")
      .set("Sec-Fetch-Mode", "navigate")
      .expect(204);
  });

  it("keeps admin modules that collide with legacy API paths on the choice page", async () => {
    // /admin/users 与 /admin/lottery 既是 loader 里的面板页面，也是旧 API 路径，
    // 没做选择时必须先问用户，不能被模块页清单直接放行。
    const usersLocation = await getChoiceLocation("/admin/users");
    expect(usersLocation.pathname).toBe("/legacy-api-choice");
    expect(usersLocation.searchParams.get("api")).toBe("/api/admin/users");

    const lotteryLocation = await getChoiceLocation("/admin/lottery");
    expect(lotteryLocation.pathname).toBe("/legacy-api-choice");
    expect(lotteryLocation.searchParams.get("api")).toBe("/api/admin/lottery");
  });

  it("still redirects non-document requests to modern admin module paths to the API", async () => {
    await request(createApp())
      .get("/admin/qq-guard")
      .set("Accept", "application/json")
      .expect(308)
      .expect("Location", "/api/admin/qq-guard");
  });

  it("serves the SPA for browser navigation to the /tts workbench page", async () => {
    await request(createApp())
      .get("/tts")
      .set("Accept", "text/html,application/xhtml+xml")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(204);

    // 尾斜杠变体经 normalizePathname 归一后同样放行
    await request(createApp())
      .get("/tts/")
      .set("Accept", "text/html")
      .expect(204);
  });

  it("still redirects legacy /tts API calls that are not document navigations", async () => {
    await request(createApp())
      .get("/tts")
      .set("Accept", "application/json")
      .expect(308)
      .expect("Location", "/api/tts");

    // 放行只针对精确路径 /tts，子路径上的旧 API 调用继续被重定向
    await request(createApp())
      .post("/tts/generate")
      .set("Accept", "text/html")
      .expect(308)
      .expect("Location", "/api/tts/generate");
  });

  it("keeps the generated path lists on their documented semantics", () => {
    const adminModulePaths: readonly string[] = ADMIN_SPA_MODULE_PATHS;
    const frontendRoutePaths: readonly string[] = FRONTEND_SPA_ROUTE_PATHS;
    const frontendRoutePrefixPaths: readonly string[] = FRONTEND_SPA_ROUTE_PREFIX_PATHS;

    // ADMIN_SPA_MODULE_PATHS 的名字与语义保持不变：/admin/<module>，既有引用按此前缀匹配。
    expect(adminModulePaths).toContain("/admin/ip-risk-logs");
    expect(adminModulePaths.every((path) => path.startsWith("/admin/"))).toBe(true);

    // 全部前端路由清单来自 App.tsx：必须有非 admin 页面，且不能混进参数/通配/根路由。
    expect(frontendRoutePaths).toContain("/lottery");
    expect(frontendRoutePaths).toContain("/transcribe");
    expect(frontendRoutePaths).toContain("/store");
    expect(frontendRoutePaths.some((path) => path.includes(":") || path.includes("*"))).toBe(false);
    expect(frontendRoutePaths).not.toContain("/");

    // 参数路由只登记静态前缀；/admin（/admin/:module 的前缀）必须不在其中，否则
    // /admin/audit-events 这类未知模块深链会被新清单抢先放行。
    expect(frontendRoutePrefixPaths).toContain("/artifacts");
    expect(frontendRoutePrefixPaths).toContain("/store/resources");
    expect(frontendRoutePrefixPaths).not.toContain("/admin");
  });

  it("serves the SPA for browser navigation to a non-admin frontend route that collides with a legacy API prefix", async () => {
    // /lottery 在 App.tsx 里是真实页面，同时命中旧前缀 /lottery → /api/lottery。
    // 它不在碰撞集里，整页导航必须直接放行给 SPA（此前会被 308 到 API）。
    expect(resolveLegacyApiPath("/lottery")).toBe("/api/lottery");

    await request(createApp())
      .get("/lottery")
      .set("Accept", "text/html,application/xhtml+xml")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(204);

    await request(createApp())
      .get("/lottery?tab=winners")
      .set("Accept", "text/html")
      .expect(204);
  });

  it("still redirects non-document requests to a non-admin frontend route to the API", async () => {
    await request(createApp())
      .get("/lottery")
      .set("Accept", "application/json")
      .expect(308)
      .expect("Location", "/api/lottery")
      .expect("X-Canonical-API-Path", "/api/lottery");
  });

  it("keeps colliding frontend routes on the choice page ahead of the generated frontend route list", async () => {
    // /policy 与 /admin/users 既在 App.tsx 的静态路由清单里，也是旧 API 路径：
    // 生成清单不能抢在碰撞集之前把它们静默放行。
    const policyLocation = await getChoiceLocation("/policy");
    expect(policyLocation.pathname).toBe("/legacy-api-choice");
    expect(policyLocation.searchParams.get("api")).toBe("/api/policy");

    const adminUsersLocation = await getChoiceLocation("/admin/users");
    expect(adminUsersLocation.pathname).toBe("/legacy-api-choice");
    expect(adminUsersLocation.searchParams.get("api")).toBe("/api/admin/users");
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

    await request(createApp())
      .get("/auth/linuxdo/callback/?ticket=relay-ticket&intent=login")
      .set("Accept", "text/html,application/xhtml+xml")
      .set("Sec-Fetch-Mode", "navigate")
      .set("Sec-Fetch-Dest", "document")
      .expect(204);
  });
});
