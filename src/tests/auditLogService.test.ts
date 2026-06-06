import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AuditLogModel } from "../models/auditLogModel";
import { AuditLogService } from "../services/auditLogService";

jest.mock("../models/auditLogModel", () => ({
  AuditLogModel: {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}));

function mockFindChain(logs: Array<Record<string, unknown>> = []) {
  const chain = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn(),
  };
  chain.sort.mockReturnValue(chain);
  chain.skip.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockResolvedValue(logs);
  (AuditLogModel.find as jest.Mock).mockReturnValue(chain);
  return chain;
}

describe("auditLogService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds advanced query filters with bounded paging", async () => {
    const chain = mockFindChain([{ _id: "log-1" }]);
    (AuditLogModel.countDocuments as jest.Mock).mockResolvedValue(1);

    const result = await AuditLogService.query({
      page: -2,
      pageSize: 200,
      module: "tts",
      result: "failure",
      method: "post",
      path: "/api/tts",
      ip: "127.0.0.1",
      statusCode: "500",
      minDurationMs: "250",
      maxDurationMs: "1000",
      keyword: "admin.*",
    });

    const filter = (AuditLogModel.find as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(filter).toMatchObject({
      module: "tts",
      result: "failure",
      method: "POST",
      "detail.statusCode": 500,
      "detail.durationMs": { $gte: 250, $lte: 1000 },
    });
    expect(filter.path).toBeInstanceOf(RegExp);
    expect(filter.ip).toBeInstanceOf(RegExp);
    expect(filter.$or).toEqual(expect.any(Array));
    expect(chain.skip).toHaveBeenCalledWith(0);
    expect(chain.limit).toHaveBeenCalledWith(100);
    expect(result).toMatchObject({ total: 1, page: 1, pageSize: 100 });
  });

  it("applies the current filter scope to stats aggregations", async () => {
    (AuditLogModel.countDocuments as jest.Mock).mockResolvedValueOnce(12).mockResolvedValueOnce(3);
    (AuditLogModel.aggregate as jest.Mock)
      .mockResolvedValueOnce([{ _id: "tts", count: 7 }])
      .mockResolvedValueOnce([{ _id: "success", count: 10 }, { _id: "failure", count: 2 }])
      .mockResolvedValueOnce([{ _id: "post /api/tts/generate", count: 5 }])
      .mockResolvedValueOnce([{ _id: "admin", userId: "u1", count: 4 }])
      .mockResolvedValueOnce([{ _id: "POST", count: 8 }])
      .mockResolvedValueOnce([{ _id: 200, count: 10 }, { _id: 500, count: 2 }])
      .mockResolvedValueOnce([{ averageDurationMs: 42.4, maxDurationMs: 120 }]);

    const stats = await AuditLogService.getStats({ module: "tts", result: "success" });
    const firstPipeline = (AuditLogModel.aggregate as jest.Mock).mock.calls[0][0] as Array<Record<string, unknown>>;

    expect(firstPipeline[0]).toEqual({ $match: expect.objectContaining({ module: "tts", result: "success" }) });
    expect(AuditLogModel.countDocuments).toHaveBeenNthCalledWith(2, expect.objectContaining({
      module: "tts",
      result: "success",
      createdAt: expect.any(Object),
    }));
    expect(stats).toMatchObject({
      total: 12,
      last24h: 3,
      averageDurationMs: 42,
      maxDurationMs: 120,
      byModule: [{ module: "tts", count: 7 }],
      topActions: [{ action: "post /api/tts/generate", count: 5 }],
    });
  });

  it("exports a capped CSV and neutralizes spreadsheet formulas", async () => {
    const chain = mockFindChain([
      {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        result: "failure",
        module: "user",
        action: "user.delete",
        username: "=admin",
        userId: "u1",
        role: "admin",
        method: "DELETE",
        path: "/api/admin/users/u1",
        detail: { statusCode: 403, durationMs: 12 },
        ip: "127.0.0.1",
        requestId: "req_1",
        errorMessage: "denied",
      },
    ]);

    const exported = await AuditLogService.exportCsv({ username: "admin" });

    expect(chain.limit).toHaveBeenCalledWith(5000);
    expect(exported.count).toBe(1);
    expect(exported.maxRows).toBe(5000);
    expect(exported.csv).toContain('"\'=admin"');
    expect(exported.csv).toContain('"403"');
  });

  it("exposes audit-log capability metadata", () => {
    const capabilities = AuditLogService.getCapabilities();

    expect(capabilities.modules).toContain("tts");
    expect(capabilities.methods).toContain("POST");
    expect(capabilities.maxPageSize).toBe(100);
    expect(capabilities.maxExportRows).toBe(5000);
  });
});
