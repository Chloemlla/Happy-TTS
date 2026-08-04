import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import crypto from "node:crypto";

process.env.BILIBILI_COOKIE_ENCRYPTION_KEY = "test-bilibili-account-cookie-key";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const mockSyncFindOne = jest.fn();
const mockSyncUpdateOne = jest.fn();
jest.mock("../models/bilibiliSyncModel", () => ({
  BilibiliSyncModel: {
    findOne: mockSyncFindOne,
    updateOne: mockSyncUpdateOne,
  },
}));

const mockBindingFindOneAndUpdate = jest.fn();
const mockBindingUpdateOne = jest.fn();
const mockBindingFind = jest.fn();
const mockBindingDeleteOne = jest.fn();
const mockBindingDeleteMany = jest.fn();
jest.mock("../models/bilibiliAccountBindingModel", () => ({
  BilibiliAccountBindingModel: {
    findOneAndUpdate: mockBindingFindOneAndUpdate,
    updateOne: mockBindingUpdateOne,
    find: mockBindingFind,
    deleteOne: mockBindingDeleteOne,
    deleteMany: mockBindingDeleteMany,
  },
}));

const mockAxiosGet = (jest.requireMock("axios") as { default: { get: jest.Mock } }).default.get;

const {
  listBilibiliAccounts,
  pruneBilibiliAccounts,
  removeBilibiliAccount,
  upsertBilibiliAccount,
} = require("../services/bilibiliAccountService") as typeof import("../services/bilibiliAccountService");

function queryResult<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function chainedFind<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function accountDoc(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    bilibiliUid: "12345",
    isPrimary: true,
    uidBoundAt: new Date(),
    lastSyncedAt: new Date(),
    credentialStatus: "active",
    device: { model: "Pixel" },
    permissions: { notification: "granted" },
    client: { platform: "android" },
    ...overrides,
  };
}

function legacyDoc(overrides: Record<string, unknown> = {}) {
  return { userId: "user-1", bilibiliUid: "12345", ...overrides };
}

