import {
  buildChatProviderFailureAttempt,
  mergeChatProviderFailureAttempt,
  toChatMessagesView,
} from "../services/librechat/diagnostics";
import { toTicketView } from "../utils/ticketView";

describe("ticket AI diagnostics", () => {
  it("redacts provider credentials from persisted failure details", () => {
    const apiKey = "sk-ticket-secret-123456789";
    const attempt = buildChatProviderFailureAttempt(
      {
        baseUrl: `https://admin:password@chat.example.com/v1?apiKey=${encodeURIComponent(apiKey)}&region=cn`,
        apiKey,
        model: "support-model",
      },
      {
        code: "ERR_BAD_RESPONSE",
        message: `request failed with Bearer ${apiKey}`,
        response: {
          status: 502,
          data: {
            error: {
              code: "upstream_unavailable",
              message: `provider rejected ${apiKey}`,
            },
            authorization: `Bearer ${apiKey}`,
            nested: { apiKey },
          },
        },
      },
    );

    const serialized = JSON.stringify(attempt);
    expect(attempt.status).toBe(502);
    expect(attempt.code).toBe("upstream_unavailable");
    expect(attempt.message).toContain("provider rejected");
    expect(attempt.baseUrl).toBe("https://chat.example.com/v1");
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("region=cn");
    expect(serialized).toContain("[redacted]");
  });

  it("removes AI diagnostics from owner views while preserving the admin view", () => {
    const ticket = {
      _id: "ticket-1",
      messages: [
        {
          senderId: "system_ai",
          senderRole: "ai",
          content: "对话服务暂不可用，请稍后重试。",
          aiErrorDetails: {
            reason: "all_providers_failed",
            summary: "全部 1 个对话服务调用均失败",
            attempts: [{ baseUrl: "https://chat.example.com", model: "support-model" }],
          },
        },
      ],
    };

    const ownerView = toTicketView(ticket, false);
    const adminView = toTicketView(ticket, true);
    const ownerMessages = ownerView.messages as Array<Record<string, unknown>>;
    const adminMessages = adminView.messages as Array<Record<string, unknown>>;

    expect(ownerMessages[0]).not.toHaveProperty("aiErrorDetails");
    expect(adminMessages[0]).toHaveProperty("aiErrorDetails");
    expect(ticket.messages[0]).toHaveProperty("aiErrorDetails");
  });

  it("removes diagnostics from regular LibreChat history while preserving administrator history", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant" as const,
        message: "对话服务暂不可用，请稍后重试。",
        timestamp: "2026-07-11T00:00:00.000Z",
        token: "chat-token",
        aiErrorDetails: {
          reason: "all_providers_failed" as const,
          summary: "全部 1 个对话服务调用均失败",
          attempts: [],
          occurredAt: new Date("2026-07-11T00:00:00.000Z"),
        },
      },
    ];

    expect(toChatMessagesView(messages, false)[0]).not.toHaveProperty("aiErrorDetails");
    expect(toChatMessagesView(messages, true)[0]).toHaveProperty("aiErrorDetails");
    expect(messages[0]).toHaveProperty("aiErrorDetails");
  });

  it("deduplicates repeated weighted provider failures", () => {
    const first = buildChatProviderFailureAttempt(
      { baseUrl: "https://chat.example.com", apiKey: "secret-key", model: "support-model" },
      { response: { status: 500, data: { error: { message: "first failure" } } } },
    );
    const second = buildChatProviderFailureAttempt(
      { baseUrl: "https://chat.example.com", apiKey: "secret-key", model: "support-model" },
      { response: { status: 503, data: { error: { message: "latest failure" } } } },
    );

    const attempts = mergeChatProviderFailureAttempt(mergeChatProviderFailureAttempt([], first), second);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toEqual(expect.objectContaining({ status: 503, message: "latest failure" }));
  });
});
