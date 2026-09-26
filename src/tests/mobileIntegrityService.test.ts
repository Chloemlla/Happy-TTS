import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import crypto from "node:crypto";

/**
 * Play Integrity 设备证明（P2）的判定语义。
 *
 * 判定策略被抽成纯函数 `evaluateIntegrityPayload`，所以绝大部分分支不需要网络；
 * 只有 nonce 生命周期与解码链路需要打桩 `fetch`，这里按 URL 分发两个假响应。
 */

// jest 的工厂函数只允许引用 mock 前缀的外部变量。
const mockIntegrityConfig = {
  mode: "off" as "off" | "observe" | "enforce",
  packageName: "com.chloemlla.synapse.mobile",
  cloudProjectNumber: "123456789012",
  serviceAccountEmail: "svc@synapse-integrity.iam.gserviceaccount.com",
  serviceAccountPrivateKey: "",
  minDeviceIntegrity: "MEETS_DEVICE_INTEGRITY" as const,
  requirePlayRecognizedApp: true,
  requireLicensedAccount: false,
  nonceTtlSeconds: 300,
  timeoutMs: 5000,
  failOpen: true,
  downgradedTtlHours: 24,
  maxTokenAgeSeconds: 600,
};

jest.mock("../config/config", () => ({
  config: { jwtSecret: "test-secret", jwtExpiresIn: "1h" },
  runtimeMutableConfig: { mobileTokenIntegrity: mockIntegrityConfig },
}));

import {
  evaluateIntegrityPayload,
  issueIntegrityNonce,
  resetIntegrityStateForTests,
  shouldDowngradeForVerdict,
  verifyClientIntegrity,
  type DecodedIntegrityPayload,
  type IntegrityPolicy,
  type IntegrityVerdict,
} from "../services/mobileIntegrityService";

const POLICY: IntegrityPolicy = {
  packageName: "com.chloemlla.synapse.mobile",
  minDeviceIntegrity: "MEETS_DEVICE_INTEGRITY",
  requirePlayRecognizedApp: true,
  requireLicensedAccount: false,
  maxTokenAgeSeconds: 600,
};

const NOW = Date.UTC(2026, 0, 2, 3, 4, 5);
const NONCE = "nonce-value-abc";

function makePayload(overrides: Partial<DecodedIntegrityPayload> = {}): DecodedIntegrityPayload {
  return {
    requestDetails: {
      requestPackageName: POLICY.packageName,
      requestHash: NONCE,
      timestampMillis: String(NOW - 1000),
    },
    appIntegrity: {
      appRecognitionVerdict: "PLAY_RECOGNIZED",
      packageName: POLICY.packageName,
      certificateSha256Digest: ["aa"],
      versionCode: "100",
    },
    deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_DEVICE_INTEGRITY"] },
    accountDetails: { appLicensingVerdict: "LICENSED" },
    ...overrides,
  };
}

function verdictOf(evaluated: boolean, trusted: boolean): IntegrityVerdict {
  return { evaluated, trusted, level: "NONE", reasons: ["stub"] };
}

/** 按 URL 分发：Google 换票端点与 decodeIntegrityToken 各给一个假响应。 */
function stubFetch(decoded: unknown, options: { ok?: boolean } = {}): jest.Mock {
  const fetchMock = jest.fn(async (url: string) => {
    if (String(url).includes("oauth2.googleapis.com")) {
      return { ok: true, json: async () => ({ access_token: "at", expires_in: 3600 }) };
    }
    if (options.ok === false) {
      return { ok: false, status: 500, text: async () => "boom" };
    }
    return { ok: true, json: async () => ({ tokenPayloadExternal: decoded }) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

let privateKeyPem = "";

beforeEach(() => {
  resetIntegrityStateForTests();
  privateKeyPem = crypto
    .generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  Object.assign(mockIntegrityConfig, { mode: "off", serviceAccountPrivateKey: privateKeyPem });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (global as unknown as { fetch?: unknown }).fetch;
});

describe("evaluateIntegrityPayload", () => {
  it("全部满足策略时判为可信，并给出设备等级", () => {
    const verdict = evaluateIntegrityPayload(makePayload(), POLICY, { expectedNonce: NONCE, now: NOW });

    expect(verdict.evaluated).toBe(true);
    expect(verdict.trusted).toBe(true);
    expect(verdict.level).toBe("DEVICE");
    expect(verdict.reasons).toEqual([]);
  });

  it("nonce 不匹配（证明是给别的请求的）判为不可信", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({ requestDetails: { requestHash: "someone-elses-nonce", timestampMillis: String(NOW) } }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.trusted).toBe(false);
    expect(verdict.reasons).toContain("NONCE_MISMATCH");
  });

  it("经典请求把 nonce 回显在 requestDetails.nonce 上也认", () => {
    // 安卓端用 setNonce 发经典请求，回显字段名与标准请求的 requestHash 不同。
    const verdict = evaluateIntegrityPayload(
      makePayload({ requestDetails: { nonce: NONCE, timestampMillis: String(NOW) } }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.trusted).toBe(true);
    expect(verdict.reasons).toEqual([]);
  });

  it("两种回显都没有时按 NONCE_MISMATCH 处理", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({ requestDetails: { timestampMillis: String(NOW) } }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.reasons).toContain("NONCE_MISMATCH");
  });

  it("时间戳过老的证明不能复用", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({ requestDetails: { requestHash: NONCE, timestampMillis: String(NOW - 3600 * 1000) } }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.reasons).toContain("TOKEN_STALE");
  });

  it("非 Play 分发的包（改包/侧载）判为不可信", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({ appIntegrity: { appRecognitionVerdict: "UNRECOGNIZED_VERSION", packageName: POLICY.packageName } }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.reasons).toContain("APP_NOT_PLAY_RECOGNIZED");
  });

  it("包名不符判为不可信", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({ appIntegrity: { appRecognitionVerdict: "PLAY_RECOGNIZED", packageName: "com.other.app" } }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.reasons).toContain("PACKAGE_MISMATCH");
  });

  it("设备等级低于策略要求时判为不可信", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({ deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY"] } }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.level).toBe("BASIC");
    expect(verdict.reasons).toContain("DEVICE_INTEGRITY_TOO_LOW");
  });

  it("更强的设备等级同样满足较低要求，取最高档位", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({
        deviceIntegrity: { deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY", "MEETS_STRONG_INTEGRITY"] },
      }),
      POLICY,
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.level).toBe("STRONG");
    expect(verdict.trusted).toBe(true);
  });

  it("策略要求授权账号而判定未授权时判为不可信", () => {
    const verdict = evaluateIntegrityPayload(
      makePayload({ accountDetails: { appLicensingVerdict: "UNEVALUATED" } }),
      { ...POLICY, requireLicensedAccount: true },
      { expectedNonce: NONCE, now: NOW },
    );

    expect(verdict.reasons).toContain("ACCOUNT_NOT_LICENSED");
  });
});

