import { AuthController } from "../controllers/authController";
import { UserStorage } from "../utils/userStorage";

// 模拟依赖
jest.mock("../utils/userStorage");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const mockUserStorage = UserStorage as jest.Mocked<typeof UserStorage>;

describe("AuthController", () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
  });

  describe("getCurrentUser", () => {
    it("应该在中间件未建立用户身份时返回401", async () => {
      const req = {
        ip: "192.168.1.1",
        headers: {},
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "未登录",
      });
    });

    it("应该拒绝中间件标记为已封停的用户", async () => {
      const req = {
        user: {
          id: "user123",
          accountStatus: "suspended",
        },
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "账户已被封停",
          code: "ACCOUNT_SUSPENDED",
        }),
      );
      expect(mockUserStorage.getRemainingUsage).not.toHaveBeenCalled();
    });

    it("应该使用中间件建立的用户身份返回公开用户信息", async () => {
      const mockUser = {
        id: "user123",
        username: "testuser",
        email: "test@example.com",
        role: "user" as const,
        dailyUsage: 100,
        lastUsageDate: "2024-01-01",
        createdAt: "2024-01-01",
        password: "hashedPassword",
      };

      mockUserStorage.getRemainingUsage.mockResolvedValue(50);

      const req = {
        user: mockUser,
      } as any;

      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as any;

      await AuthController.getCurrentUser(req, res);

      expect(mockUserStorage.getUserById).not.toHaveBeenCalled();
      expect(mockUserStorage.getRemainingUsage).toHaveBeenCalledWith("user123");
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "user123",
          username: "testuser",
          role: "user",
          remainingUsage: 50,
        }),
      );
      // 确保密码没有被返回
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          password: expect.anything(),
        }),
      );
    });
  });
});
