import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../config/config";
import { AuthController } from "../controllers/authController";
import { authMiddleware } from "../middleware/authMiddleware";
import { authenticateToken } from "../middleware/authenticateToken";
import { AUTH_COOKIE_NAME, setAuthSessionCookie } from "../utils/authCookie";
import { UserStorage } from "../utils/userStorage";

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserById: jest.fn(),
    getRemainingUsage: jest.fn(),
  },
}));

const mockGetUserById = UserStorage.getUserById as jest.MockedFunction<typeof UserStorage.getUserById>;
const mockGetRemainingUsage = UserStorage.getRemainingUsage as jest.MockedFunction<typeof UserStorage.getRemainingUsage>;

describe("HttpOnly cookie session auth", () => {
  const app = express();
  app.get("/api/auth/me", authenticateToken, AuthController.getCurrentUser);
  app.post("/api/auth/session", authenticateToken, AuthController.establishSession);
  app.post("/api/admin/verify-access", authMiddleware, (req, res) => {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ success: false });
    }
    return res.json({ success: true, userId: req.user.id });
  });
  app.post("/login-set-cookie", (req, res) => {
    const token = jwt.sign({ userId: "cookie-user" }, config.jwtSecret, { expiresIn: "1h" });
    setAuthSessionCookie(req, res, token);
    res.json({ token, authMode: "cookie+bearer" });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue({
      id: "cookie-user",
      username: "cookie",
      email: "c@example.com",
      role: "user",
      accountStatus: "active",
      password: "must-not-leak",
    } as any);
    mockGetRemainingUsage.mockResolvedValue(88);
  });

  it("returns the current user with only the HttpOnly session cookie", async () => {
    const agent = request.agent(app);
    const loginRes = await agent.post("/login-set-cookie");
    const setCookie = loginRes.headers["set-cookie"];
    const joined = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);

    expect(loginRes.status).toBe(200);
    expect(joined.toLowerCase()).toContain("httponly");

    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        id: "cookie-user",
        username: "cookie",
        remainingUsage: 88,
      }),
    );
    expect(res.body).not.toHaveProperty("password");
    expect(mockGetUserById).toHaveBeenCalledTimes(1);
    expect(mockGetRemainingUsage).toHaveBeenCalledWith("cookie-user");
  });

  it("still returns the current user for bearer clients", async () => {
    const token = jwt.sign({ userId: "cookie-user" }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("cookie-user");
  });

  it("accepts an HttpOnly cookie for admin middleware", async () => {
    mockGetUserById.mockResolvedValue({
      id: "admin-user",
      username: "admin",
      email: "admin@example.com",
      role: "admin",
      accountStatus: "active",
    } as any);

    const token = jwt.sign({ userId: "admin-user" }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app)
      .post("/api/admin/verify-access")
      .set("Cookie", [`${AUTH_COOKIE_NAME}=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, userId: "admin-user" });
  });

  it("exchanges an explicit bearer identity into the canonical HttpOnly cookie session", async () => {
    const token = jwt.sign({ userId: "cookie-user" }, config.jwtSecret, { expiresIn: "1h" });
    const agent = request.agent(app);

    const exchange = await agent
      .post("/api/auth/session")
      .set("Authorization", `Bearer ${token}`);
    const setCookie = exchange.headers["set-cookie"];
    const joined = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);

    expect(exchange.status).toBe(204);
    expect(joined).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(joined.toLowerCase()).toContain("httponly");

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.id).toBe("cookie-user");
  });

  it("rejects a request without a session credential", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "未授权" });
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it("rejects an invalid session cookie", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [`${AUTH_COOKIE_NAME}=not-a-jwt`]);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Token 无效或已过期" });
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it("sets HttpOnly cookie from helper", async () => {
    const res = await request(app).post("/login-set-cookie");
    expect(res.status).toBe(200);
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const joined = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(joined).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(joined.toLowerCase()).toContain("httponly");
  });
});
