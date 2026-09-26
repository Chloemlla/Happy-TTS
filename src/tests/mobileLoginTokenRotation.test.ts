import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * 客户端登录令牌（sml_）轮换的风控语义。策略正文：docs/mobile-token-risk-control.md。
 *
 * 不连 Mongo：模型替身只需要认本用例真正用到的查询形态
 * （tokenHash / userId / lineageId / revokedAt:null / supersededAt:null / createdAt.$gte / $in）。
 */
type FakeDoc = {
  tokenHash: string;
  userId: string;
  deviceId?: string;
  deviceName?: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number | null;
  supersededAt?: number | null;
  supersededTo?: string | null;
  rotatedFrom?: string | null;
  lineageId?: string;
  rotationIndex?: number;
  deviceFingerprint?: string;
  deviceFirstSeenAt?: number;
  verificationPending?: boolean;
  riskSignals?: string[];
  reusedAt?: number;
  reusedIp?: string;
};

type Filter = Record<string, unknown>;

jest.mock("../models/mobileClientTokenModel", () => {
  const docs = new Map<string, FakeDoc>();

  const matches = (doc: FakeDoc, filter: Filter): boolean => {
    for (const [key, raw] of Object.entries(filter)) {
      const actual = (doc as unknown as Record<string, unknown>)[key];
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const ops = raw as Record<string, unknown>;
        if ("$in" in ops) {
          if (!(ops.$in as unknown[]).includes(actual)) return false;
          continue;
        }
        if ("$gte" in ops) {
          if (typeof actual !== "number" || actual < (ops.$gte as number)) return false;
          continue;
        }
      }
      if (raw === null) {
        // Mongo 的 `field: null` 同时匹配缺失与显式 null。
        if (actual !== null && actual !== undefined) return false;
        continue;
      }
      if (actual !== raw) return false;
    }
    return true;
  };

  const applySet = (doc: FakeDoc, update: Filter): void => {
    const set = (update.$set ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(set)) {
      if (value === undefined) continue;
      (doc as unknown as Record<string, unknown>)[key] = value;
    }
  };

  const model = {
    findOne: jest.fn((filter: Filter) => {
      const result = () => {
        for (const doc of docs.values()) {
          if (matches(doc, filter)) return { ...doc };
        }
        return null;
      };
      // P3 查"这台设备最早什么时候出现过"用到了 sort/select，替身照抄这几个链式调用。
      const chain = {
        sort: () => chain,
        select: () => chain,
        lean: async () => result(),
      };
      return chain;
    }),
    find: jest.fn((filter: Filter) => ({
      select: () => ({
        lean: async () =>
          [...docs.values()].filter((doc) => matches(doc, filter)).map((doc) => ({ tokenHash: doc.tokenHash })),
      }),
    })),
    create: jest.fn(async (doc: FakeDoc) => {
      docs.set(doc.tokenHash, { revokedAt: null, supersededAt: null, ...doc });
      return doc;
    }),
    countDocuments: jest.fn(async (filter: Filter) => [...docs.values()].filter((doc) => matches(doc, filter)).length),
    updateOne: jest.fn(async (filter: Filter, update: Filter) => {
      for (const doc of docs.values()) {
        if (matches(doc, filter)) {
          applySet(doc, update);
          return { modifiedCount: 1 };
        }
      }
      return { modifiedCount: 0 };
    }),
    updateMany: jest.fn(async (filter: Filter, update: Filter) => {
      let modified = 0;
      for (const doc of docs.values()) {
        if (matches(doc, filter)) {
          applySet(doc, update);
          modified += 1;
        }
      }
      return { modifiedCount: modified };
    }),
    __docs: docs,
  };

  return { MobileClientTokenModel: model };
});

jest.mock("../services/authSessionService", () => ({
  assertActiveAuthSession: jest.fn(),
  createAuthSession: jest.fn(),
  issueTrackedLoginToken: jest.fn(),
  revokeAuthCredential: jest.fn(),
  revokeAuthSessionsByClientTokenHashes: jest.fn(),
  touchAuthSession: jest.fn(),
  getAuthSessionMetadata: jest.fn(),
  getAuthSessionIpLocation: jest.fn(),
}));

