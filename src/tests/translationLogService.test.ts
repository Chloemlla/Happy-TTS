import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { TranslationLogModel } from "../models/translationLogModel";
import { TranslationLogService } from "../services/translationLogService";

jest.mock("../models/translationLogModel", () => ({
  TranslationLogModel: {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    estimatedDocumentCount: jest.fn(),
    aggregate: jest.fn(),
  },
}));

describe("translationLogService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("writes translation logs with the provided payload", async () => {
    await TranslationLogService.log({
      userId: "user-1",
      input_text: "hello",
      output_text: "你好",
      ip_address: "127.0.0.1",
      request_meta: { duration_ms: 123 },
    });

    expect(TranslationLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        input_text: "hello",
        output_text: "你好",
        ip_address: "127.0.0.1",
      }),
    );
  });

  it("queries translation logs with paging", async () => {
    const lean = jest.fn().mockResolvedValue([
      { _id: "log-1", userId: "user-1" },
    ]);
    const limit = jest.fn().mockReturnValue({ lean });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    (TranslationLogModel.find as jest.Mock).mockReturnValue({ sort });
    (TranslationLogModel.countDocuments as jest.Mock).mockResolvedValue(1);

    const result = await TranslationLogService.query({
      page: 1,
      pageSize: 20,
      keyword: "hello",
    });

    expect(TranslationLogModel.find).toHaveBeenCalled();
    expect(result.total).toBe(1);
    expect(result.logs).toHaveLength(1);
  });
});
