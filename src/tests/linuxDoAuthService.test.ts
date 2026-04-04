import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { config } from "../config/config";
import {
  buildLinuxDoAvatarUrl,
  consumeLinuxDoLoginTicket,
  createLinuxDoAuthorizationUrl,
  issueLinuxDoLoginTicket,
  normalizeLinuxDoProfile,
  resetLinuxDoAuthStateForTests,
  sanitizeLinuxDoUsername,
} from "../services/linuxDoAuthService";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;
const baseLinuxDoConfig = {
  ...config.linuxdo,
  clientId: "linuxdo-client",
  clientSecret: "linuxdo-secret",
};

beforeEach(() => {
  Object.assign(config.linuxdo, baseLinuxDoConfig);
});

afterEach(() => {
  resetLinuxDoAuthStateForTests();
  Object.assign(config.linuxdo, baseLinuxDoConfig);
  mockedAxios.get.mockReset();
  mockedAxios.post.mockReset();
});

describe("linuxDoAuthService", () => {
  it("normalizes Linux.do payloads from nested user objects", () => {
    const profile = normalizeLinuxDoProfile({
      user: {
        id: 42,
        username: "linux.do-user",
        name: "Linux Do User",
        email: "user@example.com",
        avatar_template: "/user_avatar/linux.do/demo/{size}/1_2.png",
      },
    });

    expect(profile).toEqual(
      expect.objectContaining({
        id: "42",
        username: "linux_do_user",
        displayName: "Linux Do User",
        email: "user@example.com",
        avatarUrl: "https://linux.do/user_avatar/linux.do/demo/256/1_2.png",
      }),
    );
  });

  it("sanitizes reserved or invalid usernames into local-safe values", () => {
    expect(sanitizeLinuxDoUsername("admin", "42")).toBe("admin_ld");
    expect(sanitizeLinuxDoUsername("c#dev", "42")).toBe("c_dev");
    expect(sanitizeLinuxDoUsername("", "42")).toBe("linuxdo_42");
  });

  it("accepts absolute and protocol-relative Linux.do avatars", () => {
    expect(buildLinuxDoAvatarUrl("https://cdn.example.com/avatar.png")).toBe(
      "https://cdn.example.com/avatar.png",
    );
    expect(buildLinuxDoAvatarUrl("//cdn.example.com/avatar.png")).toBe(
      "https://cdn.example.com/avatar.png",
    );
  });

  it("consumes Linux.do login tickets only once", () => {
    const ticket = issueLinuxDoLoginTicket({
      token: "jwt-token",
      user: {
        id: "1",
        username: "linuxdo_user",
        email: "user@example.com",
        role: "user",
      },
      isNewUser: true,
      provider: "linuxdo",
    });

    expect(consumeLinuxDoLoginTicket(ticket)).toEqual(
      expect.objectContaining({
        token: "jwt-token",
        isNewUser: true,
      }),
    );
    expect(consumeLinuxDoLoginTicket(ticket)).toBeNull();
  });

  it("builds Linux.do authorization URLs from discovery with scope and PKCE", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        authorization_endpoint: "https://connect.linux.do/oauth2/authorize",
        token_endpoint: "https://connect.linux.do/oauth2/token",
        userinfo_endpoint: "https://connect.linux.do/api/user",
        scopes_supported: ["openid", "profile", "email"],
        code_challenge_methods_supported: ["S256"],
      },
    } as any);

    const authorizationUrl = await createLinuxDoAuthorizationUrl("login");
    const parsedUrl = new URL(authorizationUrl);

    expect(parsedUrl.origin + parsedUrl.pathname).toBe(
      "https://connect.linux.do/oauth2/authorize",
    );
    expect(parsedUrl.searchParams.get("scope")).toBe("openid profile email");
    expect(parsedUrl.searchParams.get("response_mode")).toBe("form_post");
    expect(parsedUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsedUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(parsedUrl.searchParams.get("state")).toBeTruthy();
  });

  it("rejects discovery URLs that do not use approved Linux.do hosts", async () => {
    config.linuxdo.discoveryUrl = "https://evil.example/.well-known/openid-configuration";

    await expect(createLinuxDoAuthorizationUrl("login")).rejects.toThrow(
      "Linux.do discovery URL must use an approved Linux.do host",
    );
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it.each([
    [
      "authorization_endpoint",
      "authorization endpoint",
      "https://evil.example/oauth2/authorize",
    ],
    ["token_endpoint", "token endpoint", "https://evil.example/oauth2/token"],
    ["userinfo_endpoint", "userinfo endpoint", "https://evil.example/api/user"],
  ] as const)(
    "rejects discovery documents with untrusted %s values",
    async (field, label, badUrl) => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          authorization_endpoint: "https://connect.linux.do/oauth2/authorize",
          token_endpoint: "https://connect.linux.do/oauth2/token",
          userinfo_endpoint: "https://connect.linux.do/api/user",
          [field]: badUrl,
        },
      } as any);

      await expect(createLinuxDoAuthorizationUrl("login")).rejects.toThrow(
        `Linux.do ${label} must use an approved Linux.do host`,
      );
    },
  );
});