describe("bilibiliAccountService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ status: 200, data: { code: 0, data: { isLogin: true, mid: 12345 } } });
    mockSyncFindOne.mockReturnValue(queryResult(legacyDoc()));
    mockSyncUpdateOne.mockResolvedValue({ acknowledged: true });
    mockBindingFindOneAndUpdate.mockReturnValue({ select: jest.fn().mockReturnValue(accountDoc()) });
    mockBindingUpdateOne.mockResolvedValue({ acknowledged: true });
    mockBindingFind.mockReturnValue(chainedFind([]));
    mockBindingDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockBindingDeleteMany.mockResolvedValue({ deletedCount: 1 });
  });

  it("rejects malformed Bilibili UIDs before writing", async () => {
    await expect(upsertBilibiliAccount("user-1", { uid: "abc", cookie: "x", isPrimary: true }))
      .rejects.toMatchObject({ code: "BILIBILI_UID_INVALID" });
    expect(mockBindingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects an empty cookie", async () => {
    await expect(upsertBilibiliAccount("user-1", { uid: "12345", cookie: "  ", isPrimary: true }))
      .rejects.toMatchObject({ code: "BILIBILI_COOKIE_REQUIRED" });
    expect(mockBindingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("marks the binding invalid and fails closed when the cookie does not match the uid", async () => {
    mockAxiosGet.mockResolvedValue({ status: 200, data: { code: -101, data: null } });
    await expect(upsertBilibiliAccount("user-1", { uid: "12345", cookie: "SESSDATA=x", isPrimary: true }))
      .rejects.toMatchObject({ code: "BILIBILI_COOKIE_INVALID" });
    expect(mockBindingUpdateOne).toHaveBeenCalledWith(
      { userId: "user-1", bilibiliUid: "12345" },
      expect.objectContaining({ $set: expect.objectContaining({ credentialStatus: "invalid" }) }),
    );
    expect(mockBindingFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("stores the account with encrypted credential and device/permissions snapshot", async () => {
    const result = await upsertBilibiliAccount("user-1", {
      uid: "12345",
      cookie: "SESSDATA=x; bili_jct=y",
      isPrimary: true,
      device: { model: "Pixel", brand: "Google" },
      permissions: { notification: "granted", photos: "denied" },
      client: { platform: "android", client_version: "2.1.0" },
    });
    expect(result).toMatchObject({ bound: true, uid: "12345", status: "active", isPrimary: true });
    const [, update] = mockBindingFindOneAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set.credentialStatus).toBe("active");
    expect(update.$set.device).toEqual({ model: "Pixel", brand: "Google" });
    expect(update.$set.permissions).toEqual({ notification: "granted", photos: "denied" });
    expect(update.$set.credentialCiphertext).toBeTruthy();
    expect(update.$set.credentialIv).toBeTruthy();
    expect(update.$set.credentialCiphertext).not.toContain("SESSDATA");
  });

  it("mirrors the primary credential into the legacy single-account doc", async () => {
    mockSyncFindOne.mockReturnValue(queryResult(legacyDoc({ bilibiliUid: "12345" })));
    await upsertBilibiliAccount("user-1", { uid: "12345", cookie: "SESSDATA=x", isPrimary: true });
    expect(mockSyncUpdateOne).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ $set: expect.objectContaining({ bilibiliUid: "12345", credentialStatus: "active" }) }),
    );
  });

  it("does not overwrite the legacy primary when a different non-primary account is uploaded", async () => {
    mockSyncFindOne.mockReturnValue(queryResult(legacyDoc({ bilibiliUid: "99999" })));
    await upsertBilibiliAccount("user-1", { uid: "12345", cookie: "SESSDATA=x", isPrimary: false });
    expect(mockSyncUpdateOne).not.toHaveBeenCalled();
  });

  it("lists accounts as summaries without exposing credentials", async () => {
    mockBindingFind.mockReturnValue(chainedFind([accountDoc()]));
    const result = await listBilibiliAccounts("user-1");
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({ uid: "12345", status: "active", isPrimary: true });
    expect(result.accounts[0]).not.toHaveProperty("credentialCiphertext");
    expect(result.accounts[0]).not.toHaveProperty("permissions");
  });

  it("removes a binding and clears the legacy primary when it is the primary", async () => {
    mockBindingDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mockSyncFindOne.mockReturnValue(queryResult(legacyDoc({ bilibiliUid: "12345" })));
    const result = await removeBilibiliAccount("user-1", "12345");
    expect(result).toEqual({ removed: true, uid: "12345" });
    expect(mockBindingDeleteOne).toHaveBeenCalledWith({ userId: "user-1", bilibiliUid: "12345" });
    expect(mockSyncUpdateOne).toHaveBeenCalled();
  });

  it("prunes stale bindings not present in the active uid list", async () => {
    mockBindingFind.mockReturnValue(chainedFind([{ bilibiliUid: "12345" }, { bilibiliUid: "99999" }]));
    mockBindingDeleteMany.mockResolvedValue({ deletedCount: 1 });
    mockSyncFindOne.mockReturnValue(queryResult(legacyDoc({ bilibiliUid: "12345" })));
    const result = await pruneBilibiliAccounts("user-1", ["99999"]);
    expect(result).toEqual({ removed: ["12345"], activeCount: 1 });
    expect(mockBindingDeleteMany).toHaveBeenCalledWith({ userId: "user-1", bilibiliUid: { $in: ["12345"] } });
  });

  it("rejects oversized device payloads", async () => {
    await expect(upsertBilibiliAccount("user-1", {
      uid: "12345",
      cookie: "SESSDATA=x",
      isPrimary: true,
      device: { blob: "x".repeat(20 * 1024) },
    })).rejects.toMatchObject({ code: "BILIBILI_DEVICE_TOO_LARGE" });
  });

  it("round-trips encrypted credentials decryptable with the configured key", async () => {
    await upsertBilibiliAccount("user-1", { uid: "12345", cookie: "SESSDATA=abc; bili_jct=def", isPrimary: true });
    const [, update] = mockBindingFindOneAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, string> }];
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      crypto.createHash("sha256").update(process.env.BILIBILI_COOKIE_ENCRYPTION_KEY!).digest(),
      Buffer.from(update.$set.credentialIv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(update.$set.credentialTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(update.$set.credentialCiphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    expect(plaintext).toBe("SESSDATA=abc; bili_jct=def");
  });
});
