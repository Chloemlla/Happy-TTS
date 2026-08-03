import { describe, expect, it, jest } from "@jest/globals";
import {
  AuthSessionError,
  hashAuthCredential,
  listAuthDevices,
  revokeAuthDevice,
} from "../services/authSessionService";
import { AuthSessionModel } from "../models/authSessionModel";
import { OAuthTokenModel } from "../models/oauthModel";

jest.mock("../models/authSessionModel", () => ({
  AuthSessionModel: {
    find: jest.fn(),
    updateMany: jest.fn(),
  },
}));

jest.mock("../models/oauthModel", () => ({
  OAuthTokenModel: { updateMany: jest.fn() },
}));

jest.mock("../services/mobileLoginService", () => ({
  revokeClientLoginTokensByHashes: jest.fn(),
}));

const makeSession = (overrides: Record<string, unknown> = {}) => ({
  sessionId: "as_test",
  userId: "user-1",
  credentialHash: "hash-old",
  credentialType: "jwt",
  authKind: "jwt",
  deviceKey: "a".repeat(40),
  deviceId: "device-1",
  deviceName: "Chrome on Windows",
  platform: "Windows Web",
  clientType: "web",
  ipAddress: "203.0.113.10",
  ipLocation: "测试属地",
  userAgent: "Mozilla/5.0",
  oauthClientId: null,
  oauthTokenId: null,
  oauthGrantId: null,
  clientTokenHash: null,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  lastActivityAt: new Date("2026-08-02T00:00:00.000Z"),
  revokedAt: null,
  updatedAt: new Date("2026-08-02T00:00:00.000Z"),
  ...overrides,
});

describe("authSessionService", () => {
  it("groups sessions by device and exposes current/revoked status", async () => {
    const active = makeSession({ credentialHash: hashAuthCredential("active-token") });
    const revoked = makeSession({ sessionId: "as_revoked", credentialHash: "revoked-hash", revokedAt: new Date("2026-08-02T01:00:00.000Z") });
    (AuthSessionModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([active, revoked] as never) }),
    });

    const devices = await listAuthDevices("user-1", "active-token");

    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual(expect.objectContaining({
      deviceName: "Chrome on Windows",
      platform: "Windows Web",
      clientType: "web",
      ip: "203.0.113.10",
      ipLocation: "测试属地",
      revoked: false,
    }));
    expect(devices[0].sessions).toHaveLength(2);
  });

  it("protects the current session when revoking a device", async () => {
    (AuthSessionModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([makeSession({ credentialHash: hashAuthCredential("current-token") })] as never),
    });

    await expect(revokeAuthDevice("user-1", "a".repeat(40), "current-token")).rejects.toBeInstanceOf(AuthSessionError);
    expect(AuthSessionModel.updateMany).not.toHaveBeenCalled();
  });

  it("revokes OAuth tokens and client token sessions for a device", async () => {
    (AuthSessionModel.find as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue([
        makeSession({ authKind: "oauth", oauthTokenId: "ot_1", oauthGrantId: "og_1" }),
        makeSession({ sessionId: "as_client", authKind: "client-token", clientTokenHash: "ct_1" }),
      ] as never),
    });
    (AuthSessionModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 } as never);

    await expect(revokeAuthDevice("user-1", "a".repeat(40), "other-token")).resolves.toEqual({ revoked: 2 });
    expect(OAuthTokenModel.updateMany).toHaveBeenCalledWith(
      { userId: "user-1", tokenId: { $in: ["ot_1"] } },
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });
});
