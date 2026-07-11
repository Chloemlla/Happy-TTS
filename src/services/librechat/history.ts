import type { ChatMessage } from "./types";

export function messageBelongsToConversation(message: ChatMessage, token: string, userId?: string): boolean {
  return userId ? message.userId === userId : message.token === token;
}
