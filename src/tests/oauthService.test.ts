import { describe, expect, it } from "@jest/globals";
import {
  approveAuthorization,
  canAuthorizeOAuth,
  createOAuthClient,
  getOAuthScopeDefinitions,
  getOAuthUserInfo,
  isApiScope,
  normalizeOAuthScopes,
  OAuthError,
  parseClientBasicAuth,
  updateOAuthClient,
} from "../services/oauthService";
import { OAuthClientModel } from "../models/oauthModel";

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
});
