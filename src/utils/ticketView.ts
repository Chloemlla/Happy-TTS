function toPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const candidate = value as { toObject?: () => Record<string, unknown> };
  return typeof candidate.toObject === "function" ? candidate.toObject() : { ...(value as Record<string, unknown>) };
}

export function toTicketView(ticket: unknown, includeAiErrorDetails: boolean): Record<string, unknown> {
  const plainTicket = toPlainObject(ticket);
  if (!Array.isArray(plainTicket.messages)) return plainTicket;

  return {
    ...plainTicket,
    messages: plainTicket.messages.map((message) => {
      const plainMessage = toPlainObject(message);
      if (!includeAiErrorDetails) delete plainMessage.aiErrorDetails;
      return plainMessage;
    }),
  };
}
