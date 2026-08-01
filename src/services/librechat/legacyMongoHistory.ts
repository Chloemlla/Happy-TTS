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

const MAX_MIGRATION_ATTEMPTS = 3;

function legacyDocumentFilter(legacyOwnerId: string, ownerKey: string) {
  // Older records used `userId` as a sanitized token. Once a mixed record is
  // partially migrated, that field is removed; the remaining canonical
  // messages are therefore also a lookup path for the next owner migration.
  return {
    $and: [
      { $or: [{ ownerKey: { $exists: false } }, { ownerKey: null }, { ownerKey: "" }] },
      { $or: [{ userId: legacyOwnerId }, { "messages.ownerKey": ownerKey }] },
    ],
  };
}

function legacyDocumentIdentityFilter(legacyDoc: LegacyHistoryDocument, legacyOwnerId: string) {
  return legacyDoc._id ? { _id: legacyDoc._id } : { userId: legacyOwnerId };
}

function legacyDocumentCasFilter(legacyDoc: LegacyHistoryDocument, legacyOwnerId: string) {
  const identityFilter = legacyDocumentIdentityFilter(legacyDoc, legacyOwnerId);
  return Array.isArray(legacyDoc.messages)
    ? { ...identityFilter, messages: legacyDoc.messages }
    : identityFilter;
}

async function archiveLegacyOwnerDocument(
  legacyDoc: LegacyHistoryDocument,
  legacyOwnerId: string,
): Promise<boolean> {
  const result = await ChatHistoryModel.updateOne(legacyDocumentCasFilter(legacyDoc, legacyOwnerId), {
    $set: {
      messages: [],
      deleted: true,
      deletedAt: new Date(),
      updatedAt: new Date(),
    },
    $unset: { userId: "" },
  });
  return (result as { matchedCount?: number } | null)?.matchedCount !== 0;
}

async function persistLegacyRemainder(
  legacyDoc: LegacyHistoryDocument,
  legacyOwnerId: string,
  remainingMessages: ChatMessage[],
): Promise<boolean> {
  if (remainingMessages.length === 0) {
    return archiveLegacyOwnerDocument(legacyDoc, legacyOwnerId);
  }

  // Keep the document discoverable through message.ownerKey while removing
  // the old reusable token/userId field. The next owner request can complete
  // migration by matching its canonical owner key in the message array.
  const result = await ChatHistoryModel.updateOne(legacyDocumentCasFilter(legacyDoc, legacyOwnerId), {
    $set: {
      messages: remainingMessages,
      deleted: false,
      deletedAt: null,
      updatedAt: new Date(),
    },
    $unset: { userId: "" },
  });
  return (result as { matchedCount?: number } | null)?.matchedCount !== 0;
}

export async function migrateLegacyMongoHistory({
  ownerKey,
  rawLegacyOwnerId,
  maxMessages,
}: LegacyMigrationOptions): Promise<number | null> {
  const legacyOwnerId = normalizeLegacyConversationId(rawLegacyOwnerId);
  if (!legacyOwnerId) return null;

  for (let attempt = 0; attempt < MAX_MIGRATION_ATTEMPTS; attempt += 1) {
    const legacyDoc = await ChatHistoryModel.findOne(legacyDocumentFilter(legacyOwnerId, ownerKey)).lean();
    if (!legacyDoc) return null;
    const legacyRecord = legacyDoc as LegacyHistoryDocument;

    const normalizedLegacyMessages = normalizeChatHistory(
      Array.isArray(legacyRecord.messages) ? (legacyRecord.messages as ChatMessage[]) : [],
    );
    const legacyMessages = normalizedLegacyMessages.filter((message) => messageBelongsToOwner(message, ownerKey));
    const remainingMessages = normalizedLegacyMessages.filter((message) => !messageBelongsToOwner(message, ownerKey));

    const canonicalDoc = await ChatHistoryModel.findOne({ ownerKey }).lean();
    if ((canonicalDoc as { deleted?: boolean } | null)?.deleted === true) {
      // A prior delete for this owner must not discard messages belonging to a
      // different owner that happened to share the old sanitized userId.
      if (await persistLegacyRemainder(legacyRecord, legacyOwnerId, remainingMessages)) return 0;
      continue;
    }

    if (legacyMessages.length > 0) {
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
    }

    if (await persistLegacyRemainder(legacyRecord, legacyOwnerId, remainingMessages)) {
      return legacyMessages.length;
    }
    // Another process changed the legacy array between the read and CAS write;
    // re-read it so its messages are not overwritten by this migration.
  }

  throw new Error("LibreChat legacy history migration conflicted repeatedly");
}
