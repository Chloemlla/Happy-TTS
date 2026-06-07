import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  backfillLegacyLinuxDoIdentityForUser,
  buildProviderUserUpdates,
  upsertIdentityForUser,
} from "../services/accountIdentityService";
import type { User } from "../utils/userStorage";

const mockFindOne = jest.fn();
const mockFindOneAndUpdate = jest.fn();
const mockFind = jest.fn();
const mockGetUserByLinuxDoId = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("../models/accountIdentityModel", () => ({
  AccountIdentityModel: {
    findOne: mockFindOne,
    findOneAndUpdate: mockFindOneAndUpdate,
    find: mockFind,
  },
}));

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserByLinuxDoId: mockGetUserByLinuxDoId,
    updateUser: mockUpdateUser,
  },
}));

jest.mock("../services/accountMergeService", () => ({
  createMergePreviewSession: jest.fn(),
  getPendingMergeSessionForUser: jest.fn(),
}));

jest.mock("../services/auditLogService", () => ({
  AuditLogService: {
    log: jest.fn(),
  },
}));

function queryResult<T>(value: T) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    username: "demo",
    email: "demo@example.com",
    role: "user",
    dailyUsage: 0,
    lastUsageDate: "2026-06-07",
    createdAt: "2026-06-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("accountIdentityService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindOne.mockReturnValue(queryResult(null));
    mockFindOneAndUpdate.mockResolvedValue(null);
    mockFind.mockReturnValue(queryResult([]));
    mockGetUserByLinuxDoId.mockResolvedValue(null);
    mockUpdateUser.mockResolvedValue(null);
  });

  it("backfills Linux.do identity without conflicting userId update operators", async () => {
    await backfillLegacyLinuxDoIdentityForUser(
      makeUser({
        linuxdoId: "55187",
        linuxdoUsername: "linuxdo_user",
        linuxdoAvatarUrl: "https://linux.do/avatar.png",
      }),
    );

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const [query, update, options] = mockFindOneAndUpdate.mock.calls[0];

    expect(query).toEqual({ provider: "linuxdo", providerUserId: "55187", userId: "user-1" });
    expect(update.$setOnInsert.userId).toBe("user-1");
    expect(update.$set.userId).toBeUndefined();
    expect(options).toEqual({ upsert: true, returnDocument: "after" });
  });

  it("does not overwrite an existing Linux.do identity owned by another user during backfill", async () => {
    mockFindOne.mockReturnValue(queryResult({ userId: "other-user" }));

    await backfillLegacyLinuxDoIdentityForUser(makeUser({ linuxdoId: "55187" }));

    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("skips the legacy linuxdoId field when another user already owns it", async () => {
    mockGetUserByLinuxDoId.mockResolvedValue(makeUser({ id: "other-user" }));

    const updates = await buildProviderUserUpdates(makeUser(), {
      provider: "linuxdo",
      providerUserId: "55187",
      providerUsername: "linuxdo_user",
      avatarUrl: "https://linux.do/avatar.png",
    });

    expect(updates).not.toHaveProperty("linuxdoId");
    expect(updates).toEqual(
      expect.objectContaining({
        linuxdoUsername: "linuxdo_user",
        linuxdoAvatarUrl: "https://linux.do/avatar.png",
        avatarUrl: "https://linux.do/avatar.png",
        authProvider: "linuxdo",
      }),
    );
  });

  it("upserts identities with returnDocument and safe legacy user updates", async () => {
    mockGetUserByLinuxDoId.mockResolvedValue(makeUser({ id: "other-user" }));

    await upsertIdentityForUser(makeUser(), {
      provider: "linuxdo",
      providerUserId: "55187",
      providerEmail: "demo@example.com",
      providerUsername: "linuxdo_user",
      avatarUrl: "https://linux.do/avatar.png",
    });

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { provider: "linuxdo", providerUserId: "55187" },
      expect.any(Object),
      { upsert: true, returnDocument: "after" },
    );
    expect(mockUpdateUser).toHaveBeenCalledWith(
      "user-1",
      expect.not.objectContaining({
        linuxdoId: "55187",
      }),
    );
  });
});
