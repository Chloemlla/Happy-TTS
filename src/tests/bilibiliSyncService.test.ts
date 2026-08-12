import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import crypto from "node:crypto";

process.env.BILIBILI_COOKIE_ENCRYPTION_KEY = "test-bilibili-cookie-key";

jest.mock("axios", () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ status: 200, data: { code: 0, data: { isLogin: true, mid: 12345 } } }) },
}));

const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockUpdateOne = jest.fn();

jest.mock("../models/bilibiliSyncModel", () => ({
  BilibiliSyncModel: {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
    updateOne: mockUpdateOne,
  },
}));

const {
  bindBilibiliUid,
  encryptCredential,
  getBilibiliSearchChanges,
  updateBilibiliSettings,
  upsertBilibiliSearchRecords,
} = require("../services/bilibiliSyncService") as typeof import("../services/bilibiliSyncService");

function queryResult<T>(value: T) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function syncDoc(overrides: Record<string, unknown> = {}) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    crypto.createHash("sha256").update(process.env.BILIBILI_COOKIE_ENCRYPTION_KEY!).digest(),
    iv,
  );
  const ciphertext = Buffer.concat([cipher.update("SESSDATA=test; bili_jct=test", "utf8"), cipher.final()]);
  return {
    userId: "user-1",
    settings: {},
    settingsVersion: 0,
    settingsUpdatedAt: null,
    searchRecords: [],
    searchRecordsVersion: 0,
    bilibiliUid: "12345",
    credentialStatus: "active",
    credentialCiphertext: ciphertext.toString("base64"),
    credentialIv: iv.toString("base64"),
    credentialTag: cipher.getAuthTag().toString("base64"),
    credentialKeyVersion: "v1",
    ...overrides,
  };
}

