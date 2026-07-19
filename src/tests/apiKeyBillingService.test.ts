import type { Request, Response } from "express";
import { ApiKeyModel, type ApiKeyDoc } from "../models/apiKeyModel";
import { ApiKeyBillingEventModel, type ApiKeyBillingEventDoc } from "../models/apiKeyBillingModel";
import {
  adjustApiKeyBalance,
  finalizeApiKeyBilling,
  preauthorizeApiKeyBilling,
  setApiKeyBillingFaultInjectorForTests,
} from "../services/apiKeyBillingService";
import { mongoose } from "../services/mongoService";

function query<T>(value: T) {
  const result = {
    session: jest.fn(() => result),
    lean: jest.fn(() => Promise.resolve(value)),
  };
  return result;
}

function apiKey(overrides: Partial<ApiKeyDoc> = {}): ApiKeyDoc {
  return {
    keyId: "ak_test",
    keyHash: "hash",
    name: "test",
    userId: "user-1",
    permissions: ["tts"],
    rateLimit: 60,
    expiresAt: null,
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    enabled: true,
    billingEnabled: true,
    billingMode: "prepaid",
    balanceCredits: 10,
    totalChargedCredits: 0,
    totalBillableRequests: 0,
    lastBillingAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function request(requestId = "request-1"): Request {
  return {
    method: "POST",
    originalUrl: "/api/tts/generate?voice=test",
    baseUrl: "/api/tts",
    path: "/generate",
    requestId,
  } as Request;
}

function response(statusCode: number): Response {
  return { statusCode } as Response;
}

describe("apiKeyBillingService transactional consistency", () => {
  let key: ApiKeyDoc;
  let events: ApiKeyBillingEventDoc[];

  beforeEach(() => {
    key = apiKey();
    events = [];
    setApiKeyBillingFaultInjectorForTests(null);

    (mongoose.connection as any).db = {
      admin: () => ({ command: jest.fn().mockResolvedValue({ setName: "rs-test" }) }),
    };

    (mongoose.startSession as jest.Mock).mockImplementation(async () => ({
      withTransaction: async (callback: () => Promise<void>) => {
        const keySnapshot = { ...key };
        const eventSnapshots = events.map((event) => ({ ...event }));
        try {
          await callback();
        } catch (error) {
          Object.assign(key, keySnapshot);
          events.splice(0, events.length, ...eventSnapshots);
          throw error;
        }
      },
      endSession: jest.fn().mockResolvedValue(undefined),
    }));

    jest.spyOn(ApiKeyModel, "findOneAndUpdate").mockImplementation(((filter: any, update: any) => {
      if (filter.keyId !== key.keyId) return query(null) as any;
      if (filter.balanceCredits?.$gte !== undefined && key.balanceCredits < filter.balanceCredits.$gte) {
        return query(null) as any;
      }
      for (const [field, delta] of Object.entries(update.$inc || {})) {
        (key as any)[field] = Number((key as any)[field] || 0) + Number(delta);
      }
      Object.assign(key, update.$set || {});
      return query({ ...key }) as any;
    }) as any);

    jest.spyOn(ApiKeyBillingEventModel, "findOne").mockImplementation(((filter: any) => {
      const event = events.find(
        (candidate) =>
          (!filter.operationId || candidate.operationId === filter.operationId) &&
          (!filter.state || candidate.state === filter.state),
      );
      return query(event ? { ...event } : null) as any;
    }) as any);

    jest.spyOn(ApiKeyBillingEventModel, "create").mockImplementation((async (docs: any[]) => {
      const created = docs.map((doc) => ({
        ...doc,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as ApiKeyBillingEventDoc[];
      events.push(...created);
      return created as any;
    }) as any);

    jest.spyOn(ApiKeyBillingEventModel, "findOneAndUpdate").mockImplementation(((filter: any, update: any) => {
      const event = events.find(
        (candidate) => candidate.operationId === filter.operationId && candidate.state === filter.state,
      );
      if (!event) return query(null) as any;
      Object.assign(event, update.$set || {}, { updatedAt: new Date() });
      return query({ ...event }) as any;
    }) as any);
  });

  afterEach(() => {
    setApiKeyBillingFaultInjectorForTests(null);
  });

  it("rolls back the prepaid balance when reservation event creation fails", async () => {
    setApiKeyBillingFaultInjectorForTests((point) => {
      if (point === "preauthorize.afterEventWrite") throw new Error("injected reservation failure");
    });

    await expect(preauthorizeApiKeyBilling(key, "tts", request())).rejects.toThrow("injected reservation failure");
    expect(key.balanceCredits).toBe(10);
    expect(events).toHaveLength(0);
  });

  it("rolls back a failed refund, then refunds exactly once on retry", async () => {
    const context = await preauthorizeApiKeyBilling(key, "tts", request());
    expect(context).not.toBeNull();
    expect(key.balanceCredits).toBe(9);
    expect(events[0]).toMatchObject({ type: "reservation", state: "pending", balanceDelta: -1 });

    setApiKeyBillingFaultInjectorForTests((point) => {
      if (point === "finalize.afterBalanceUpdate") throw new Error("injected refund failure");
    });
    await expect(finalizeApiKeyBilling(context!, response(500))).rejects.toThrow("injected refund failure");
    expect(key.balanceCredits).toBe(9);
    expect(events[0]).toMatchObject({ type: "reservation", state: "pending" });

    setApiKeyBillingFaultInjectorForTests(null);
    await finalizeApiKeyBilling(context!, response(500));
    await finalizeApiKeyBilling(context!, response(500));

    expect(key.balanceCredits).toBe(10);
    expect(key.totalChargedCredits).toBe(0);
    expect(events[0]).toMatchObject({ type: "refund", state: "completed", balanceDelta: 1, costCredits: 0 });
  });

  it("rolls back a failed charge event transition, then charges exactly once", async () => {
    const context = await preauthorizeApiKeyBilling(key, "tts", request());

    setApiKeyBillingFaultInjectorForTests((point) => {
      if (point === "finalize.afterEventWrite") throw new Error("injected charge failure");
    });
    await expect(finalizeApiKeyBilling(context!, response(201))).rejects.toThrow("injected charge failure");
    expect(key.totalChargedCredits).toBe(0);
    expect(key.totalBillableRequests).toBe(0);
    expect(events[0]).toMatchObject({ type: "reservation", state: "pending" });

    setApiKeyBillingFaultInjectorForTests(null);
    await finalizeApiKeyBilling(context!, response(201));
    await finalizeApiKeyBilling(context!, response(201));

    expect(key.balanceCredits).toBe(9);
    expect(key.totalChargedCredits).toBe(1);
    expect(key.totalBillableRequests).toBe(1);
    expect(events[0]).toMatchObject({ type: "charge", state: "completed", costCredits: 1, balanceDelta: -1 });
  });

  it("rolls back an adjustment event failure and applies an idempotent retry once", async () => {
    setApiKeyBillingFaultInjectorForTests((point) => {
      if (point === "adjust.afterEventWrite") throw new Error("injected adjustment failure");
    });
    await expect(
      adjustApiKeyBalance({
        keyId: key.keyId,
        credits: 3,
        actorUserId: "admin-1",
        requestId: "adjustment-1",
      }),
    ).rejects.toThrow("injected adjustment failure");
    expect(key.balanceCredits).toBe(10);
    expect(events).toHaveLength(0);

    setApiKeyBillingFaultInjectorForTests(null);
    const options = {
      keyId: key.keyId,
      credits: 3,
      actorUserId: "admin-1",
      requestId: "adjustment-1",
    };
    await expect(adjustApiKeyBalance(options)).resolves.toEqual({ balanceCredits: 13 });
    await expect(adjustApiKeyBalance(options)).resolves.toEqual({ balanceCredits: 13 });

    expect(key.balanceCredits).toBe(13);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "adjustment", state: "completed", balanceDelta: 3 });
  });

  it("fails safely without writes on standalone MongoDB", async () => {
    (mongoose.connection as any).db = {
      admin: () => ({ command: jest.fn().mockResolvedValue({ ok: 1 }) }),
    };

    await expect(preauthorizeApiKeyBilling(key, "tts", request())).rejects.toMatchObject({
      statusCode: 503,
      code: "BILLING_TRANSACTIONS_REQUIRED",
    });
    expect(key.balanceCredits).toBe(10);
    expect(events).toHaveLength(0);
    expect(ApiKeyModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
