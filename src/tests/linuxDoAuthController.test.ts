import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";
import { LinuxDoAuthController } from "../controllers/linuxDoAuthController";
import {
  completeLinuxDoAuthorization,
  getLinuxDoConfigSummary,
  getLinuxDoErrorRedirect,
} from "../services/linuxDoAuthService";
import { getClientIP } from "../utils/ipUtils";

jest.mock("../services/linuxDoAuthService", () => ({
  completeLinuxDoAuthorization: jest.fn(),
  consumeLinuxDoLoginTicket: jest.fn(),
  createLinuxDoAuthorizationUrl: jest.fn(),
  getLinuxDoConfigSummary: jest.fn(),
  getLinuxDoErrorRedirect: jest.fn((message: string) => `https://frontend.example/auth/linuxdo/callback?error=${encodeURIComponent(message)}`),
  isLinuxDoAuthEnabled: jest.fn(),
}));

jest.mock("../utils/ipUtils", () => ({
  getClientIP: jest.fn(),
}));

describe("LinuxDoAuthController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getClientIP as jest.Mock).mockReturnValue("203.0.113.10");
    (getLinuxDoConfigSummary as jest.Mock).mockReturnValue({
      frontendCallbackUrl: "https://frontend.example/auth/linuxdo/callback",
    });
  });

  it("uses POST form data for OAuth callback completion", async () => {
    const redirect = jest.fn();
    (completeLinuxDoAuthorization as jest.Mock).mockResolvedValue({
      redirectUrl: "https://frontend.example/auth/linuxdo/callback?ticket=test",
    });

    const req = {
      body: {
        code: "code-from-body",
        state: "state-from-body",
      },
      query: {
        code: "code-from-query",
        state: "state-from-query",
      },
    } as unknown as Request;
    const res = { redirect } as unknown as Response;

    await LinuxDoAuthController.callback(req, res);

    expect(completeLinuxDoAuthorization).toHaveBeenCalledWith({
      code: "code-from-body",
      state: "state-from-body",
      clientIp: "203.0.113.10",
    });
    expect(redirect).toHaveBeenCalledWith(
      302,
      "https://frontend.example/auth/linuxdo/callback?ticket=test",
    );
  });

  it("rejects GET callbacks without code/state with an explicit error redirect", async () => {
    const redirect = jest.fn();
    const req = {} as Request;
    const res = { redirect } as unknown as Response;

    await LinuxDoAuthController.callbackGet(req, res);

    expect(getLinuxDoErrorRedirect).toHaveBeenCalledWith(
      "Missing Linux.do authorization code or state",
    );
    expect(redirect).toHaveBeenCalledWith(
      302,
      "https://frontend.example/auth/linuxdo/callback?error=Missing%20Linux.do%20authorization%20code%20or%20state",
    );
  });

  it("completes GET callbacks with query code and state before redirecting to the frontend callback page", async () => {
    const redirect = jest.fn();
    (completeLinuxDoAuthorization as jest.Mock).mockResolvedValue({
      redirectUrl: "https://frontend.example/auth/linuxdo/callback?ticket=test",
    });

    const req = {
      query: {
        code: "code-from-query",
        state: "state-from-query",
      },
    } as unknown as Request;
    const res = { redirect } as unknown as Response;

    await LinuxDoAuthController.callbackGet(req, res);

    expect(completeLinuxDoAuthorization).toHaveBeenCalledWith({
      code: "code-from-query",
      state: "state-from-query",
      clientIp: "203.0.113.10",
    });
    expect(redirect).toHaveBeenCalledWith(
      302,
      "https://frontend.example/auth/linuxdo/callback?ticket=test",
    );
  });
});
