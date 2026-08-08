import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../config/config";
import { authenticateAdmin, authenticateSuperAdmin, isAdminRole, isSuperAdmin } from "../middleware/auth";
import { UserStorage } from "../utils/userStorage";

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserById: jest.fn(),
  },
}));

jest.mock("../services/authSessionService", () => ({
  assertActiveAuthSession: jest.fn().mockResolvedValue({ userAgent: "test-agent" }),
  touchAuthSession: jest.fn().mockResolvedValue(undefined),
}));

const mockGetUserById = UserStorage.getUserById as jest.MockedFunction<typeof UserStorage.getUserById>;

const signToken = (userId: string) => jwt.sign({ userId }, config.jwtSecret, { expiresIn: "1h" });

const makeUser = (role: string, id = "u1", username = "alice") => ({
  id,
  username,
  email: `${username}@example.com`,
  role,
  accountStatus: "active",
  disabled: false,
});

describe("isAdminRole / isSuperAdmin helpers", () => {
  it("isAdminRole accepts admin and superadmin only", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("superadmin")).toBe(true);
    expect(isAdminRole("user")).toBe(false);
    expect(isAdminRole("trusted")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it("isSuperAdmin accepts only the superadmin role from req.user", () => {
    expect(isSuperAdmin({ user: { role: "superadmin" } } as any)).toBe(true);
    expect(isSuperAdmin({ user: { role: "admin" } } as any)).toBe(false);
    expect(isSuperAdmin({ user: { role: "user" } } as any)).toBe(false);
    expect(isSuperAdmin({ user: {} } as any)).toBe(false);
    expect(isSuperAdmin({} as any)).toBe(false);
  });
});

describe("authenticateAdmin middleware", () => {
  const app = express();
  app.get("/admin", authenticateAdmin, (_req, res) => res.json({ ok: true }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects requests without a token", async () => {
    const res = await request(app).get("/admin");
    expect(res.status).toBe(401);
  });

  it("accepts the admin role", async () => {
    mockGetUserById.mockResolvedValue(makeUser("admin") as any);
    const res = await request(app).get("/admin").set("Authorization", `Bearer ${signToken("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("accepts the superadmin role (superset)", async () => {
    mockGetUserById.mockResolvedValue(makeUser("superadmin") as any);
    const res = await request(app).get("/admin").set("Authorization", `Bearer ${signToken("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("rejects the user role with 403", async () => {
    mockGetUserById.mockResolvedValue(makeUser("user") as any);
    const res = await request(app).get("/admin").set("Authorization", `Bearer ${signToken("u1")}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("权限不足，仅限管理员访问");
  });
});

describe("authenticateSuperAdmin middleware", () => {
  const app = express();
  app.get("/superadmin", authenticateSuperAdmin, (_req, res) => res.json({ ok: true }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects requests without a token", async () => {
    const res = await request(app).get("/superadmin");
    expect(res.status).toBe(401);
  });

  it("accepts the superadmin role", async () => {
    mockGetUserById.mockResolvedValue(makeUser("superadmin") as any);
    const res = await request(app).get("/superadmin").set("Authorization", `Bearer ${signToken("u1")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("rejects the admin role with 403", async () => {
    mockGetUserById.mockResolvedValue(makeUser("admin") as any);
    const res = await request(app).get("/superadmin").set("Authorization", `Bearer ${signToken("u1")}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("权限不足，仅限超级管理员访问");
  });

  it("rejects the user role with 403", async () => {
    mockGetUserById.mockResolvedValue(makeUser("user") as any);
    const res = await request(app).get("/superadmin").set("Authorization", `Bearer ${signToken("u1")}`);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("权限不足，仅限超级管理员访问");
  });
});