jest.mock("../utils/userStorage", () => ({
  UserStorage: {
    getUserById: jest.fn(),
    updateUser: jest.fn(),
  },
}));

// 设备证明（P2）本层逻辑另有 mobileIntegrityService.test.ts 覆盖；
// 这里只关心"判定结果如何改变轮换节奏"，所以整层换成可编程的替身。
jest.mock("../services/mobileIntegrityService", () => ({
  verifyClientIntegrity: jest.fn(),
  shouldDowngradeForVerdict: jest.fn(),
  downgradedTtlMs: jest.fn(),
  logIntegrityVerdict: jest.fn(),
  issueIntegrityNonce: jest.fn(),
}));

// 风险分级（P3）的判定逻辑另有 mobileTokenRiskService.test.ts 覆盖；
// 这里同样只关心"命中信号以后轮换响应变成什么样"。
jest.mock("../services/mobileTokenRiskService", () => ({
  isRotationRiskEnabled: jest.fn(() => false),
  deviceFingerprintOf: jest.fn(
    (deviceId?: string, deviceName?: string) => (deviceId ? `fp-${deviceId}-${deviceName ?? ""}` : undefined),
  ),
  collectRotationRiskSignals: jest.fn(() => []),
  resolveRotationInterval: jest.fn((signals: string[], defaultIntervalMs: number) =>
    signals.length > 0 ? 60 * 60 * 1000 : defaultIntervalMs,
  ),
}));

import crypto from "node:crypto";
import { MobileTokenError, issueClientLoginToken, rotateClientLoginToken } from "../services/mobileLoginService";
import { MobileClientTokenModel } from "../models/mobileClientTokenModel";
import * as authSession from "../services/authSessionService";
import * as integrity from "../services/mobileIntegrityService";
import * as rotationRisk from "../services/mobileTokenRiskService";
import { UserStorage } from "../utils/userStorage";

const model = MobileClientTokenModel as unknown as { __docs: Map<string, FakeDoc> };
const USER_ID = "user-rotation";
const DEVICE_ID = "device-rotation";
const DAY_MS = 24 * 60 * 60 * 1000;

