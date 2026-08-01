import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ChatMessage } from "../services/librechat/types";

type MongoUpdate = {
  $push?: { messages?: { $each?: ChatMessage[]; $slice?: number } };
  $pull?: { messages?: { id?: { $in?: string[] } } };
  $set?: Record<string, unknown>;
  $setOnInsert?: Record<string, unknown>;
  $unset?: Record<string, unknown>;
};

const mockHistories = new Map<string, ChatMessage[]>();
const mockLegacyHistories = new Map<string, { _id: string; userId: string; messages: ChatMessage[]; deleted?: boolean }>();

function mockOwnerMessages(ownerKey: string): ChatMessage[] {
  return mockHistories.get(ownerKey) || [];
}

function mockApplyUpdate(ownerKey: string, update: MongoUpdate): { matchedCount: number } {
  let messages = [...mockOwnerMessages(ownerKey)];
  const existed = mockHistories.has(ownerKey);
  const positionalMessageId = typeof update.$set?.messageId === "string" ? update.$set.messageId : undefined;
  const positionalMessageMatched = positionalMessageId
    ? messages.some((item) => item.id === positionalMessageId)
    : undefined;
  const pushedMessages = update.$push?.messages?.$each || [];
  if (pushedMessages.length > 0) {
    messages.push(...pushedMessages.map((item) => ({ ...item })));
    const slice = update.$push?.messages?.$slice;
    if (typeof slice === "number" && slice < 0) messages = messages.slice(slice);
  }

  const removedIds = new Set(update.$pull?.messages?.id?.$in || []);
  if (removedIds.size > 0) messages = messages.filter((item) => !removedIds.has(item.id));

  const replacement = update.$set?.["messages.$"] as ChatMessage | undefined;
  const replacementContent = update.$set?.["messages.$.message"];
  if (replacement) {
    messages = messages.map((item) => (item.id === replacement.id ? { ...replacement } : item));
  } else if (typeof replacementContent === "string") {
    const messageId = String(update.$set?.messageId || "");
    messages = messages.map((item) => (item.id === messageId ? { ...item, message: replacementContent } : item));
  }

  if (Array.isArray(update.$set?.messages)) {
    messages = (update.$set.messages as ChatMessage[]).map((item) => ({ ...item }));
  }

  mockHistories.set(ownerKey, messages);
  const matchedCount =
    positionalMessageMatched === undefined ? existed || pushedMessages.length > 0 : positionalMessageMatched;
  return { matchedCount: matchedCount ? 1 : 0 };
}

type LegacyFilter = {
  ownerKey?: string;
  userId?: string;
  $and?: Array<{
    $or?: Array<Record<string, unknown>>;
  }>;
};

function legacyMatchesFilter(
  legacy: { userId: string; messages: ChatMessage[] },
  filter: LegacyFilter,
): boolean {
  if (typeof filter.userId === "string" && legacy.userId !== filter.userId) return false;
  const identityOr = filter.$and?.find(
    (part) =>
      Array.isArray(part.$or) &&
      part.$or.some((item) => "userId" in item || "messages.ownerKey" in item),
  );
  if (!identityOr?.$or) return true;
  return identityOr.$or.some((item) => {
    if (typeof item.userId === "string") return legacy.userId === item.userId;
    const ownerKey = item["messages.ownerKey"];
    return typeof ownerKey === "string" && legacy.messages.some((message) => message.ownerKey === ownerKey);
  });
}

