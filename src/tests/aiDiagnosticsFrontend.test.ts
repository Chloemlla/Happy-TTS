import { parseAiErrorDetails } from "../../frontend/src/utils/aiDiagnostics";

describe("frontend AI diagnostics parsing", () => {
  it("accepts the persisted diagnostics contract", () => {
    const parsed = parseAiErrorDetails({
      reason: "all_providers_failed",
      summary: "全部 1 个对话服务调用均失败",
      occurredAt: "2026-07-11T00:00:00.000Z",
      attempts: [
        {
          baseUrl: "https://chat.example.com/v1",
          model: "support-model",
          status: 502,
          code: "upstream_unavailable",
          message: "provider unavailable",
          occurredAt: "2026-07-11T00:00:00.000Z",
        },
      ],
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        reason: "all_providers_failed",
        attempts: [expect.objectContaining({ status: 502, model: "support-model" })],
      }),
    );
  });

  it("rejects malformed diagnostics", () => {
    expect(parseAiErrorDetails({ reason: "unknown", summary: "bad", attempts: [] })).toBeUndefined();
    expect(parseAiErrorDetails(null)).toBeUndefined();
  });
});
