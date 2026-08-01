import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { config } from "../config/config";
import {
  authenticateGoogleUser,
  getGoogleAuthConfigSummary,
  verifyGoogleIdToken,
} from "../services/googleAuthService";
import { sendProviderGeneratedPasswordEmail } from "../services/providerCredentialEmailService";
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

jest.mock("../services/providerCredentialEmailService", () => ({
  sendProviderGeneratedPasswordEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../services/accountIdentityService", () => ({
  findUserByProviderIdentity: jest.fn().mockResolvedValue(null),
  upsertIdentityForUser: jest.fn().mockResolvedValue(undefined),
}));

describe("googleAuthService", () => {
  const baseGoogleAuthConfig = {
    ...config.googleAuth,
    clientId: "google-client-id.apps.googleusercontent.com",
  };
  const baseSynapseAndroidConfig = {
    ...config.synapseAndroid,
    sha256CertFingerprints: [...config.synapseAndroid.sha256CertFingerprints],
    googleClientId: "",
  };

  beforeEach(() => {
    Object.assign(config.googleAuth, baseGoogleAuthConfig);
    Object.assign(config.synapseAndroid, baseSynapseAndroidConfig, {
      sha256CertFingerprints: [...baseSynapseAndroidConfig.sha256CertFingerprints],
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.assign(config.googleAuth, baseGoogleAuthConfig);
    Object.assign(config.synapseAndroid, baseSynapseAndroidConfig, {
      sha256CertFingerprints: [...baseSynapseAndroidConfig.sha256CertFingerprints],
    });
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
    const generatedPassword = (UserStorage.createUser as jest.Mock).mock.calls[0][2];
    expect(sendProviderGeneratedPasswordEmail).toHaveBeenCalledWith({
      email: "new-google-user@example.com",
      username: "Google_User",
      password: generatedPassword,
      providerLabel: "Google",
    });
  });

  it("uses the Synapse Android Client ID only for the Android config target", () => {
    config.synapseAndroid.googleClientId = "synapse-android.apps.googleusercontent.com";

    expect(getGoogleAuthConfigSummary()).toEqual({
      enabled: true,
      clientIdConfigured: true,
      clientId: "google-client-id.apps.googleusercontent.com",
    });
    expect(getGoogleAuthConfigSummary("synapse-android")).toEqual({
      enabled: true,
      clientIdConfigured: true,
      clientId: "synapse-android.apps.googleusercontent.com",
    });
  });

  it("accepts both web and Synapse Android Client IDs when verifying ID tokens", async () => {
    config.synapseAndroid.googleClientId = "synapse-android.apps.googleusercontent.com";
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-user-123",
        email: "verified@example.com",
        email_verified: true,
      }),
    });

    await verifyGoogleIdToken("google-id-token");

    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "google-id-token",
      audience: [
        "google-client-id.apps.googleusercontent.com",
        "synapse-android.apps.googleusercontent.com",
      ],
    });
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
