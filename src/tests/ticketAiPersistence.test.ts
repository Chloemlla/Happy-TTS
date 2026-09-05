jest.mock("../models/ticketModel", () => ({
  TicketModel: {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

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
import { TicketModel } from "../models/ticketModel";
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
        _ownerKey: string,
        _message: string,
        _onDelta: ((delta: string) => void) | undefined,
        onFailure: ((failure: ChatFailureDiagnostics) => void) | undefined,
      ) => {
        onFailure?.(diagnostics);
        return "对话服务暂不可用，请稍后重试。";
      },
    );

    // 工单已持久化，generateAiTicketResponse 通过 _id 重新读取而不是沿用内存文档
    const baseTicket = {
      _id: "ticket-1",
      userId: "user-1",
      title: "无法生成语音",
      description: "提交后没有结果",
      priority: "high",
      status: "open",
      messages: [
        {
          _id: "m1",
          senderId: "user-1",
          senderRole: "user",
          content: "请协助排查",
          isAi: false,
        },
      ],
    };
    const afterTicket = {
      ...baseTicket,
      status: "in-progress",
      messages: [
        ...baseTicket.messages,
        {
          senderId: "system_ai",
          senderRole: "ai",
          content: "对话服务暂不可用，请稍后重试。",
          isAi: true,
          aiErrorDetails: diagnostics,
        },
      ],
    };

    // 调用顺序：round 开始 findById → LLM 完成后二次校验 findById → 下一轮 findById（尾消息已是 AI，退出循环）
    (TicketModel.findById as jest.Mock)
      .mockResolvedValueOnce(baseTicket)
      .mockResolvedValueOnce(baseTicket)
      .mockResolvedValueOnce(afterTicket);
    (TicketModel.findOneAndUpdate as jest.Mock).mockResolvedValueOnce(afterTicket);

    await generateAiTicketResponse("ticket-1");

    expect(TicketModel.findById).toHaveBeenCalledWith("ticket-1");
    expect(TicketModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "ticket-1" },
      expect.objectContaining({
        $push: {
          messages: expect.objectContaining({
            senderRole: "ai",
            content: "对话服务暂不可用，请稍后重试。",
            aiErrorDetails: diagnostics,
          }),
        },
        $set: { status: "in-progress" },
      }),
      expect.anything(),
    );
    expect(wsService.notifyTicketAiResponse).toHaveBeenCalledWith("user-1", "ticket-1", "", true);
    expect(wsService.notifyTicketProcess).toHaveBeenCalledWith("user-1", "ticket-1", "ai_start");
    expect(wsService.notifyTicketProcess).toHaveBeenCalledWith("user-1", "ticket-1", "ai_complete");
    expect(wsService.notifyTicketUpdate).toHaveBeenCalledWith("user-1", afterTicket);
  });
});