describe("verifyClientIntegrity 的 nonce 生命周期", () => {
  it("未启用（mode=off）时不参与判定，也不打网络", async () => {
    const fetchMock = stubFetch(makePayload());

    const verdict = await verifyClientIntegrity({ integrityToken: "t", nonce: "n", userId: "u" });

    expect(verdict.evaluated).toBe(false);
    expect(verdict.reasons).toEqual(["MODE_OFF"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("已启用但没带证明时判为无法判定", async () => {
    mockIntegrityConfig.mode = "enforce";

    const verdict = await verifyClientIntegrity({ userId: "u" });

    expect(verdict.evaluated).toBe(false);
    expect(verdict.reasons).toEqual(["TOKEN_MISSING"]);
  });

  it("不是本服务端签发的 nonce 一律不认", async () => {
    mockIntegrityConfig.mode = "enforce";
    issueIntegrityNonce({ userId: "u" });

    const verdict = await verifyClientIntegrity({ integrityToken: "t", nonce: "forged", userId: "u" });

    expect(verdict.reasons).toEqual(["NONCE_UNKNOWN"]);
  });

  it("别人的 nonce 不能拿来给自己的设备用", async () => {
    mockIntegrityConfig.mode = "enforce";
    const challenge = issueIntegrityNonce({ userId: "other-user" });

    const verdict = await verifyClientIntegrity({ integrityToken: "t", nonce: challenge.nonce, userId: "u" });

    expect(verdict.reasons).toEqual(["NONCE_UNKNOWN"]);
  });

  it("走通签发 → 解码 → 判定后，同一个 nonce 不能再用第二次", async () => {
    mockIntegrityConfig.mode = "enforce";
    const challenge = issueIntegrityNonce({ userId: "u", deviceId: "d" });
    stubFetch(makePayload({ requestDetails: { requestHash: challenge.nonce, timestampMillis: String(Date.now()) } }));

    const first = await verifyClientIntegrity({
      integrityToken: "integrity-token",
      nonce: challenge.nonce,
      userId: "u",
      deviceId: "d",
    });
    expect(first.evaluated).toBe(true);
    expect(first.trusted).toBe(true);
    expect(first.level).toBe("DEVICE");

    const replay = await verifyClientIntegrity({
      integrityToken: "integrity-token",
      nonce: challenge.nonce,
      userId: "u",
      deviceId: "d",
    });
    expect(replay.reasons).toEqual(["NONCE_UNKNOWN"]);
  });

  it("解码链路故障时判为无法判定，而不是判为不可信", async () => {
    mockIntegrityConfig.mode = "enforce";
    const challenge = issueIntegrityNonce({ userId: "u" });
    stubFetch(makePayload(), { ok: false });

    const verdict = await verifyClientIntegrity({ integrityToken: "t", nonce: challenge.nonce, userId: "u" });

    expect(verdict.evaluated).toBe(false);
    expect(verdict.reasons).toEqual(["DECODE_FAILED"]);
  });
});

describe("shouldDowngradeForVerdict", () => {
  it("observe 模式只看日志，从不降级", () => {
    mockIntegrityConfig.mode = "observe";
    expect(shouldDowngradeForVerdict(verdictOf(true, false))).toBe(false);
  });

  it("enforce 模式下判定为不可信就降级", () => {
    mockIntegrityConfig.mode = "enforce";
    expect(shouldDowngradeForVerdict(verdictOf(true, false))).toBe(true);
    expect(shouldDowngradeForVerdict(verdictOf(true, true))).toBe(false);
  });

  it("enforce 模式下无法判定时由 failOpen 决定", () => {
    mockIntegrityConfig.mode = "enforce";
    mockIntegrityConfig.failOpen = true;
    expect(shouldDowngradeForVerdict(verdictOf(false, false))).toBe(false);

    mockIntegrityConfig.failOpen = false;
    expect(shouldDowngradeForVerdict(verdictOf(false, false))).toBe(true);
  });
});
