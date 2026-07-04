import type { NextFunction, Request, Response } from "express";

const mockNoopHandler = (_req: Request, _res: Response, next?: NextFunction) => next?.();

jest.mock("../controllers/authController", () => ({
  AuthController: {
    register: jest.fn(mockNoopHandler),
    login: jest.fn(mockNoopHandler),
    getGoogleAuthConfig: jest.fn(mockNoopHandler),
    googleAuth: jest.fn(mockNoopHandler),
    googleBindSession: jest.fn(mockNoopHandler),
    googleBind: jest.fn(mockNoopHandler),
    getProviderBindSession: jest.fn(mockNoopHandler),
    confirmProviderBind: jest.fn(mockNoopHandler),
    getCurrentUser: jest.fn(mockNoopHandler),
    passkeyVerify: jest.fn(mockNoopHandler),
    verifyEmailLink: jest.fn(mockNoopHandler),
    verifyEmail: jest.fn(mockNoopHandler),
    sendVerifyEmail: jest.fn(mockNoopHandler),
    forgotPassword: jest.fn(mockNoopHandler),
    validateResetToken: jest.fn(mockNoopHandler),
    resetPasswordLink: jest.fn(mockNoopHandler),
    resetPassword: jest.fn(mockNoopHandler),
  },
}));

jest.mock("../controllers/linuxDoAuthController", () => ({
  LinuxDoAuthController: {
    getConfig: jest.fn(mockNoopHandler),
    start: jest.fn(mockNoopHandler),
    callbackGet: jest.fn(mockNoopHandler),
    callback: jest.fn(mockNoopHandler),
    exchangeTicket: jest.fn(mockNoopHandler),
  },
}));

jest.mock("../controllers/mobileLoginController", () => ({
  MobileLoginController: {
    createChallenge: jest.fn(mockNoopHandler),
    scanChallenge: jest.fn(mockNoopHandler),
    confirmChallenge: jest.fn(mockNoopHandler),
    pollChallenge: jest.fn(mockNoopHandler),
    issueClientToken: jest.fn(mockNoopHandler),
    exchangeClientToken: jest.fn(mockNoopHandler),
    revokeClientToken: jest.fn(mockNoopHandler),
  },
}));

jest.mock("../middleware/authValidation", () => ({
  validateAuthInput: jest.fn(mockNoopHandler),
}));

jest.mock("../middleware/authenticateToken", () => ({
  authenticateToken: jest.fn(mockNoopHandler),
}));

jest.mock("../middleware/userDataLogger", () => ({
  logUserData: jest.fn(mockNoopHandler),
}));

const { shouldSkipLinuxDoCallbackRateLimit } = require("../routes/authRoutes") as typeof import("../routes/authRoutes");

function makeRequest(method: string, query: Request["query"]): Request {
  return { method, query } as Request;
}

describe("authRoutes", () => {
  describe("shouldSkipLinuxDoCallbackRateLimit", () => {
    it("skips only provider error GET callbacks", () => {
      expect(shouldSkipLinuxDoCallbackRateLimit(makeRequest("GET", { error: "access_denied" }))).toBe(true);
      expect(shouldSkipLinuxDoCallbackRateLimit(makeRequest("GET", { error: ["access_denied"] }))).toBe(true);
      expect(shouldSkipLinuxDoCallbackRateLimit(makeRequest("GET", { code: "code", state: "state" }))).toBe(false);
      expect(shouldSkipLinuxDoCallbackRateLimit(makeRequest("POST", { error: "access_denied" }))).toBe(false);
      expect(shouldSkipLinuxDoCallbackRateLimit(makeRequest("GET", { error: "   " }))).toBe(false);
    });
  });
});
