const request = require("supertest");
const express = require("express");

jest.mock("../config/startupDiagnostics", () => ({
  getStartupDiagnosticsReport: jest.fn(() => ({
    summary: { requiredFailures: 0, optionalFailures: 1, total: 3 },
    dependencies: [
      { name: "mongo", required: true, status: "ok" },
      { name: "redis", required: false, status: "missing" },
    ],
  })),
}));

jest.mock("../services/mongoService", () => ({
  isConnected: jest.fn(() => true),
}));

jest.mock("../services/wsService", () => ({
  wsService: {
    getConnectionCount: jest.fn(() => 7),
  },
}));

jest.mock("../middleware/authenticateToken", () => ({
  authenticateToken: (req, _res, next) => {
    req.user = req.headers["x-test-role"]
      ? { role: req.headers["x-test-role"] }
      : undefined;
    next();
  },
}));

const healthRoutesModule = require("../routes/healthRoutes");
const healthRoutes = healthRoutesModule.default || healthRoutesModule;

describe("healthRoutes disclosure boundary", () => {
  const app = express();
  app.use("/health", healthRoutes);

  it("returns a minimal public health payload", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      mongo: "connected",
      timestamp: expect.any(String),
    });
    expect(res.body.uptime).toBeUndefined();
    expect(res.body.wsConnections).toBeUndefined();
    expect(res.body.startupReadiness).toBeUndefined();
    expect(res.body.dependencies).toBeUndefined();
  });

  it("rejects detailed diagnostics for non-admin callers", async () => {
    const res = await request(app).get("/health/details");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("需要管理员权限");
  });

  it("returns detailed diagnostics for admin callers", async () => {
    const res = await request(app).get("/health/details").set("x-test-role", "admin");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.wsConnections).toBe(7);
    expect(res.body.startupReadiness).toEqual({
      requiredFailures: 0,
      optionalFailures: 1,
      total: 3,
    });
    expect(Array.isArray(res.body.dependencies)).toBe(true);
  });
});
