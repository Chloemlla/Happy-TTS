import type { ChatMessage } from "./types";
import { ChatHistoryModel } from "./models";
import {
  messageBelongsToOwner,
  normalizeChatHistory,
  normalizeLegacyConversationId,
} from "./history";

interface LegacyMigrationOptions {
  ownerKey: string;
  rawLegacyOwnerId: string;
  maxMessages: number;
}

interface LegacyHistoryDocument {
  _id?: unknown;
  messages?: unknown;
  deleted?: boolean;
}

async function archiveLegacyOwnerDocument(
  legacyDoc: LegacyHistoryDocument,
  legacyOwnerId: string,
): Promise<void> {
  const filter = legacyDoc._id ? { _id: legacyDoc._id } : { userId: legacyOwnerId };
  await ChatHistoryModel.updateOne(filter, {
    $set: {
      messages: [],
      deleted: true,
      deletedAt: new Date(),
      updatedAt: new Date(),
    },
    $unset: { userId: "" },
  });
}

export async function migrateLegacyMongoHistory({
  ownerKey,
  rawLegacyOwnerId,
  maxMessages,
}: LegacyMigrationOptions): Promise<number | null> {
  const legacyOwnerId = normalizeLegacyConversationId(rawLegacyOwnerId);
  if (!legacyOwnerId) return null;

  const legacyDoc = await ChatHistoryModel.findOne({
    userId: legacyOwnerId,
    $or: [{ ownerKey: { $exists: false } }, { ownerKey: null }, { ownerKey: "" }],
  }).lean();
  if (!legacyDoc) return null;
  const legacyRecord = legacyDoc as LegacyHistoryDocument;

  const canonicalDoc = await ChatHistoryModel.findOne({ ownerKey }).lean();
  if ((canonicalDoc as { deleted?: boolean } | null)?.deleted === true) {
    await archiveLegacyOwnerDocument(legacyRecord, legacyOwnerId);
    return 0;
  }

  const legacyMessages = normalizeChatHistory(
    Array.isArray(legacyRecord.messages) ? (legacyRecord.messages as ChatMessage[]) : [],
  ).filter((message) => messageBelongsToOwner(message, ownerKey));

  try {
    await ChatHistoryModel.findOneAndUpdate(
      { ownerKey },
      {
        $setOnInsert: { ownerKey, messages: [] },
        $set: { updatedAt: new Date(), deleted: false, deletedAt: null },
      },
      { upsert: true, setDefaultsOnInsert: true, maxTimeMS: 10_000 },
    );
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
  }

  for (const message of legacyMessages) {
    await ChatHistoryModel.updateOne(
      { ownerKey, "messages.id": { $ne: message.id } },
      {
        $push: { messages: { $each: [message], $slice: -maxMessages } },
        $set: { updatedAt: new Date(), deleted: false, deletedAt: null },
      },
    );
  }

  await archiveLegacyOwnerDocument(legacyRecord, legacyOwnerId);
  return legacyMessages.length;
}
