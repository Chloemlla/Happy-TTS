import { describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";
import { deriveUserOwnerKey } from "../services/librechat/history";
import { resolveLibreChatIdentity } from "../routes/libreChatIdentity";

function createResponse() {
  return { cookie: jest.fn() } as unknown as Response;
}

function makeSessionUser(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    username: `user-${id}`,
    email: `${id}@example.com`,
    role: "user",
    accountStatus: "active",
    ...overrides,
  };
}

describe("LibreChat canonical identity", () => {
  it("maps an authenticated session user to its stable user owner key", () => {
    const user = makeSessionUser("user-123");
    const req = {
      body: {},
      query: {},
      headers: {},
      user,
      auth: { kind: "session", user },
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
  });

  it("falls back to the legacy req.user when req.auth is absent", () => {
    const user = makeSessionUser("user-456");
    const req = {
      body: {},
      query: {},
      headers: {},
      user,
    } as unknown as Request;

    const resolution = resolveLibreChatIdentity(req, createResponse());

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error("expected authenticated resolution");
    expect(resolution.identity.ownerKey).toBe(deriveUserOwnerKey("user-456"));
    expect(resolution.identity.legacyOwnerId).toBe("user-456");
  });

  it("rejects suspended accounts even when a session is present", () => {
    const user = makeSessionUser("user-suspended", { accountStatus: "suspended" });
    const req = {
      body: {},
      query: {},
      headers: {},
      user,
      auth: { kind: "session", user },
    } as unknown as Request;

    const resolution = resolveLibreChatIdentity(req, createResponse());

    expect(resolution).toEqual({ ok: false, reason: "account-suspended" });
  });

  it("ignores a caller-supplied body token when no session is present (legacy path removed)", () => {
    const req = {
      body: { token: "attacker-controlled-token" },
      query: {},
      headers: {},
    } as unknown as Request;

    const resolution = resolveLibreChatIdentity(req, createResponse());

    expect(resolution).toEqual({ ok: false, reason: "auth-required" });
  });

  it("returns auth-required when there are no credentials at all", () => {
    const req = { body: {}, query: {}, headers: {} } as unknown as Request;

    const resolution = resolveLibreChatIdentity(req, createResponse());

    expect(resolution).toEqual({ ok: false, reason: "auth-required" });
  });
});