function hashOf(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function seed(overrides: Partial<FakeDoc> = {}): Promise<{ token: string; doc: FakeDoc }> {
  const token = `sml_${crypto.randomBytes(40).toString("base64url")}`;
  const tokenHash = overrides.tokenHash ?? hashOf(token);
  const now = Date.now();
  const doc: FakeDoc = {
    tokenHash,
    userId: USER_ID,
    deviceId: DEVICE_ID,
    deviceName: "Synapse Android",
    createdAt: now - 60 * 60 * 1000,
    expiresAt: now + 90 * DAY_MS,
    lineageId: overrides.lineageId ?? tokenHash,
    rotationIndex: 0,
    ...overrides,
  };
  await MobileClientTokenModel.create(doc as never);
  return { token, doc };
}

function asMock(value: unknown): jest.Mock {
  return value as jest.Mock;
}

beforeEach(() => {
  model.__docs.clear();
  asMock(authSession.assertActiveAuthSession).mockResolvedValue({ sessionId: "as_1" });
  asMock(authSession.createAuthSession).mockImplementation(async (input: unknown) => input);
  asMock(authSession.issueTrackedLoginToken).mockResolvedValue("jwt-value");
  asMock(authSession.revokeAuthCredential).mockResolvedValue(undefined);
  asMock(authSession.revokeAuthSessionsByClientTokenHashes).mockResolvedValue(undefined);
  asMock(authSession.touchAuthSession).mockResolvedValue(undefined);
  asMock(UserStorage.getUserById).mockResolvedValue({ id: USER_ID, username: "u", email: "u@e.com", role: "user" });
  asMock(UserStorage.updateUser).mockResolvedValue({ id: USER_ID, username: "u", email: "u@e.com", role: "user" });
  asMock(integrity.verifyClientIntegrity).mockResolvedValue({
    evaluated: false,
    trusted: false,
    level: "NONE",
    reasons: ["MODE_OFF"],
  });
  asMock(integrity.shouldDowngradeForVerdict).mockReturnValue(false);
  asMock(integrity.downgradedTtlMs).mockReturnValue(DAY_MS);
  asMock(integrity.logIntegrityVerdict).mockReturnValue(undefined);
  asMock(rotationRisk.isRotationRiskEnabled).mockReturnValue(false);
  asMock(rotationRisk.collectRotationRiskSignals).mockReturnValue([]);
  asMock(authSession.getAuthSessionIpLocation).mockResolvedValue(null);
});

describe("rotateClientLoginToken", () => {
  it("铸新一代、标记旧代，并把下一次轮换时间定在 24 小时后", async () => {
    const { token, doc } = await seed();

    const result = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID, ip: "203.0.113.9" });

    expect(result.rotationIndex).toBe(1);
    expect(result.clientLoginToken).toMatch(/^sml_/);
    expect(result.rotateIntervalMs).toBe(DAY_MS);
    expect(new Date(result.nextRotationAt).getTime() - new Date(result.rotatedAt).getTime()).toBe(DAY_MS);

    const next = model.__docs.get(hashOf(result.clientLoginToken));
    expect(next?.lineageId).toBe(doc.lineageId);
    expect(next?.rotationIndex).toBe(1);
    expect(next?.rotatedFrom).toBe(doc.tokenHash);
    expect(next?.deviceId).toBe(DEVICE_ID);

    const old = model.__docs.get(doc.tokenHash);
    expect(typeof old?.supersededAt).toBe("number");
    expect(old?.supersededTo).toBe(hashOf(result.clientLoginToken));
    expect(old?.revokedAt).toBeNull(); // 宽限期内旧代还能兜住在途请求
    expect(authSession.createAuthSession).toHaveBeenCalledTimes(1);
  });

  it("同一代没活满最小间隔就拒绝，并回 retryAfterSeconds", async () => {
    const { token } = await seed({ createdAt: Date.now() - 30 * 1000 });

    const error = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID }).catch((err) => err);

    expect(error).toBeInstanceOf(MobileTokenError);
    expect(asMock(MobileClientTokenModel.create).mock.calls.length).toBe(1); // 只有 seed 那一次
    expect((error as MobileTokenError).status).toBe(429);
    expect((error as MobileTokenError).errorCode).toBe("MOBILE_TOKEN_ROTATION_THROTTLED");
    expect((error as MobileTokenError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("旧令牌过了宽限期还在用：整条血缘吊销并返回 401", async () => {
    const { token, doc } = await seed({ supersededAt: Date.now() - 6 * 60 * 1000 });
    const lineageId = doc.lineageId!;
    const next = await seed({ lineageId, createdAt: Date.now() - 1000 });

    const error = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID }).catch((err) => err);

    expect((error as MobileTokenError).status).toBe(401);
    expect((error as MobileTokenError).errorCode).toBe("MOBILE_TOKEN_REUSED");
    expect(typeof model.__docs.get(doc.tokenHash)?.revokedAt).toBe("number");
    expect(typeof model.__docs.get(next.doc.tokenHash)?.revokedAt).toBe("number");
    // P4：触发复用的那一张要留下可查询的复用标记，供后台看板取数。
    expect(typeof model.__docs.get(doc.tokenHash)?.reusedAt).toBe("number");
    expect(model.__docs.get(doc.tokenHash)?.reusedIp).toBe("unknown");
    expect(model.__docs.get(next.doc.tokenHash)?.reusedAt).toBeUndefined();
    expect(authSession.revokeAuthSessionsByClientTokenHashes).toHaveBeenCalledWith(
      USER_ID,
      expect.arrayContaining([doc.tokenHash, next.doc.tokenHash]),
    );
  });

  it("宽限期内的旧令牌仍可轮换（不打断在途请求）", async () => {
    const { token, doc } = await seed({ supersededAt: Date.now() - 1000 });

    const result = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID });

    expect(result.rotationIndex).toBe(1);
    expect(model.__docs.get(doc.tokenHash)?.revokedAt).toBeNull();
  });

  it("deviceId 不匹配直接 403，不换票", async () => {
    const { token, doc } = await seed();

    const error = await rotateClientLoginToken({ clientLoginToken: token, deviceId: "another-device" }).catch((err) => err);

    expect((error as MobileTokenError).status).toBe(403);
    expect((error as MobileTokenError).errorCode).toBe("MOBILE_TOKEN_DEVICE_MISMATCH");
    expect(model.__docs.get(doc.tokenHash)?.supersededAt ?? null).toBeNull();
  });

  it("会话被撤销的令牌不能继续轮换", async () => {
    const { token } = await seed();
    asMock(authSession.assertActiveAuthSession).mockRejectedValue(new Error("会话不存在或已撤销"));

    const error = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID }).catch((err) => err);

    expect((error as MobileTokenError).status).toBe(401);
    expect((error as MobileTokenError).errorCode).toBe("MOBILE_SESSION_REVOKED");
  });

  it("24 小时内轮换次数超配额后拒绝", async () => {
    const { token, doc } = await seed();
    for (let index = 0; index < 8; index += 1) {
      await seed({ lineageId: doc.lineageId, createdAt: Date.now() - 1000 });
    }

    const error = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID }).catch((err) => err);

    expect((error as MobileTokenError).status).toBe(429);
    expect((error as MobileTokenError).errorCode).toBe("MOBILE_TOKEN_ROTATION_QUOTA");
  });
});

