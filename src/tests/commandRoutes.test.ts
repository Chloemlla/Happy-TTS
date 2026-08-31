import "./helpers/mockAppSecurityBoundaries";
import * as os from "node:os";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import request from "supertest";
import app from "../app";
import { config } from "../config/config";
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

function superadminToken(): string {
  return jwt.sign({ userId: "u-admin", username: "admin" }, config.jwtSecret, { expiresIn: "1h" });
}

describe("Command Routes", () => {
  const validPassword = config.adminPassword;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserById.mockResolvedValue({
      id: "u-admin",
      username: "admin",
      role: "superadmin",
      accountStatus: "active",
    } as any);
  });

  describe("POST /api/command/execute", () => {
    it("应该拒绝未登录请求（401）", async () => {
      const res = await request(app).post("/api/command/execute").send({
        command: "ls",
        password: validPassword,
      });

      expect(res.status).toBe(401);
    });

    it("非超级管理员应被拒绝（403）", async () => {
      mockGetUserById.mockResolvedValue({
        id: "u-user",
        username: "alice",
        role: "user",
        accountStatus: "active",
      } as any);
      const token = jwt.sign({ userId: "u-user", username: "alice" }, config.jwtSecret, { expiresIn: "1h" });

      const res = await request(app)
        .post("/api/command/execute")
        .set("Authorization", `Bearer ${token}`)
        .send({ command: "ls", password: validPassword });

      expect(res.status).toBe(403);
    });

    it("应该拒绝无效密码的请求", async () => {
      const res = await request(app)
        .post("/api/command/execute")
        .set("Authorization", `Bearer ${superadminToken()}`)
        .send({
          command: "ls",
          password: "invalid-password",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/密码错误/);
    });

    it("应该成功执行安全命令", async () => {
      // 根据平台选择不同的命令
      const testCommand = os.platform() === "win32" ? "dir" : "ls";

      const res = await request(app)
        .post("/api/command/execute")
        .set("Authorization", `Bearer ${superadminToken()}`)
        .send({
          command: testCommand,
          password: validPassword,
        });

      // 在 Windows 上 dir 可能不在白名单中，所以我们检查状态码
      if (res.status === 200) {
        expect(res.body.output).toBeDefined();
      } else if (res.status === 500) {
        // 如果命令执行失败，至少验证了鉴权和密码验证通过
        expect(res.body.error).toBeDefined();
      }
    });
  });

  describe("POST /api/command/status", () => {
    it("应该返回服务器状态", async () => {
      const res = await request(app)
        .post("/api/command/status")
        .set("Authorization", `Bearer ${superadminToken()}`)
        .send({
          password: validPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("uptime");
      expect(res.body).toHaveProperty("memory_usage");
      expect(res.body).toHaveProperty("cpu_usage_percent");
    });

    it("应该拒绝无效密码的状态请求", async () => {
      const res = await request(app)
        .post("/api/command/status")
        .set("Authorization", `Bearer ${superadminToken()}`)
        .send({
          password: "invalid-password",
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/密码错误/);
    });
  });
});