const mockFindOne = jest.fn((filter: LegacyFilter) => ({
  lean: jest.fn(async () => {
    if (typeof filter.ownerKey === "string") {
      const ownerKey = filter.ownerKey;
      if (!mockHistories.has(ownerKey)) return null;
      return { ownerKey, messages: mockOwnerMessages(ownerKey).map((item) => ({ ...item })) };
    }
    const legacy = [...mockLegacyHistories.values()].find((item) => legacyMatchesFilter(item, filter));
    if (legacy) return { ...legacy, messages: legacy.messages.map((item) => ({ ...item })) };
    return null;
  }),
}));
const mockFindOneAndUpdate = jest.fn(
  async (filter: { ownerKey?: string }, update: MongoUpdate) => {
    const ownerKey = String(filter.ownerKey || "");
    mockApplyUpdate(ownerKey, update);
    return { ownerKey, messages: mockOwnerMessages(ownerKey) };
  },
);
const mockUpdateOne = jest.fn(async (
  filter: {
    _id?: string;
    ownerKey?: string;
    userId?: string;
    messages?: ChatMessage[];
    "messages.id"?: string | { $ne?: string };
  },
  update: MongoUpdate,
) => {
  if (filter._id || filter.userId) {
    const legacyEntry = [...mockLegacyHistories.entries()].find(([, item]) =>
      filter._id ? item._id === filter._id : item.userId === filter.userId,
    );
    if (!legacyEntry) return { matchedCount: 0 };
    const [legacyMapKey, legacy] = legacyEntry;
    if (Array.isArray(filter.messages) && JSON.stringify(filter.messages) !== JSON.stringify(legacy.messages)) {
      return { matchedCount: 0 };
    }
    if (Array.isArray(update.$set?.messages)) {
      legacy.messages = (update.$set.messages as ChatMessage[]).map((item) => ({ ...item }));
    }
    if (update.$unset?.userId !== undefined) {
      if (legacy.messages.length === 0) {
        mockLegacyHistories.delete(legacyMapKey);
      } else {
        // Keep the fixture addressable by _id while modeling Mongo's unset.
        legacy.userId = "";
      }
    }
    return { matchedCount: 1 };
  }

  const ownerKey = String(filter.ownerKey || "");
  const messageCondition = filter["messages.id"];
  if (
    messageCondition &&
    typeof messageCondition !== "string" &&
    messageCondition.$ne &&
    mockOwnerMessages(ownerKey).some((item) => item.id === messageCondition.$ne)
  ) {
    return { matchedCount: 0 };
  }
  const updateWithMessageId: MongoUpdate = typeof messageCondition === "string"
    ? { ...update, $set: { ...update.$set, messageId: filter["messages.id"] } }
    : update;
  return mockApplyUpdate(ownerKey, updateWithMessageId);
});

const mockChatHistoryModel = {
  findOne: mockFindOne,
  findOneAndUpdate: mockFindOneAndUpdate,
  updateOne: mockUpdateOne,
};
const mockLatestRecordModel = {
  findById: jest.fn(() => ({ lean: jest.fn(async () => null) })),
};
const mockImageRecordModel = {
  findOne: jest.fn(() => ({ sort: jest.fn(() => ({ lean: jest.fn(async () => null) })) })),
};
const mockChatProviderModel = {
  find: jest.fn(() => ({ lean: jest.fn(async () => []) })),
};

const mockSchemaConstructor = class MockSchema {
  public readonly index = jest.fn();

  public constructor(..._args: unknown[]) {}
};

const mockMongooseModels = {
  LibreChatHistory: mockChatHistoryModel,
  LibreChatLatest: mockLatestRecordModel,
  LibreChatImage: mockImageRecordModel,
  ChatProvider: mockChatProviderModel,
};

jest.mock("../services/mongoService", () => ({
  mongoose: {
    connection: { readyState: 1 },
    Schema: mockSchemaConstructor,
    models: mockMongooseModels,
    model: jest.fn((name: keyof typeof mockMongooseModels) => mockMongooseModels[name]),
  },
}));

const { libreChatService } = require("../services/libreChatService") as typeof import("../services/libreChatService");
const { deriveGuestOwnerKey } = require("../services/librechat/history") as typeof import("../services/librechat/history");
const { ChatHistoryModel, LIBRECHAT_OWNER_INDEX } = require("../services/librechat/models") as typeof import("../services/librechat/models");

type TestableLibreChatService = {
  appendHistoryMessage(ownerKey: string, message: ChatMessage): Promise<number>;
};

function message(ownerKey: string, content: string): ChatMessage {
  return {
    id: randomUUID(),
    message: content,
    role: "user",
    timestamp: new Date().toISOString(),
    ownerKey,
  };
}