describe("设备证明判定与轮换节奏（P2）", () => {
  it("判定通过时不改变既有节奏，也不打降级标记", async () => {
    const { token } = await seed();

    const result = await rotateClientLoginToken({
      clientLoginToken: token,
      deviceId: DEVICE_ID,
      integrityToken: "integrity-token",
      integrityNonce: "nonce-value",
    });

    expect(result.requiresVerification).toBe(false);
    expect(result.rotateIntervalMs).toBe(DAY_MS);
    const next = model.__docs.get(hashOf(result.clientLoginToken));
    expect(next!.expiresAt - next!.createdAt).toBe(90 * DAY_MS);
    expect(integrity.verifyClientIntegrity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        deviceId: DEVICE_ID,
        integrityToken: "integrity-token",
        nonce: "nonce-value",
      }),
    );
  });

  it("判定不通过时只降级：新一代有效期缩短、下一次轮换提前到 1 小时，并标记 requiresVerification", async () => {
    const { token, doc } = await seed();
    asMock(integrity.shouldDowngradeForVerdict).mockReturnValue(true);
    asMock(integrity.downgradedTtlMs).mockReturnValue(DAY_MS);

    const result = await rotateClientLoginToken({
      clientLoginToken: token,
      deviceId: DEVICE_ID,
      integrityToken: "integrity-token",
      integrityNonce: "nonce-value",
    });

    expect(result.requiresVerification).toBe(true);
    expect(result.rotateIntervalMs).toBe(60 * 60 * 1000);
    expect(new Date(result.nextRotationAt).getTime() - new Date(result.rotatedAt).getTime()).toBe(60 * 60 * 1000);
    const next = model.__docs.get(hashOf(result.clientLoginToken));
    expect(next!.expiresAt - next!.createdAt).toBe(DAY_MS);
    // 降级不是拒绝：旧代仍然只打 superseded，不写 revokedAt。
    expect(model.__docs.get(doc.tokenHash)?.revokedAt).toBeNull();
    expect(authSession.createAuthSession).toHaveBeenCalledTimes(1);
  });

  it("降级判定发生在本地风控之后：被每日配额拦下的请求不会去花一次校验", async () => {
    const { token, doc } = await seed();
    for (let index = 0; index < 8; index += 1) {
      await seed({ lineageId: doc.lineageId, createdAt: Date.now() - 1000 });
    }

    const error = await rotateClientLoginToken({
      clientLoginToken: token,
      deviceId: DEVICE_ID,
      integrityToken: "integrity-token",
      integrityNonce: "nonce-value",
    }).catch((err) => err);

    expect((error as MobileTokenError).errorCode).toBe("MOBILE_TOKEN_ROTATION_QUOTA");
    expect(integrity.verifyClientIntegrity).not.toHaveBeenCalled();
  });
});

