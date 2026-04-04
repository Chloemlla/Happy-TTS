import { afterEach, describe, expect, it } from "@jest/globals";
import {
  buildLinuxDoAvatarUrl,
  consumeLinuxDoLoginTicket,
  issueLinuxDoLoginTicket,
  normalizeLinuxDoProfile,
  resetLinuxDoAuthStateForTests,
  sanitizeLinuxDoUsername,
} from "../services/linuxDoAuthService";

afterEach(() => {
  resetLinuxDoAuthStateForTests();
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
});
