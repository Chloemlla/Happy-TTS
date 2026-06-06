import { describe, expect, it } from "@jest/globals";
import {
  approveAuthorization,
  createOAuthClient,
  getOAuthScopeDefinitions,
  getOAuthUserInfo,
  isApiScope,
  normalizeOAuthScopes,
  OAuthError,
  parseClientBasicAuth,
} from "../services/oauthService";

const baseAuthorizeRequest = {
  response_type: "code",
  client_id: "syn_client_test",
  redirect_uri: "https://client.example/callback",
  scope: "openid profile admin:identity",
};

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

  it("rejects non-admin authorization before looking up the OAuth client", async () => {
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
        isAdmin: true,
        synapseAdmin: true,
        accountStatus: "active",
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