describe("签发时写下的风险字段（P3）", () => {
  const USER = { id: USER_ID, username: "u", email: "u@e.com", role: "user" };

  it("新设备首次登录：记下首见时间与设备指纹，判定没过就带上待验证标记", async () => {
    asMock(rotationRisk.isRotationRiskEnabled).mockReturnValue(true);
    asMock(integrity.verifyClientIntegrity).mockResolvedValue({
      evaluated: true,
      trusted: false,
      level: "NONE",
      reasons: ["APP_NOT_PLAY_RECOGNIZED"],
    });

    const result = await issueClientLoginToken({
      user: USER as never,
      deviceId: DEVICE_ID,
      deviceName: "Synapse Android",
    });

    const doc = model.__docs.get(hashOf(result.clientLoginToken));
    expect(doc?.rotationIndex).toBe(0);
    expect(doc?.lineageId).toBe(hashOf(result.clientLoginToken));
    expect(doc?.deviceFingerprint).toBe(`fp-${DEVICE_ID}-Synapse Android`);
    expect(doc?.deviceFirstSeenAt).toBeGreaterThan(Date.now() - 5000);
    expect(doc?.verificationPending).toBe(true);
  });

  it("已知设备的首见时间继承历史，不会被重新登录刷成新的", async () => {
    const seenAt = Date.now() - 3 * DAY_MS;
    await MobileClientTokenModel.create({
      tokenHash: "seen-before",
      userId: USER_ID,
      deviceId: DEVICE_ID,
      deviceName: "Synapse Android",
      createdAt: seenAt,
      expiresAt: seenAt + 90 * DAY_MS,
      deviceFingerprint: `fp-${DEVICE_ID}-Synapse Android`,
      deviceFirstSeenAt: seenAt,
      rotationIndex: 0,
      lineageId: "seen-before",
    } as never);
    asMock(rotationRisk.isRotationRiskEnabled).mockReturnValue(true);

    const result = await issueClientLoginToken({
      user: USER as never,
      deviceId: DEVICE_ID,
      deviceName: "Synapse Android",
    });

    expect(model.__docs.get(hashOf(result.clientLoginToken))?.deviceFirstSeenAt).toBe(seenAt);
  });

  it("本层没开时不打这次历史查询，首见时间就记现在", async () => {
    const seenAt = Date.now() - 3 * DAY_MS;
    await MobileClientTokenModel.create({
      tokenHash: "seen-before",
      userId: USER_ID,
      deviceId: DEVICE_ID,
      deviceName: "Synapse Android",
      createdAt: seenAt,
      expiresAt: seenAt + 90 * DAY_MS,
      deviceFingerprint: `fp-${DEVICE_ID}-Synapse Android`,
      deviceFirstSeenAt: seenAt,
      rotationIndex: 0,
      lineageId: "seen-before",
    } as never);
    const findOneCallsBefore = asMock(MobileClientTokenModel.findOne).mock.calls.length;

    const result = await issueClientLoginToken({
      user: USER as never,
      deviceId: DEVICE_ID,
      deviceName: "Synapse Android",
    });

    expect(asMock(MobileClientTokenModel.findOne).mock.calls.length).toBe(findOneCallsBefore);
    expect(model.__docs.get(hashOf(result.clientLoginToken))?.deviceFirstSeenAt).toBeGreaterThan(Date.now() - 5000);
  });
});

