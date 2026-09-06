import "./helpers/mockAppSecurityBoundaries";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../config/config";
import app from "../app";
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

const activeUser = {
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  role: "user",
  accountStatus: "active",
} as any;

const suspendedUser = {
  ...activeUser,
  id: "u2",
  username: "bob",
  accountStatus: "suspended",
} as any;

const validMessage = "Hello, how are you?";

function authHeader(userId: string): string {
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: "1h" });
  return `Bearer ${token}`;
}

describe("LibreChat Routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/libre-chat/send", () => {
    it("应该拒绝未登录请求", async () => {
      const res = await request(app).post("/api/libre-chat/send").send({ message: validMessage });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("未授权");
    });

    it("应该拒绝无效 Bearer token", async () => {
      const res = await request(app)
        .post("/api/libre-chat/send")
        .set("Authorization", "Bearer not-a-jwt")
        .send({ message: validMessage });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Token 无效或已过期");
    });

    it("应该忽略仅携带 body token 的游客凭据(旧通道已移除)", async () => {
      const res = await request(app)
        .post("/api/libre-chat/send")
        .send({ token: "any-legacy-token", message: validMessage });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("未授权");
    });

    it("应该封停被封停账号的请求", async () => {
      mockGetUserById.mockResolvedValue(suspendedUser);
      const res = await request(app)
        .post("/api/libre-chat/send")
        .set("Authorization", authHeader("u2"))
        .send({ message: validMessage });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("账户已被封停");
    });

    it("应该拒绝数据库不存在的账号", async () => {
      mockGetUserById.mockResolvedValue(null);
      const res = await request(app)
        .post("/api/libre-chat/send")
        .set("Authorization", authHeader("ghost"))
        .send({ message: validMessage });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("无效的Token");
    });

    it("应该拒绝空消息", async () => {
      mockGetUserById.mockResolvedValue(activeUser);
      const res = await request(app)
        .post("/api/libre-chat/send")
        .set("Authorization", authHeader("u1"))
        .send({ message: "" });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/消息不能为空/);
    });

    it("应该成功发送消息", async () => {
      mockGetUserById.mockResolvedValue(activeUser);
      const res = await request(app)
        .post("/api/libre-chat/send")
        .set("Authorization", authHeader("u1"))
        .send({ message: validMessage });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response).toBeDefined();
    });

    it("应该处理超长消息", async () => {
      mockGetUserById.mockResolvedValue(activeUser);
      const longMessage = "a".repeat(5000);
      const res = await request(app)
        .post("/api/libre-chat/send")
        .set("Authorization", authHeader("u1"))
        .send({ message: longMessage });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/消息过长/);
    });
  });

  describe("GET /api/libre-chat/history", () => {
    it("应该拒绝未登录的历史请求", async () => {
      const res = await request(app).get("/api/libre-chat/history");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("未授权");
    });

    it("应该拒绝仅携带旧版 x-chat-token 游客凭据的请求(游客通道已移除)", async () => {
      const res = await request(app)
        .get("/api/libre-chat/history")
        .set("x-chat-token", `guest_${"a".repeat(64)}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("未授权");
    });

    it("应该返回登录用户的聊天历史", async () => {
      mockGetUserById.mockResolvedValue(activeUser);
      const res = await request(app)
        .get("/api/libre-chat/history")
        .set("Authorization", authHeader("u1"));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.history)).toBe(true);
    });

    it("应该正确处理分页", async () => {
      mockGetUserById.mockResolvedValue(activeUser);
      const res = await request(app)
        .get("/api/libre-chat/history")
        .set("Authorization", authHeader("u1"))
        .query({
          page: 1,
          limit: 10,
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.history)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(res.body.currentPage).toBe(1);
    });
  });

  describe("DELETE /api/libre-chat/clear", () => {
    it("应该成功清除登录用户的聊天历史", async () => {
      mockGetUserById.mockResolvedValue(activeUser);
      const res = await request(app)
        .delete("/api/libre-chat/clear")
        .set("Authorization", authHeader("u1"));

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/清除成功/);
    });

    it("应该拒绝未登录的清除请求", async () => {
      const res = await request(app).delete("/api/libre-chat/clear");

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("未授权");
    });
  });

  describe("POST /api/libre-chat/guest (removed)", () => {
    it("即使携带有效登录也应返回 404(游客端点已删除)", async () => {
      mockGetUserById.mockResolvedValue(activeUser);
      const res = await request(app)
        .post("/api/libre-chat/guest")
        .set("Authorization", authHeader("u1"));

      expect(res.status).toBe(404);
    });
  });
});
