import { describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { deriveGuestOwnerKey, deriveUserOwnerKey } from "../services/librechat/history";
import {
  LIBRECHAT_GUEST_COOKIE,
  resolveLibreChatIdentity,
} from "../routes/libreChatIdentity";

function createResponse() {
  return { cookie: jest.fn() } as unknown as Response;
}

describe("LibreChat canonical identity", () => {
  it("prioritizes the authenticated user over a caller-supplied guest token", () => {
    const req = {
      body: { token: "attacker-controlled-token" },
      query: {},
      headers: {},
      user: { id: "user-123" },
    } as unknown as Request;

    const resolution = resolveLibreChatIdentity(req, createResponse());

    expect(resolution).toEqual({
      ok: true,
      identity: {
        kind: "user",
        ownerKey: deriveUserOwnerKey("user-123"),
        legacyOwnerId: "user-123",
      },
    });
    expect(resolution.ok && resolution.identity.ownerKey).not.toBe(
      deriveGuestOwnerKey("attacker-controlled-token"),
    );
  });

  it("creates a non-empty high-entropy HttpOnly identity for a tokenless guest", () => {
    const previous = process.env.LIBRECHAT_GUEST_ENABLED;
    process.env.LIBRECHAT_GUEST_ENABLED = "true";
    const req = {
      body: {},
      query: {},
      headers: {},
      secure: false,
      protocol: "http",
    } as unknown as Request;
    const res = createResponse();

    try {
      const resolution = resolveLibreChatIdentity(req, res);
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error("guest identity was not created");
      expect(resolution.identity.ownerKey).toMatch(/^guest:[a-f0-9]{64}$/);

      const cookieMock = res.cookie as jest.Mock;
      const [cookieName, rawToken, options] = cookieMock.mock.calls[0] as [string, string, Record<string, unknown>];
      expect(cookieName).toBe(LIBRECHAT_GUEST_COOKIE);
      expect(rawToken).toMatch(/^guest_[a-f0-9]{64}$/);
      expect(options).toEqual(expect.objectContaining({ httpOnly: true, sameSite: "lax" }));
    } finally {
      if (previous === undefined) delete process.env.LIBRECHAT_GUEST_ENABLED;
      else process.env.LIBRECHAT_GUEST_ENABLED = previous;
    }
  });
});
