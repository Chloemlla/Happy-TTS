import { createHash } from "node:crypto";
import type { ChatMessage } from "./types";

export type ConversationOwnerKind = "user" | "guest";

const OWNER_KEY_PATTERN = /^(user|guest):[a-f0-9]{64}$/;

export function normalizeLegacyConversationId(value: string): string {
  return value.replace(/[^A-Za-z0-9_\-:@.]/g, "").slice(0, 128);
}

function digestOwner(kind: ConversationOwnerKind, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("LibreChat owner identity must not be empty");
  }

  const digest = createHash("sha256").update(`${kind}\0${normalized}`, "utf8").digest("hex");
  return `${kind}:${digest}`;
}

export function deriveUserOwnerKey(userId: string): string {
  return digestOwner("user", userId);
}

export function deriveGuestOwnerKey(guestToken: string): string {
  return digestOwner("guest", guestToken);
}

export function deriveConversationOwnerKey(token: string, userId?: string): string {
  return userId?.trim() ? deriveUserOwnerKey(userId) : deriveGuestOwnerKey(token);
}

export function isConversationOwnerKey(value: unknown): value is string {
  return typeof value === "string" && OWNER_KEY_PATTERN.test(value);
}

export function assertConversationOwnerKey(value: string): string {
  if (!isConversationOwnerKey(value)) {
    throw new Error("Invalid LibreChat owner key");
  }
  return value;
}

export function messageBelongsToOwner(message: ChatMessage, ownerKey: string): boolean {
  return message.ownerKey === ownerKey;
}

/**
 * Compatibility helper for legacy callers and persisted messages. New messages
 * only contain ownerKey; token/userId comparisons are retained solely so old
 * file-backed records can be normalized without merging owners.
 */
export function messageBelongsToConversation(message: ChatMessage, token: string, userId?: string): boolean {
  const ownerKey = deriveConversationOwnerKey(token, userId);
  if (message.ownerKey) return message.ownerKey === ownerKey;
  return userId ? message.userId === userId : message.token === token;
}

export function normalizeChatMessageOwner(message: ChatMessage): ChatMessage | null {
  let ownerKey = message.ownerKey;
  if (!isConversationOwnerKey(ownerKey)) {
    try {
      ownerKey = message.userId?.trim()
        ? deriveUserOwnerKey(message.userId)
        : message.token?.trim()
          ? deriveGuestOwnerKey(message.token)
          : undefined;
    } catch {
      ownerKey = undefined;
    }
  }

  if (!ownerKey) return null;
  const safeMessage: ChatMessage = { ...message, ownerKey };
  delete safeMessage.token;
  delete safeMessage.userId;
  return safeMessage;
}

export function normalizeChatHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .map((message) => normalizeChatMessageOwner(message))
    .filter((message): message is ChatMessage => message !== null);
}
