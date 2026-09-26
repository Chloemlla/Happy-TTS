import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * 风险分级轮换（P3）的判定语义。策略正文：docs/mobile-token-risk-control.md §5。
 *
 * 判定全部是纯函数（事实进、信号出），因此这里不发网络请求、不连 Mongo：
 * 只有 `runtimeMutableConfig` 换成一个可改写的替身，用来验证配置门控。
 */

// jest 的工厂函数只允许引用 mock 前缀的外部变量。
const mockRiskConfig = {
  enabled: true,
  elevatedIntervalMinutes: 60,
  geoJumpEnabled: true,
  geoJumpScope: "country" as "country" | "region",
  newDeviceTrustHours: 24,
  carryOverVerificationPending: true,
};

jest.mock("../config/config", () => ({
  config: { jwtSecret: "test-secret", jwtExpiresIn: "1h" },
  runtimeMutableConfig: { mobileTokenRotationRisk: mockRiskConfig },
}));

import {
  collectRotationRiskSignals,
  deviceFingerprintOf,
  elevatedRotationIntervalMs,
  isGeoJump,
  isRotationRiskEnabled,
  resolveRotationInterval,
} from "../services/mobileTokenRiskService";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = Date.UTC(2026, 0, 2, 3, 4, 5);

const BEIJING = "中国, 北京, 北京 运营商: 中国联通";
const SHANGHAI = "中国, 上海, 上海 运营商: 中国电信";
const TOKYO = "日本, 东京, 东京 运营商: NTT";

function resetConfig(overrides: Record<string, unknown> = {}): void {
  mockRiskConfig.enabled = true;
  mockRiskConfig.elevatedIntervalMinutes = 60;
  mockRiskConfig.geoJumpEnabled = true;
  mockRiskConfig.geoJumpScope = "country";
  mockRiskConfig.newDeviceTrustHours = 24;
  mockRiskConfig.carryOverVerificationPending = true;
  for (const [key, value] of Object.entries(overrides)) {
    (mockRiskConfig as unknown as Record<string, unknown>)[key] = value;
  }
}

beforeEach(() => {
  resetConfig();
});

describe("属地突变判定（isGeoJump）", () => {
  it("国家不同即算突变", () => {
    expect(isGeoJump(BEIJING, TOKYO, "country")).toBe(true);
  });

  it("只看国家时，同国换省不算突变", () => {
    expect(isGeoJump(BEIJING, SHANGHAI, "country")).toBe(false);
  });

  it("粒度放到 region 时，同国换省算突变", () => {
    expect(isGeoJump(BEIJING, SHANGHAI, "region")).toBe(true);
  });

  it("任一侧取不到有意义的值就不判 —— 不能把“查不到”当成“换了个国家”", () => {
    expect(isGeoJump(null, TOKYO, "country")).toBe(false);
    expect(isGeoJump(BEIJING, null, "country")).toBe(false);
    expect(isGeoJump("", BEIJING, "country")).toBe(false);
    expect(isGeoJump("未知", TOKYO, "country")).toBe(false);
    expect(isGeoJump(TOKYO, "未知", "country")).toBe(false);
  });

  it("同国时省份缺失不作为依据", () => {
    expect(isGeoJump("中国, 北京", "中国", "region")).toBe(false);
    expect(isGeoJump("中国", "中国, 上海", "region")).toBe(false);
  });

  it("同一个地方反复判定不会自抖", () => {
    expect(isGeoJump(BEIJING, "中国, 北京, 北京 运营商: 中国联通", "region")).toBe(false);
  });
});