describe("LibreChat ownership and persistence", () => {
  beforeEach(() => {
    mockHistories.clear();
    mockLegacyHistories.clear();
    mockFindOne.mockClear();
    mockFindOneAndUpdate.mockClear();
    mockUpdateOne.mockClear();
  });

  it("declares a unique persistence key for each canonical owner", () => {
    expect(LIBRECHAT_OWNER_INDEX).toEqual({
      fields: { ownerKey: 1 },
      options: { unique: true, sparse: true, name: "librechat_owner_unique" },
    });
  });

  it("uses an atomic Mongo append instead of replacing the full message array", async () => {
    const ownerKey = deriveGuestOwnerKey(`atomic-${randomUUID()}`);
    const item = message(ownerKey, "atomic");

    await (libreChatService as unknown as TestableLibreChatService).appendHistoryMessage(ownerKey, item);

    expect(ChatHistoryModel.findOneAndUpdate).toHaveBeenCalledWith(
      { ownerKey },
      expect.objectContaining({
        $push: { messages: { $each: [item], $slice: -1000 } },
      }),
      expect.objectContaining({ upsert: true }),
    );
  });

  it("uses owner-scoped positional updates and pulls for message mutations", async () => {
    const ownerKey = deriveGuestOwnerKey(`mutations-${randomUUID()}`);
    const item = message(ownerKey, "before");
    const service = libreChatService as unknown as TestableLibreChatService;
    await service.appendHistoryMessage(ownerKey, item);
    mockUpdateOne.mockClear();

    await libreChatService.updateMessage(ownerKey, item.id, "after");
    expect(ChatHistoryModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { ownerKey, "messages.id": item.id, deleted: { $ne: true } },
      expect.objectContaining({ $set: expect.objectContaining({ "messages.$.message": "after" }) }),
    );

    await libreChatService.deleteMessage(ownerKey, item.id);
    expect(ChatHistoryModel.updateOne).toHaveBeenNthCalledWith(
      2,
      { ownerKey, deleted: { $ne: true } },
      expect.objectContaining({ $pull: { messages: { id: { $in: [item.id] } } } }),
    );
  });

  it("retries an atomic append after a concurrent unique-owner upsert", async () => {
    const ownerKey = deriveGuestOwnerKey(`duplicate-${randomUUID()}`);
    const item = message(ownerKey, "duplicate-race");
    mockFindOneAndUpdate.mockRejectedValueOnce({ code: 11000 });
    mockUpdateOne.mockClear();

    await (libreChatService as unknown as TestableLibreChatService).appendHistoryMessage(ownerKey, item);

    expect(ChatHistoryModel.updateOne).toHaveBeenCalledWith(
      { ownerKey },
      expect.objectContaining({ $push: { messages: { $each: [item], $slice: -1000 } } }),
    );
  });

  it("keeps a file-fallback append visible while Mongo still returns an older owner document", async () => {
    const ownerKey = deriveGuestOwnerKey(`fallback-${randomUUID()}`);
    const storedItem = message(ownerKey, "stored");
    const fallbackItem = message(ownerKey, "fallback");
    const recoveredItem = message(ownerKey, "recovered");
    const service = libreChatService as unknown as TestableLibreChatService & {
      ownersUsingFileFallback: Set<string>;
    };
    mockHistories.set(ownerKey, [storedItem]);
    mockFindOneAndUpdate.mockRejectedValueOnce(new Error("write failed"));

    await service.appendHistoryMessage(ownerKey, fallbackItem);

    const history = await libreChatService.getHistory(ownerKey, { page: 1, limit: 10 });
    expect(history.messages.map((item) => item.id)).toEqual([storedItem.id, fallbackItem.id]);

    await service.appendHistoryMessage(ownerKey, recoveredItem);

    expect(new Set(mockOwnerMessages(ownerKey).map((item) => item.id))).toEqual(
      new Set([storedItem.id, fallbackItem.id, recoveredItem.id]),
    );
    expect(service.ownersUsingFileFallback.has(ownerKey)).toBe(false);
  });

  it("migrates a legacy Mongo owner without retaining the raw token", async () => {
    const legacyToken = `legacy-${randomUUID()}`;
    const ownerKey = deriveGuestOwnerKey(legacyToken);
    const legacyMessage: ChatMessage = {
      id: randomUUID(),
      message: "legacy",
      role: "user",
      timestamp: new Date().toISOString(),
      token: legacyToken,
    };
    mockLegacyHistories.set(legacyToken, {
      _id: randomUUID(),
      userId: legacyToken,
      messages: [legacyMessage],
    });

    await libreChatService.prepareOwnerHistory(ownerKey, legacyToken);

    const history = await libreChatService.getHistory(ownerKey, { page: 1, limit: 10 });
    expect(history.messages).toEqual([
      expect.objectContaining({ id: legacyMessage.id, ownerKey, message: "legacy" }),
    ]);
    expect(JSON.stringify(mockOwnerMessages(ownerKey))).not.toContain(legacyToken);
    expect(mockLegacyHistories.has(legacyToken)).toBe(false);
  });

  it("keeps colliding legacy-owner messages for the next migration", async () => {
    const firstToken = "legacy/owner";
    const secondToken = "legacyowner";
    const firstOwner = deriveGuestOwnerKey(firstToken);
    const secondOwner = deriveGuestOwnerKey(secondToken);
    const firstMessage: ChatMessage = {
      id: randomUUID(),
      message: "first owner",
      role: "user",
      timestamp: new Date().toISOString(),
      token: firstToken,
    };
    const secondMessage: ChatMessage = {
      id: randomUUID(),
      message: "second owner",
      role: "assistant",
      timestamp: new Date().toISOString(),
      token: secondToken,
    };
    const legacyKey = "legacyowner";
    mockLegacyHistories.set(legacyKey, {
      _id: randomUUID(),
      userId: legacyKey,
      messages: [firstMessage, secondMessage],
    });

    await libreChatService.prepareOwnerHistory(firstOwner, firstToken);

    expect((await libreChatService.getHistory(firstOwner, { page: 1, limit: 10 })).messages).toEqual([
      expect.objectContaining({ id: firstMessage.id, ownerKey: firstOwner }),
    ]);
    expect((await libreChatService.getHistory(secondOwner, { page: 1, limit: 10 })).messages).toEqual([]);
    expect(mockLegacyHistories.has(legacyKey)).toBe(true);
    const remaining = [...mockLegacyHistories.values()][0];
    expect(remaining.messages).toEqual([
      expect.objectContaining({ id: secondMessage.id, ownerKey: secondOwner }),
    ]);
    expect(JSON.stringify(remaining.messages)).not.toContain(firstToken);
    expect(JSON.stringify(remaining.messages)).not.toContain(secondToken);

    await libreChatService.prepareOwnerHistory(secondOwner, secondToken);

    expect((await libreChatService.getHistory(secondOwner, { page: 1, limit: 10 })).messages).toEqual([
      expect.objectContaining({ id: secondMessage.id, ownerKey: secondOwner }),
    ]);
    expect(mockLegacyHistories.has(legacyKey)).toBe(false);
  });

  it("retries a legacy migration when the CAS snapshot changed", async () => {
    const legacyToken = `cas-${randomUUID()}`;
    const ownerKey = deriveGuestOwnerKey(legacyToken);
    const legacyMessage: ChatMessage = {
      id: randomUUID(),
      message: "cas",
      role: "user",
      timestamp: new Date().toISOString(),
      token: legacyToken,
    };
    mockLegacyHistories.set(legacyToken, {
      _id: randomUUID(),
      userId: legacyToken,
      messages: [legacyMessage],
    });
    const originalImplementation = mockUpdateOne.getMockImplementation();
    expect(originalImplementation).toBeDefined();
    let forcedConflict = false;
    mockUpdateOne.mockImplementation(async (filter, update) => {
      if (filter._id && !forcedConflict) {
        forcedConflict = true;
        return { matchedCount: 0 };
      }
      return originalImplementation!(filter, update);
    });

    await expect(libreChatService.prepareOwnerHistory(ownerKey, legacyToken)).resolves.toBeUndefined();
    mockUpdateOne.mockImplementation(originalImplementation!);
    expect((await libreChatService.getHistory(ownerKey, { page: 1, limit: 10 })).messages).toEqual([
      expect.objectContaining({ id: legacyMessage.id, ownerKey }),
    ]);
    expect(mockLegacyHistories.has(legacyToken)).toBe(false);
  });

  it("does not resurrect a Mongo deletion from a stale in-process cache", async () => {
    const ownerKey = deriveGuestOwnerKey(`stale-${randomUUID()}`);
    const item = message(ownerKey, "stale");
    await (libreChatService as unknown as TestableLibreChatService).appendHistoryMessage(ownerKey, item);

    mockHistories.set(ownerKey, []);

    await expect(libreChatService.getHistory(ownerKey, { page: 1, limit: 10 })).resolves.toEqual({
      messages: [],
      total: 0,
    });
  });

  it("drops a stale fallback snapshot after a successful Mongo read", async () => {
    const ownerKey = deriveGuestOwnerKey(`recovered-${randomUUID()}`);
    const staleItem = message(ownerKey, "stale fallback");
    const service = libreChatService as unknown as {
      chatHistory: ChatMessage[];
      ownersUsingFileFallback: Set<string>;
    };
    service.chatHistory = [staleItem];
    service.ownersUsingFileFallback.add(ownerKey);
    mockHistories.set(ownerKey, []);

    await expect(libreChatService.getHistory(ownerKey, { page: 1, limit: 10 })).resolves.toEqual({
      messages: [],
      total: 0,
    });
    expect(service.ownersUsingFileFallback.has(ownerKey)).toBe(false);
    expect(service.chatHistory.filter((item) => item.ownerKey === ownerKey)).toEqual([]);
  });

  it("replaces a stale fallback snapshot after a successful Mongo write", async () => {
    const ownerKey = deriveGuestOwnerKey(`recovered-write-${randomUUID()}`);
    const staleItem = message(ownerKey, "stale fallback");
    const freshItem = message(ownerKey, "fresh Mongo");
    const service = libreChatService as unknown as TestableLibreChatService & {
      chatHistory: ChatMessage[];
      ownersUsingFileFallback: Set<string>;
    };
    service.chatHistory = [staleItem];
    service.ownersUsingFileFallback.add(ownerKey);
    mockHistories.set(ownerKey, []);

    await service.appendHistoryMessage(ownerKey, freshItem);

    expect(service.ownersUsingFileFallback.has(ownerKey)).toBe(false);
    expect(service.chatHistory.filter((item) => item.ownerKey === ownerKey)).toEqual([freshItem]);
  });

  it("does not lose concurrent appends for the same owner", async () => {
    const ownerKey = deriveGuestOwnerKey(`concurrent-${randomUUID()}`);
    const items = Array.from({ length: 40 }, (_, index) => message(ownerKey, `message-${index}`));

    await Promise.all(
      items.map((item) =>
        (libreChatService as unknown as TestableLibreChatService).appendHistoryMessage(ownerKey, item),
      ),
    );

    const history = await libreChatService.getHistory(ownerKey, { page: 1, limit: 100 });
    expect(history.total).toBe(items.length);
    expect(new Set(history.messages.map((item) => item.id)).size).toBe(items.length);
  });

  it("prevents one owner from reading, updating, or deleting another owner's message", async () => {
    const ownerA = deriveGuestOwnerKey(`owner-a-${randomUUID()}`);
    const ownerB = deriveGuestOwnerKey(`owner-b-${randomUUID()}`);
    const itemA = message(ownerA, "owner-a");
    const itemB = message(ownerB, "owner-b");
    const service = libreChatService as unknown as TestableLibreChatService;
    await service.appendHistoryMessage(ownerA, itemA);
    await service.appendHistoryMessage(ownerB, itemB);

    await expect(libreChatService.updateMessage(ownerA, itemB.id, "tampered")).resolves.toEqual({ updated: 0 });
    await expect(libreChatService.deleteMessage(ownerA, itemB.id)).resolves.toEqual({ removed: 0 });

    const historyA = await libreChatService.getHistory(ownerA, { page: 1, limit: 10 });
    const historyB = await libreChatService.getHistory(ownerB, { page: 1, limit: 10 });
    expect(historyA.messages.map((item) => item.id)).toEqual([itemA.id]);
    expect(historyB.messages).toEqual([expect.objectContaining({ id: itemB.id, message: "owner-b" })]);
  });
});
