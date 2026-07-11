jest.mock("../services/libreChatService", () => ({
  libreChatService: {
    sendMessage: jest.fn(),
  },
}));

jest.mock("../services/wsService", () => ({
  wsService: {
    notifyTicketProcess: jest.fn(),
    notifyTicketAiResponse: jest.fn(),
    notifyTicketUpdate: jest.fn(),
  },
}));

import { generateAiTicketResponse } from "../controllers/ticketController";
import { libreChatService } from "../services/libreChatService";
import type { ChatFailureDiagnostics } from "../services/librechat/types";
import { wsService } from "../services/wsService";

describe("ticket AI failure persistence", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stores provider diagnostics on the fallback assistant message", async () => {
    const diagnostics: ChatFailureDiagnostics = {
      reason: "all_providers_failed",
      summary: "全部 1 个对话服务调用均失败",
      attempts: [
        {
          baseUrl: "https://chat.example.com",
          model: "support-model",
          status: 502,
          code: "upstream_unavailable",
          message: "provider unavailable",
          occurredAt: new Date("2026-07-11T00:00:00.000Z"),
        },
      ],
      occurredAt: new Date("2026-07-11T00:00:00.000Z"),
    };

    (libreChatService.sendMessage as jest.Mock).mockImplementation(
      async (
        _token: string,
        _message: string,
        _userId: string | undefined,
        _onDelta: ((delta: string) => void) | undefined,
        onFailure: ((failure: ChatFailureDiagnostics) => void) | undefined,
      ) => {
        onFailure?.(diagnostics);
        return "对话服务暂不可用，请稍后重试。";
      },
    );

    const ticket = {
      _id: { toString: () => "ticket-1" },
      userId: "user-1",
      title: "无法生成语音",
      description: "提交后没有结果",
      priority: "high",
      status: "open",
      messages: [
        {
          senderId: "user-1",
          senderRole: "user",
          content: "请协助排查",
          isAi: false,
        },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };

    await generateAiTicketResponse(ticket);

    expect(ticket.messages).toHaveLength(2);
    expect(ticket.messages[1]).toEqual(
      expect.objectContaining({
        senderRole: "ai",
        content: "对话服务暂不可用，请稍后重试。",
        aiErrorDetails: diagnostics,
      }),
    );
    expect(ticket.status).toBe("in-progress");
    expect(ticket.save).toHaveBeenCalledTimes(1);
    expect(wsService.notifyTicketUpdate).toHaveBeenCalledWith("user-1", ticket);
  });
});