describe("信号收集（collectRotationRiskSignals）", () => {
  it("总开关关掉时一路都不判", () => {
    resetConfig({ enabled: false });
    expect(isRotationRiskEnabled()).toBe(false);
    expect(
      collectRotationRiskSignals({
        previousIpLocation: BEIJING,
        currentIpLocation: TOKYO,
        verificationPending: true,
        verdictUntrusted: true,
        deviceFirstSeenAt: NOW,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("三路信号可以同时命中", () => {
    const signals = collectRotationRiskSignals({
      previousIpLocation: BEIJING,
      currentIpLocation: TOKYO,
      verificationPending: true,
      deviceFirstSeenAt: NOW - HOUR_MS,
      now: NOW,
    });
    expect(signals).toEqual(["GEO_JUMP", "VERIFICATION_PENDING", "NEW_DEVICE"]);
  });

  it("属地这一路可以单独关掉", () => {
    resetConfig({ geoJumpEnabled: false });
    const signals = collectRotationRiskSignals({
      previousIpLocation: BEIJING,
      currentIpLocation: TOKYO,
      now: NOW,
    });
    expect(signals).toEqual([]);
  });

  it("这一轮判定没过就算 VERIFICATION_PENDING，即使还没有遗留标记", () => {
    const signals = collectRotationRiskSignals({ verdictUntrusted: true, now: NOW });
    expect(signals).toEqual(["VERIFICATION_PENDING"]);
  });

  it("遗留标记也同样算 VERIFICATION_PENDING", () => {
    const signals = collectRotationRiskSignals({ verificationPending: true, now: NOW });
    expect(signals).toEqual(["VERIFICATION_PENDING"]);
  });

  it("关掉 carryOverVerificationPending 后，两种来源都不再算信号", () => {
    resetConfig({ carryOverVerificationPending: false });
    expect(collectRotationRiskSignals({ verdictUntrusted: true, now: NOW })).toEqual([]);
    expect(collectRotationRiskSignals({ verificationPending: true, now: NOW })).toEqual([]);
  });

  it("新设备只在信任窗口内算信号", () => {
    expect(collectRotationRiskSignals({ deviceFirstSeenAt: NOW - HOUR_MS, now: NOW })).toEqual(["NEW_DEVICE"]);
    expect(collectRotationRiskSignals({ deviceFirstSeenAt: NOW - DAY_MS + 1, now: NOW })).toEqual(["NEW_DEVICE"]);
    expect(collectRotationRiskSignals({ deviceFirstSeenAt: NOW - DAY_MS, now: NOW })).toEqual([]);
  });

  it("设备首见时间未知时不判 NEW_DEVICE", () => {
    expect(collectRotationRiskSignals({ deviceFirstSeenAt: null, now: NOW })).toEqual([]);
    expect(collectRotationRiskSignals({ now: NOW })).toEqual([]);
  });

  it("信任窗口可调", () => {
    resetConfig({ newDeviceTrustHours: 1 });
    expect(collectRotationRiskSignals({ deviceFirstSeenAt: NOW - 2 * HOUR_MS, now: NOW })).toEqual([]);
  });
});

describe("节奏折算（resolveRotationInterval）", () => {
  it("没有信号时沿用默认节奏", () => {
    expect(resolveRotationInterval([], DAY_MS)).toBe(DAY_MS);
  });

  it("命中信号时压到提级间隔", () => {
    expect(resolveRotationInterval(["GEO_JUMP"], DAY_MS)).toBe(HOUR_MS);
    expect(elevatedRotationIntervalMs()).toBe(HOUR_MS);
  });

  it("提级间隔按配置走", () => {
    resetConfig({ elevatedIntervalMinutes: 30 });
    expect(resolveRotationInterval(["NEW_DEVICE"], DAY_MS)).toBe(30 * 60 * 1000);
  });
});

describe("设备指纹（deviceFingerprintOf）", () => {
  it("没有 deviceId 就没有指纹", () => {
    expect(deviceFingerprintOf(undefined, "Synapse Android")).toBeUndefined();
    expect(deviceFingerprintOf("   ", "Synapse Android")).toBeUndefined();
  });

  it("同一台设备结果稳定，且只输出哈希", () => {
    const first = deviceFingerprintOf("device-1", "Synapse Android");
    expect(first).toBe(deviceFingerprintOf("device-1", "Synapse Android"));
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toContain("device-1");
  });

  it("自报原 deviceId 但换机器名会得到不同指纹", () => {
    expect(deviceFingerprintOf("device-1", "Synapse Android")).not.toBe(
      deviceFingerprintOf("device-1", "Another Phone"),
    );
  });
});
