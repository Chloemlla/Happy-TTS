import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../config/config";
import { authenticateToken } from "../middleware/authenticateToken";
import { UserStorage } from "../utils/userStorage";

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserById: jest.fn(),
  },
}));

const mockGetUserById = UserStorage.getUserById as jest.MockedFunction<typeof UserStorage.getUserById>;

describe("authenticateToken middleware authenticity", () => {
  const app = express();
  app.get("/protected", authenticateToken, (req, res) => {
    const user = (req as express.Request & { user?: { id?: string; username?: string } }).user;
    res.json({ ok: true, userId: user?.id, username: user?.username });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects missing bearer token with real middleware", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("未授权");
  });

  it("rejects invalid jwt with real middleware", async () => {
    const res = await request(app).get("/protected").set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Token 无效或已过期");
  });

  it("accepts valid jwt and attaches user from storage", async () => {
    mockGetUserById.mockResolvedValue({
      id: "u1",
      username: "alice",
      email: "a@example.com",
      role: "user",
      accountStatus: "active",
    } as any);

    const token = jwt.sign({ userId: "u1", username: "alice" }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, userId: "u1", username: "alice" });
    expect(mockGetUserById).toHaveBeenCalledWith("u1");
  });

  it("rejects suspended accounts", async () => {
    mockGetUserById.mockResolvedValue({
      id: "u2",
      username: "bob",
      email: "b@example.com",
      role: "user",
      accountStatus: "suspended",
    } as any);
    const token = jwt.sign({ userId: "u2" }, config.jwtSecret, { expiresIn: "1h" });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("账户已被封停");
  });
});
