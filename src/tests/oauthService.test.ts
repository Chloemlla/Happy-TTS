import crypto from "node:crypto";
import { describe, expect, it } from "@jest/globals";
import { config } from "../config/config";
import { oauthTokenAuth } from "../middleware/oauthTokenAuth";
import {
  approveAuthorization,
  canAuthorizeOAuth,
  createOAuthClient,
  exchangeAuthorizationCode,
  getOAuthScopeDefinitions,
  getOAuthUserInfo,
  isApiScope,
  listOAuthClients,
  normalizeOAuthScopes,
  OAuthError,
  parseClientBasicAuth,
  refreshAccessToken,
  updateOAuthClient,
  validateOAuthAccessToken,
} from "../services/oauthService";
import { OAuthClientModel, OAuthGrantModel, OAuthTokenModel } from "../models/oauthModel";
import { UserStorage } from "../utils/userStorage";

const baseAuthorizeRequest = {
  response_type: "code",
  client_id: "syn_client_test",
  redirect_uri: "https://client.example/callback",
  scope: "openid profile admin:identity",
};

const makeOAuthClientDoc = (overrides: Record<string, unknown> = {}) => ({
  clientId: "syn_client_edit",
  clientSecretHash: "secret-hash",
  type: "confidential",
  name: "Original Client",
  description: null,
  homepageUrl: null,
  logoUrl: null,
  redirectUris: ["https://client.example/callback"],
  allowedScopes: ["openid", "profile", "admin:identity"],
  ownerUserId: "admin-1",
  rateLimitPerMinute: 120,
  enabled: true,
  lastUsedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const makeOAuthGrantDoc = (overrides: Record<string, unknown> = {}) => ({
  grantId: "og_test",
  clientId: "syn_client_edit",
  userId: "admin-1",
  scopes: ["openid", "profile", "admin:identity"],
  revokedAt: null,
  lastUsedAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const makeOAuthTokenDoc = (overrides: Record<string, unknown> = {}) => ({
  tokenId: "ot_test",
  accessTokenHash: hashTestSecret("syn_oat_test"),
  refreshTokenHash: hashTestSecret("syn_ort_test"),
  clientId: "syn_client_edit",
  userId: "admin-1",
  grantId: "og_test",
  scopes: ["openid", "profile", "admin:identity"],
  accessTokenExpiresAt: new Date(Date.now() + 60_000),
  refreshTokenExpiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  lastUsedAt: null,
  lastUsedIp: null,
  usageCount: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

function hashTestSecret(value: string): string {
  return crypto.createHmac("sha256", config.jwtSecret).update(value).digest("hex");
}

function makeOAuthUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    username: "root",
    email: "root@example.com",
    role: "admin",
    dailyUsage: 0,
    lastUsageDate: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    accountStatus: "active",
    ...overrides,
  };
}

describe("oauthService", () => {
  it("does not expose the API key admin wildcard as an OAuth API scope", () => {
    const scopeKeys = getOAuthScopeDefinitions().map((scope) => scope.key);

    expect(scopeKeys).toContain("admin:identity");
    expect(scopeKeys).toContain("tts");
    expect(scopeKeys).not.toContain("*");
    expect(isApiScope("tts")).toBe(true);
    expect(isApiScope("*")).toBe(false);
  });

  it("rejects non-local HTTP redirect URIs before client creation", async () => {
    await expect(
      createOAuthClient({
        name: "Bad Redirect",
        redirectUris: "http://client.example/callback",
        ownerUserId: "admin-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "invalid_client_metadata",
    });
  });

  it("allows local HTTP redirect URIs only while keeping metadata URLs HTTPS-only", async () => {
    await expect(
      createOAuthClient({
        name: "Local Dev",
        redirectUris: "http://localhost:3000/callback",
        homepageUrl: "http://client.example",
        ownerUserId: "admin-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "invalid_client_metadata",
      errorDescription: expect.stringContaining("homepageUrl"),
    });
  });

  it("allows administrators and trusted users to authorize OAuth clients", () => {
    expect(canAuthorizeOAuth({ role: "admin" } as any)).toBe(true);
    expect(canAuthorizeOAuth({ role: "trusted" } as any)).toBe(true);
    expect(canAuthorizeOAuth({ role: "user" } as any)).toBe(false);
    expect(canAuthorizeOAuth(null)).toBe(false);
  });

  it("rejects ordinary user authorization before looking up the OAuth client", async () => {
    await expect(
      approveAuthorization(baseAuthorizeRequest, {
        id: "user-1",
        username: "regular-user",
        email: "user@example.com",
        role: "user",
      } as any),
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "access_denied",
    });
  });

  it("normalizes requested scopes against client allowed scopes", () => {
    expect(normalizeOAuthScopes("openid profile status", { allowedScopes: ["openid", "profile", "status"] })).toEqual([
      "openid",
      "profile",
      "status",
    ]);

    expect(() => normalizeOAuthScopes("openid tts", { allowedScopes: ["openid"] })).toThrow(OAuthError);
  });

  it("updates OAuth client metadata and access settings", async () => {
    const current = makeOAuthClientDoc();
    let capturedPatch: Record<string, unknown> | null = null;

    jest.spyOn(OAuthClientModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(current),
    } as any);
    jest.spyOn(OAuthClientModel, "findOneAndUpdate").mockImplementation((_query: any, update: any) => {
      capturedPatch = update.$set;
      return {
        lean: jest.fn().mockResolvedValue(makeOAuthClientDoc(update.$set)),
      } as any;
    });
    const tokenRevokeSpy = jest.spyOn(OAuthTokenModel, "updateMany");
    const grantRevokeSpy = jest.spyOn(OAuthGrantModel, "updateMany");

    const updated = await updateOAuthClient("syn_client_edit", {
      name: "Gemini Admin",
      description: "Gemini admin OAuth client",
      homepageUrl: "https://gemini.chloemlla.com/admin",
      logoUrl: "https://gemini.chloemlla.com/logo.png",
      redirectUris: [
        "https://gemini.chloemlla.com/api/admin/auth/callback",
        "http://localhost:8080/api/admin/auth/callback",
      ],
      allowedScopes: "openid profile email admin:identity",
      rateLimitPerMinute: 300,
      enabled: false,
    });

    expect(OAuthClientModel.findOne).toHaveBeenCalledWith({ clientId: "syn_client_edit" });
    expect(capturedPatch).toEqual(
      expect.objectContaining({
        name: "Gemini Admin",
        description: "Gemini admin OAuth client",
        homepageUrl: "https://gemini.chloemlla.com/admin",
        logoUrl: "https://gemini.chloemlla.com/logo.png",
        redirectUris: [
          "https://gemini.chloemlla.com/api/admin/auth/callback",
          "http://localhost:8080/api/admin/auth/callback",
        ],
        allowedScopes: ["openid", "profile", "email", "admin:identity"],
        rateLimitPerMinute: 300,
        enabled: false,
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        clientId: "syn_client_edit",
        name: "Gemini Admin",
        description: "Gemini admin OAuth client",
        homepageUrl: "https://gemini.chloemlla.com/admin",
        logoUrl: "https://gemini.chloemlla.com/logo.png",
        redirectUris: [
          "https://gemini.chloemlla.com/api/admin/auth/callback",
          "http://localhost:8080/api/admin/auth/callback",
        ],
        allowedScopes: ["openid", "profile", "email", "admin:identity"],
        rateLimitPerMinute: 300,
        enabled: false,
      }),
    );
    expect(tokenRevokeSpy).toHaveBeenCalledWith(
      { clientId: "syn_client_edit" },
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(grantRevokeSpy).toHaveBeenCalledWith(
      { clientId: "syn_client_edit" },
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });

  it("attaches OAuth operational stats to client list results", async () => {
    const lastTokenUsedAt = new Date("2026-02-03T04:05:06.000Z");

    jest.spyOn(OAuthClientModel, "find").mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([makeOAuthClientDoc({ clientId: "syn_client_stats" })]),
      }),
    } as any);
    jest.spyOn(OAuthGrantModel, "aggregate").mockResolvedValue([
      {
        _id: "syn_client_stats",
        activeGrantCount: 2,
        revokedGrantCount: 1,
      },
    ] as any);
    jest.spyOn(OAuthTokenModel, "aggregate").mockResolvedValue([
      {
        _id: "syn_client_stats",
        activeAccessTokenCount: 3,
        activeRefreshTokenCount: 2,
        revokedTokenCount: 4,
        tokenUsageCount: 19,
        lastTokenUsedAt,
      },
    ] as any);

    const clients = await listOAuthClients();

    expect(clients).toHaveLength(1);
    expect(clients[0]).toEqual(
      expect.objectContaining({
        clientId: "syn_client_stats",
        operationalStats: {
          activeGrantCount: 2,
          revokedGrantCount: 1,
          activeAccessTokenCount: 3,
          activeRefreshTokenCount: 2,
          revokedTokenCount: 4,
          tokenUsageCount: 19,
          lastTokenUsedAt,
        },
      }),
    );
  });

  it("revokes grants and tokens containing scopes removed from an OAuth client", async () => {
    jest.spyOn(OAuthClientModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(
        makeOAuthClientDoc({
          clientId: "syn_client_scope_edit",
          allowedScopes: ["openid", "profile", "tts", "status"],
          enabled: true,
        }),
      ),
    } as any);
    jest.spyOn(OAuthClientModel, "findOneAndUpdate").mockImplementation((_query: any, update: any) => {
      return {
        lean: jest.fn().mockResolvedValue(
          makeOAuthClientDoc({
            clientId: "syn_client_scope_edit",
            allowedScopes: update.$set.allowedScopes,
            enabled: true,
          }),
        ),
      } as any;
    });
    const tokenRevokeSpy = jest.spyOn(OAuthTokenModel, "updateMany");
    const grantRevokeSpy = jest.spyOn(OAuthGrantModel, "updateMany");

    await updateOAuthClient("syn_client_scope_edit", {
      allowedScopes: "openid profile status",
    });

    expect(tokenRevokeSpy).toHaveBeenCalledWith(
      { clientId: "syn_client_scope_edit", scopes: { $in: ["tts"] } },
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(grantRevokeSpy).toHaveBeenCalledWith(
      { clientId: "syn_client_scope_edit", scopes: { $in: ["tts"] } },
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
  });

  it("builds userinfo with Synapse admin identity fields", () => {
    const userinfo = getOAuthUserInfo({
      user: {
        id: "admin-1",
        username: "root",
        email: "root@example.com",
        role: "admin",
        avatarUrl: "https://cdn.example/avatar.png",
        authProvider: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        accountStatus: "active",
      },
      scopes: ["openid", "profile", "email", "admin:identity"],
    } as any);

    expect(userinfo).toEqual(
      expect.objectContaining({
        sub: "admin-1",
        id: "admin-1",
        username: "root",
        email: "root@example.com",
        role: "admin",
        roles: ["admin"],
        isAdmin: true,
        is_admin: true,
        admin: true,
        synapseAdmin: true,
        synapse_admin: true,
        isTrusted: false,
        is_trusted: false,
        accountStatus: "active",
      }),
    );
  });

  it("builds trusted OAuth userinfo without admin privileges", () => {
    const userinfo = getOAuthUserInfo({
      user: {
        id: "trusted-1",
        username: "trusted-user",
        email: "trusted@example.com",
        role: "trusted",
        avatarUrl: "https://cdn.example/trusted.png",
        authProvider: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        accountStatus: "active",
      },
      scopes: ["openid", "profile", "email", "admin:identity"],
    } as any);

    expect(userinfo).toEqual(
      expect.objectContaining({
        sub: "trusted-1",
        id: "trusted-1",
        username: "trusted-user",
        email: "trusted@example.com",
        role: "trusted",
        roles: ["trusted"],
        isAdmin: false,
        is_admin: false,
        admin: false,
        synapseAdmin: false,
        synapse_admin: false,
        isTrusted: true,
        is_trusted: true,
        accountStatus: "active",
      }),
    );
  });

  it("returns admin identity aliases when only admin:identity is requested", () => {
    const userinfo = getOAuthUserInfo({
      user: {
        id: "admin-2",
        username: "owner",
        email: "owner@example.com",
        role: "admin",
        authProvider: "local",
        createdAt: "2026-01-01T00:00:00.000Z",
        accountStatus: "active",
      },
      scopes: ["openid", "admin:identity"],
    } as any);

    expect(userinfo).toEqual(
      expect.objectContaining({
        sub: "admin-2",
        role: "admin",
        isAdmin: true,
        is_admin: true,
        admin: true,
        synapseAdmin: true,
        synapse_admin: true,
      }),
    );
  });

  it("parses OAuth client credentials from Basic auth", () => {
    const header = `Basic ${Buffer.from(`${encodeURIComponent("client:one")}:${encodeURIComponent("secret two")}`).toString("base64")}`;

    expect(parseClientBasicAuth(header)).toEqual({
      clientId: "client:one",
      clientSecret: "secret two",
    });
  });

  it("rejects public OAuth clients that try to authenticate with Basic auth", async () => {
    const client = makeOAuthClientDoc({
      clientId: "syn_client_public",
      type: "public",
      clientSecretHash: null,
      allowedScopes: ["openid", "profile"],
    });
    const header = `Basic ${Buffer.from(`${encodeURIComponent(client.clientId)}:`).toString("base64")}`;

    jest.spyOn(OAuthClientModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(client),
    } as any);

    await expect(
      exchangeAuthorizationCode({
        authHeader: header,
        code: "syn_oac_test",
        redirectUri: "https://client.example/callback",
        codeVerifier: "a".repeat(43),
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      errorCode: "invalid_client",
    });
  });

  it("does not issue a new token pair when refresh token rotation loses the atomic update race", async () => {
    const clientSecret = "syn_secret_refresh";
    const refreshToken = "syn_ort_refresh";
    const client = makeOAuthClientDoc({
      clientId: "syn_client_refresh",
      clientSecretHash: hashTestSecret(clientSecret),
      allowedScopes: ["openid", "profile", "tts"],
    });
    const token = makeOAuthTokenDoc({
      clientId: client.clientId,
      refreshTokenHash: hashTestSecret(refreshToken),
      scopes: ["openid", "profile", "tts"],
    });
    const grant = makeOAuthGrantDoc({
      clientId: client.clientId,
      grantId: token.grantId,
      userId: token.userId,
      scopes: ["openid", "profile", "tts"],
    });

    jest.spyOn(OAuthClientModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(client),
    } as any);
    jest.spyOn(OAuthTokenModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(token),
    } as any);
    jest.spyOn(OAuthGrantModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(grant),
    } as any);
    jest.spyOn(UserStorage, "getUserById").mockResolvedValue(makeOAuthUser() as any);
    jest.spyOn(OAuthTokenModel, "updateOne").mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as any);
    const createTokenSpy = jest.spyOn(OAuthTokenModel, "create");

    await expect(
      refreshAccessToken({
        clientId: client.clientId,
        clientSecret,
        refreshToken,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "invalid_grant",
      errorDescription: expect.stringContaining("refresh_token"),
    });
    expect(createTokenSpy).not.toHaveBeenCalled();
  });

  it("validates access token scopes against the current grant and client scope policy", async () => {
    const accessToken = "syn_oat_scope";
    const client = makeOAuthClientDoc({
      clientId: "syn_client_scope",
      allowedScopes: ["openid", "profile"],
    });
    const token = makeOAuthTokenDoc({
      clientId: client.clientId,
      accessTokenHash: hashTestSecret(accessToken),
      scopes: ["openid", "profile", "tts"],
    });
    const grant = makeOAuthGrantDoc({
      clientId: client.clientId,
      grantId: token.grantId,
      userId: token.userId,
      scopes: ["openid", "profile", "tts"],
    });

    jest.spyOn(OAuthTokenModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(token),
    } as any);
    jest.spyOn(OAuthClientModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(client),
    } as any);
    jest.spyOn(OAuthGrantModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(grant),
    } as any);
    jest.spyOn(UserStorage, "getUserById").mockResolvedValue(makeOAuthUser() as any);

    await expect(validateOAuthAccessToken(accessToken, "tts")).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "insufficient_scope",
    });

    const context = await validateOAuthAccessToken(accessToken);
    expect(context.scopes).toEqual(["openid", "profile"]);
  });

  it("returns ASCII-only WWW-Authenticate challenges for OAuth Bearer errors", async () => {
    const accessToken = "syn_oat_header";
    const client = makeOAuthClientDoc({
      clientId: "syn_client_header",
      allowedScopes: ["openid", "profile"],
    });
    const token = makeOAuthTokenDoc({
      clientId: client.clientId,
      accessTokenHash: hashTestSecret(accessToken),
      scopes: ["openid", "profile", "tts"],
    });
    const grant = makeOAuthGrantDoc({
      clientId: client.clientId,
      grantId: token.grantId,
      userId: token.userId,
      scopes: ["openid", "profile", "tts"],
    });

    jest.spyOn(OAuthTokenModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(token),
    } as any);
    jest.spyOn(OAuthClientModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(client),
    } as any);
    jest.spyOn(OAuthGrantModel, "findOne").mockReturnValue({
      lean: jest.fn().mockResolvedValue(grant),
    } as any);
    jest.spyOn(UserStorage, "getUserById").mockResolvedValue(makeOAuthUser() as any);

    const req = {
      headers: { authorization: `bearer ${accessToken}` },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;
    const res = {
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    const next = jest.fn();

    await oauthTokenAuth("tts")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.set).toHaveBeenCalledWith("WWW-Authenticate", 'Bearer error="insufficient_scope"');
    const challenge = res.set.mock.calls.find((call: unknown[]) => call[0] === "WWW-Authenticate")?.[1] as string;
    expect(/^[\x20-\x7E]+$/.test(challenge)).toBe(true);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        oauthError: "insufficient_scope",
      }),
    );
  });
});