describe("风险分级轮换（P3）", () => {
  it("本层没开时不上报 escalated，也不去查上一代属地", async () => {
    const { token } = await seed();

    const result = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID, ip: "203.0.113.9" });

    expect(result.escalated).toBe(false);
    expect(result.rotateIntervalMs).toBe(DAY_MS);
    expect(rotationRisk.collectRotationRiskSignals).not.toHaveBeenCalled();
    expect(authSession.getAuthSessionIpLocation).not.toHaveBeenCalled();
  });

  it("命中信号时把下一次轮换提前到 1 小时，并回 escalated", async () => {
    const { token, doc } = await seed();
    asMock(rotationRisk.isRotationRiskEnabled).mockReturnValue(true);
    asMock(rotationRisk.collectRotationRiskSignals).mockReturnValue(["GEO_JUMP"]);
    asMock(authSession.getAuthSessionIpLocation).mockResolvedValue("中国, 北京, 北京 运营商: 中国联通");
    asMock(authSession.createAuthSession).mockImplementation(async (input: unknown) => ({
      ...(input as Record<string, unknown>),
      ipLocation: "日本, 东京, 东京 运营商: NTT",
    }));

    const result = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID, ip: "203.0.113.9" });

    expect(result.escalated).toBe(true);
    expect(result.requiresVerification).toBe(false); // 提级节奏不等于降级
    expect(result.rotateIntervalMs).toBe(60 * 60 * 1000);
    expect(new Date(result.nextRotationAt).getTime() - new Date(result.rotatedAt).getTime()).toBe(60 * 60 * 1000);
    const next = model.__docs.get(hashOf(result.clientLoginToken));
    expect(next!.expiresAt - next!.createdAt).toBe(90 * DAY_MS); // 单代有效期不受影响
    // 上一代的属地取自它自己的会话，这一代的属地取自刚建好的会话。
    expect(authSession.getAuthSessionIpLocation).toHaveBeenCalledWith(USER_ID, doc.tokenHash);
    expect(rotationRisk.collectRotationRiskSignals).toHaveBeenCalledWith(
      expect.objectContaining({
        previousIpLocation: "中国, 北京, 北京 运营商: 中国联通",
        currentIpLocation: "日本, 东京, 东京 运营商: NTT",
      }),
    );
    // 命中的信号记在旧代文档上备查。
    expect(model.__docs.get(doc.tokenHash)?.riskSignals).toEqual(["GEO_JUMP"]);
  });

  it("判定没过时把“待重新验证”写进新一代，判定通过则清掉", async () => {
    const { token } = await seed();
    asMock(rotationRisk.isRotationRiskEnabled).mockReturnValue(true);
    asMock(integrity.verifyClientIntegrity).mockResolvedValue({
      evaluated: true,
      trusted: false,
      level: "BASIC",
      reasons: ["DEVICE_INTEGRITY_TOO_LOW"],
    });

    const failed = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID });
    const failedDoc = model.__docs.get(hashOf(failed.clientLoginToken));
    expect(failedDoc?.verificationPending).toBe(true);

    await seed({ tokenHash: hashOf(failed.clientLoginToken), lineageId: failedDoc!.lineageId, createdAt: Date.now() - 10 * 60 * 1000 });
    asMock(integrity.verifyClientIntegrity).mockResolvedValue({
      evaluated: true,
      trusted: true,
      level: "DEVICE",
      reasons: [],
    });

    const passed = await rotateClientLoginToken({ clientLoginToken: failed.clientLoginToken, deviceId: DEVICE_ID });
    expect(model.__docs.get(hashOf(passed.clientLoginToken))?.verificationPending).toBe(false);
  });

  it("设备证明这一层没判定时，上一代的待验证标记继续往下传", async () => {
    const { token } = await seed({ verificationPending: true });
    asMock(rotationRisk.isRotationRiskEnabled).mockReturnValue(true);

    const result = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID });

    expect(model.__docs.get(hashOf(result.clientLoginToken))?.verificationPending).toBe(true);
  });

  it("新设备取到的是这台设备的历史首见时间，而不是本次", async () => {
    const { token, doc } = await seed({ createdAt: Date.now() - 60 * 60 * 1000 });
    const seenAt = Date.now() - 3 * DAY_MS;
    await MobileClientTokenModel.create({
      tokenHash: "earlier-hash",
      userId: USER_ID,
      deviceId: DEVICE_ID,
      deviceName: "Synapse Android",
      createdAt: seenAt,
      expiresAt: seenAt + 90 * DAY_MS,
      deviceFingerprint: `fp-${DEVICE_ID}-Synapse Android`,
      deviceFirstSeenAt: seenAt,
      rotationIndex: 0,
      lineageId: "earlier-lineage",
    } as never);
    asMock(rotationRisk.isRotationRiskEnabled).mockReturnValue(true);

    const result = await rotateClientLoginToken({ clientLoginToken: token, deviceId: DEVICE_ID });

    const next = model.__docs.get(hashOf(result.clientLoginToken));
    expect(next?.deviceFirstSeenAt).toBe(seenAt);
    expect(next?.deviceFingerprint).toBe(`fp-${DEVICE_ID}-Synapse Android`);
    expect(model.__docs.get(doc.tokenHash)?.deviceFingerprint ?? null).toBeNull();
  });
});
