import { describe, expect, it, jest } from "@jest/globals";

/**
 * P5-② 代次数上限判定：只做观测，不改任何令牌的可用性。
 */

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

import {
  LINEAGE_MAX_GENERATIONS,
  generationCountOf,
  isLineageOverGenerationCap,
  reportLineageOverGenerationCap,
} from "../services/mobileTokenLineageAlertService";
import logger from "../utils/logger";

describe("代次数换算", () => {
  it("rotationIndex 从 0 起，代次数 = rotationIndex + 1", () => {
    expect(generationCountOf(0)).toBe(1);
    expect(generationCountOf(399)).toBe(400);
  });

  it("缺字段的历史令牌按第 1 代算", () => {
    expect(generationCountOf(undefined)).toBe(1);
    expect(generationCountOf(null)).toBe(1);
  });
});

describe("上限判定", () => {
  it("代次数达到上限才算越线，差一代不算", () => {
    expect(isLineageOverGenerationCap(LINEAGE_MAX_GENERATIONS - 2)).toBe(false);
    expect(isLineageOverGenerationCap(LINEAGE_MAX_GENERATIONS - 1)).toBe(true);
    expect(isLineageOverGenerationCap(LINEAGE_MAX_GENERATIONS)).toBe(true);
  });

  it("正常轮换的代次一律不告警", () => {
    for (const rotationIndex of [0, 1, 7, 30, 200]) {
      expect(isLineageOverGenerationCap(rotationIndex)).toBe(false);
    }
  });

  it("缺 rotationIndex 的旧令牌不告警", () => {
    expect(isLineageOverGenerationCap(undefined)).toBe(false);
  });
});

describe("告警只写日志", () => {
  it("越线时记 warn，且带上掩码前也够定位的字段", () => {
    reportLineageOverGenerationCap({
      userId: "user-1",
      lineageId: "lineage-1",
      rotationIndex: LINEAGE_MAX_GENERATIONS - 1,
      deviceId: "device-1",
      ip: "203.0.113.9",
    });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message, meta] = (logger.warn as jest.Mock).mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("代次数");
    expect(meta.cap).toBe(LINEAGE_MAX_GENERATIONS);
    expect(meta.generationCount).toBe(LINEAGE_MAX_GENERATIONS);
    expect(meta.rotationIndex).toBe(LINEAGE_MAX_GENERATIONS - 1);
    expect(meta.lineageId).toBe("lineage-1");
  });
});
