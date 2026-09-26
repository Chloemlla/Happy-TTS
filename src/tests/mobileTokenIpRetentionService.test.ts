import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * P5-③ 被顶替代次的来源 IP 保留期清理。
 * 三条边界要守住：Mongo 未就绪不发查询、只清 lastUsedIp/rotatedIp、
 * 绝不动 reusedIp（那是 P4 复用看板的取证依据）。
 */

const mockConnectionState = { connected: true };
const mockUpdateMany = jest.fn(async (..._args: unknown[]) => ({ modifiedCount: 3 }));
const mockInfo = jest.fn();
const mockError = jest.fn();

jest.mock("../services/mongoService", () => ({
  isConnected: () => mockConnectionState.connected,
}));

jest.mock("../models/mobileClientTokenModel", () => ({
  MobileClientTokenModel: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
}));

jest.mock("../utils/logger", () => ({
  info: (...args: unknown[]) => mockInfo(...args),
  error: (...args: unknown[]) => mockError(...args),
  warn: jest.fn(),
}));

import {
  SUPERSEDED_IP_RETENTION_DAYS,
  ipRetentionCutoff,
  startMobileTokenIpRetention,
  stopMobileTokenIpRetention,
  supersededIpCleanupFilter,
  supersededIpRetentionDays,
  sweepSupersededTokenIps,
} from "../services/mobileTokenIpRetentionService";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 26, 12, 0, 0);

const ORIGINAL_ENV = process.env.MOBILE_TOKEN_IP_RETENTION_DAYS;

beforeEach(() => {
  mockConnectionState.connected = true;
  jest.clearAllMocks();
  delete process.env.MOBILE_TOKEN_IP_RETENTION_DAYS;
});

afterEach(() => {
  stopMobileTokenIpRetention();
  jest.useRealTimers();
  if (ORIGINAL_ENV === undefined) delete process.env.MOBILE_TOKEN_IP_RETENTION_DAYS;
  else process.env.MOBILE_TOKEN_IP_RETENTION_DAYS = ORIGINAL_ENV;
});

describe("保留期配置", () => {
  it("默认 30 天", () => {
    expect(supersededIpRetentionDays()).toBe(SUPERSEDED_IP_RETENTION_DAYS);
    expect(ipRetentionCutoff(NOW)).toBe(NOW - 30 * DAY_MS);
  });

  it("环境变量可覆盖", () => {
    process.env.MOBILE_TOKEN_IP_RETENTION_DAYS = "7";
    expect(supersededIpRetentionDays()).toBe(7);
    expect(ipRetentionCutoff(NOW)).toBe(NOW - 7 * DAY_MS);
  });

  it("环境变量写了不合法值就回退默认，不会把保留期算成负的", () => {
    process.env.MOBILE_TOKEN_IP_RETENTION_DAYS = "abc";
    expect(supersededIpRetentionDays()).toBe(SUPERSEDED_IP_RETENTION_DAYS);

    process.env.MOBILE_TOKEN_IP_RETENTION_DAYS = "-5";
    expect(supersededIpRetentionDays()).toBe(SUPERSEDED_IP_RETENTION_DAYS);
  });
});

describe("清理范围", () => {
  it("只挑早于截止时间被顶替、且还挂着 IP 的代次", () => {
    const filter = supersededIpCleanupFilter(NOW) as Record<string, unknown>;
    expect(filter.supersededAt).toEqual({ $lt: NOW });
    expect(filter.$or).toEqual([
      { lastUsedIp: { $exists: true } },
      { rotatedIp: { $exists: true } },
    ]);
  });

  it("清理动作只 unset 两个日常 IP 字段", async () => {
    await sweepSupersededTokenIps(NOW);

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const [, update] = mockUpdateMany.mock.calls[0] as [unknown, { $unset: Record<string, string> }];
    expect(Object.keys(update.$unset).sort()).toEqual(["lastUsedIp", "rotatedIp"]);
    // reusedIp 是 MOBILE_TOKEN_REUSED 的取证记录，清理它等于抹掉已发生的断链事故。
    expect(update.$unset).not.toHaveProperty("reusedIp");
    expect(update.$unset).not.toHaveProperty("deviceFingerprint");
  });

  it("返回被清理的代次数量", async () => {
    await expect(sweepSupersededTokenIps(NOW)).resolves.toBe(3);
  });

  it("没有可改的文档时返回 0", async () => {
    mockUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    await expect(sweepSupersededTokenIps(NOW)).resolves.toBe(0);
  });

  it("Mongo 未就绪时不发查询", async () => {
    mockConnectionState.connected = false;
    await expect(sweepSupersededTokenIps(NOW)).resolves.toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("周期任务", () => {
  it("启动即扫一次，重复启动不会叠加定时器", () => {
    jest.useFakeTimers();
    startMobileTokenIpRetention();
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);

    startMobileTokenIpRetention();
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(7 * 60 * 60 * 1000);
    // 只有那一个定时器在跑：7 小时跨过 6 小时间隔，恰好再多一次。
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  it("停止后不再触发", () => {
    jest.useFakeTimers();
    startMobileTokenIpRetention();
    stopMobileTokenIpRetention();
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("查询失败只记日志，不抛出", async () => {
    mockUpdateMany.mockRejectedValueOnce(new Error("mongo down mid-flight"));
    startMobileTokenIpRetention();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mockError).toHaveBeenCalled();
  });
});
