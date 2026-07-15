import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../config/config";
import { authenticateToken } from "../middleware/authenticateToken";
import { AUTH_COOKIE_NAME, setAuthSessionCookie } from "../utils/authCookie";
import { UserStorage } from "../utils/userStorage";

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserById: jest.fn(),
  },
}));

const mockGetUserById = UserStorage.getUserById as jest.MockedFunction<typeof UserStorage.getUserById>;

describe("HttpOnly cookie session auth", () => {
  const app = express();
  app.get("/protected", authenticateToken, (req, res) => {
    const user = (req as express.Request & { user?: { id?: string } }).user;
    res.json({ ok: true, userId: user?.id });
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
    } as any);
  });

  it("authenticates with session cookie without Authorization header", async () => {
    const token = jwt.sign({ userId: "cookie-user" }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app)
      .get("/protected")
      .set("Cookie", [`${AUTH_COOKIE_NAME}=${token}`]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, userId: "cookie-user" });
  });

  it("still authenticates with bearer token", async () => {
    const token = jwt.sign({ userId: "cookie-user" }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe("cookie-user");
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
