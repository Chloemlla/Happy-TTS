import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { config } from "../config/config";
import {
  authenticateGoogleUser,
  getGoogleAuthConfigSummary,
} from "../services/googleAuthService";
import { UserStorage } from "../utils/userStorage";

const verifyIdToken = jest.fn();

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken,
  })),
}));

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getAllUsers: jest.fn(),
    getUserByEmail: jest.fn(),
    getUserByUsername: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
  },
}));

describe("googleAuthService", () => {
  const baseGoogleAuthConfig = {
    ...config.googleAuth,
    clientId: "google-client-id.apps.googleusercontent.com",
  };

  beforeEach(() => {
    Object.assign(config.googleAuth, baseGoogleAuthConfig);
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.assign(config.googleAuth, baseGoogleAuthConfig);
  });

  it("returns an enabled config summary when clientId is configured", () => {
    expect(getGoogleAuthConfigSummary()).toEqual({
      enabled: true,
      clientIdConfigured: true,
      clientId: "google-client-id.apps.googleusercontent.com",
    });
  });

  it("creates a local user for a new Google account", async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-user-123",
        email: "new-google-user@example.com",
        email_verified: true,
        name: "Google User",
        picture: "https://example.com/avatar.png",
      }),
    });

    (UserStorage.getUserByEmail as jest.Mock).mockResolvedValue(null);
    (UserStorage.getAllUsers as jest.Mock).mockResolvedValue([]);
    (UserStorage.getUserByUsername as jest.Mock).mockResolvedValue(null);
    (UserStorage.createUser as jest.Mock).mockResolvedValue({
      id: "user-123",
      username: "Google_User",
      email: "new-google-user@example.com",
      role: "user",
    });
    (UserStorage.updateUser as jest.Mock)
      .mockResolvedValueOnce({
        id: "user-123",
        username: "Google_User",
        email: "new-google-user@example.com",
        role: "user",
        authProvider: "google",
        avatarUrl: "https://example.com/avatar.png",
      })
      .mockResolvedValueOnce({
        id: "user-123",
        username: "Google_User",
        email: "new-google-user@example.com",
        role: "user",
        authProvider: "google",
        avatarUrl: "https://example.com/avatar.png",
      });

    const result = await authenticateGoogleUser({
      idToken: "google-id-token",
      clientIp: "203.0.113.10",
    });

    expect(result).toEqual(
      expect.objectContaining({
        isNewUser: true,
        provider: "google",
        user: expect.objectContaining({
          id: "user-123",
          email: "new-google-user@example.com",
        }),
      }),
    );
    expect(result.token).toEqual(expect.any(String));
    expect(UserStorage.createUser).toHaveBeenCalled();
  });

  it("rejects Google accounts without a verified email", async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-user-123",
        email: "new-google-user@example.com",
        email_verified: false,
      }),
    });

    await expect(
      authenticateGoogleUser({
        idToken: "google-id-token",
      }),
    ).rejects.toThrow("Google account email is missing or unverified");
  });
});
