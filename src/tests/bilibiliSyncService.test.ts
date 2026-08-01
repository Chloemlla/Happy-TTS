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

  it("deduplicates batch records and preserves tombstones in incremental changes", async () => {
    mockFindOneAndUpdate.mockResolvedValueOnce(syncDoc());
    await upsertBilibiliSearchRecords("user-1", [
      { id: "a", keyword: "  Hello " },
      { id: "b", keyword: "hello" },
      { id: "c", keyword: "remove", isDeleted: true },
    ]);

    const update = mockUpdateOne.mock.calls[0][1] as { $set: { searchRecords: Array<{ isDeleted: boolean }> } };
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
});