describe("bilibiliSyncService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOne.mockReturnValue(queryResult(syncDoc()));
    mockFindOneAndUpdate.mockResolvedValue(syncDoc());
    mockUpdateOne.mockResolvedValue({ acknowledged: true });
  });

  it("rejects malformed Bilibili UIDs before writing", async () => {
    await expect(bindBilibiliUid("user-1", "abc", "cookie")).rejects.toMatchObject({ code: "BILIBILI_UID_INVALID" });
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not accept settings written against a stale version", async () => {
    mockFindOneAndUpdate
      .mockResolvedValueOnce(syncDoc())
      .mockResolvedValueOnce(null);
    mockFindOne.mockReturnValue(queryResult(syncDoc({ settingsVersion: 2 })));

    await expect(updateBilibiliSettings("user-1", { theme: "dark" }, 1, true)).rejects.toMatchObject({
      code: "BILIBILI_SETTINGS_CONFLICT",
      currentVersion: 2,
    });
  });

  it("strips nested credentials before settings persistence", async () => {
    await updateBilibiliSettings("user-1", {
      theme: "dark",
      integrations: { apiKey: "must-not-store", enabled: true },
    }, 0, false);

    const update = mockFindOneAndUpdate.mock.calls[1][1] as { $set: { settings: Record<string, unknown> } };
    expect(update.$set.settings).toEqual({ theme: "dark", integrations: { enabled: true } });
  });

  it("fails closed when the encrypted credential archive is missing", async () => {
    mockFindOne.mockReturnValue(queryResult(syncDoc({
      bilibiliUid: "12345",
      credentialStatus: "active",
      credentialCiphertext: undefined,
      credentialIv: undefined,
      credentialTag: undefined,
    })));
    await expect(updateBilibiliSettings("user-1", { theme: "dark" }, 0, true)).rejects.toMatchObject({
      code: "BILIBILI_CREDENTIAL_INVALID",
    });
  });

  it("recovers credentials encrypted under a previous fallback key", async () => {
    const originalBilibiliKey = process.env.BILIBILI_COOKIE_ENCRYPTION_KEY;
    const originalPasswordKey = process.env.PASSWORD_ENCRYPTION_KEY;
    try {
      // Simulate the old deployment where the dedicated cookie key was not set,
      // so the credential was derived from PASSWORD_ENCRYPTION_KEY.
      delete process.env.BILIBILI_COOKIE_ENCRYPTION_KEY;
      process.env.PASSWORD_ENCRYPTION_KEY = "old-password-key";
      const credential = encryptCredential("SESSDATA=old; bili_jct=old");

      // The dedicated key is introduced afterwards; decryption must still fall
      // back to the previous key instead of invalidating the credential.
      process.env.BILIBILI_COOKIE_ENCRYPTION_KEY = "brand-new-cookie-key";
      mockFindOne.mockReturnValue(queryResult(syncDoc({ ...credential, credentialStatus: "active" })));

      await expect(updateBilibiliSettings("user-1", { theme: "dark" }, 0, true)).resolves.toBeDefined();
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { userId: "user-1" },
        expect.objectContaining({ $set: expect.objectContaining({ credentialLastCheckedAt: expect.any(Date) }) }),
      );
    } finally {
      if (originalBilibiliKey === undefined) delete process.env.BILIBILI_COOKIE_ENCRYPTION_KEY;
      else process.env.BILIBILI_COOKIE_ENCRYPTION_KEY = originalBilibiliKey;
      if (originalPasswordKey === undefined) delete process.env.PASSWORD_ENCRYPTION_KEY;
      else process.env.PASSWORD_ENCRYPTION_KEY = originalPasswordKey;
    }
  });

  it("invalidates the credential only when no candidate key can decrypt it", async () => {
    const originalBilibiliKey = process.env.BILIBILI_COOKIE_ENCRYPTION_KEY;
    const originalPasswordKey = process.env.PASSWORD_ENCRYPTION_KEY;
    const originalAesKey = process.env.AES_KEY;
    try {
      process.env.BILIBILI_COOKIE_ENCRYPTION_KEY = "key-used-at-write-time";
      const credential = encryptCredential("SESSDATA=temp; bili_jct=temp");

      process.env.BILIBILI_COOKIE_ENCRYPTION_KEY = "a-different-key";
      process.env.PASSWORD_ENCRYPTION_KEY = "another-key";
      process.env.AES_KEY = "yet-another-key";
      mockFindOne.mockReturnValue(queryResult(syncDoc({ ...credential, credentialStatus: "active" })));

      await expect(updateBilibiliSettings("user-1", { theme: "dark" }, 0, true)).rejects.toMatchObject({
        code: "BILIBILI_CREDENTIAL_INVALID",
      });
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { userId: "user-1" },
        expect.objectContaining({ $set: expect.objectContaining({ credentialStatus: "invalid" }) }),
      );
    } finally {
      if (originalBilibiliKey === undefined) delete process.env.BILIBILI_COOKIE_ENCRYPTION_KEY;
      else process.env.BILIBILI_COOKIE_ENCRYPTION_KEY = originalBilibiliKey;
      if (originalPasswordKey === undefined) delete process.env.PASSWORD_ENCRYPTION_KEY;
      else process.env.PASSWORD_ENCRYPTION_KEY = originalPasswordKey;
      if (originalAesKey === undefined) delete process.env.AES_KEY;
      else process.env.AES_KEY = originalAesKey;
    }
  });

  it("deduplicates batch records and preserves tombstones in incremental changes", async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(syncDoc());
    await upsertBilibiliSearchRecords("user-1", [
      { id: "a", keyword: "  Hello " },
      { id: "b", keyword: "hello" },
      { id: "c", keyword: "remove", isDeleted: true },
    ]);

    const update = mockFindOneAndUpdate.mock.calls[mockFindOneAndUpdate.mock.calls.length - 1][1] as {
      $set: { searchRecords: Array<{ isDeleted: boolean }> };
    };
    expect(update.$set.searchRecords).toHaveLength(2);
    expect(update.$set.searchRecords.some((record) => record.isDeleted)).toBe(true);

    mockFindOne
      .mockReturnValueOnce(queryResult(syncDoc()))
      .mockReturnValueOnce(queryResult({
        searchRecords: update.$set.searchRecords.map((record) => ({
          ...record,
          serverUpdatedAt: new Date(),
        })),
      }));
    const changes = await getBilibiliSearchChanges("user-1", "1970-01-01T00:00:00.000Z", 10);
    expect(changes.records.some((record) => record.isDeleted)).toBe(true);
  });

  it("accepts the full retained search history page size", async () => {
    await expect(
      getBilibiliSearchChanges("user-1", "1970-01-01T00:00:00.000Z", 1000),
    ).resolves.toMatchObject({ records: [] });
  });
});
