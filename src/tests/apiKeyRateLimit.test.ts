import type { IncrementResponse, Store } from "express-rate-limit";
import { ApiKeyRateLimiter } from "../services/apiKeyRateLimitService";
import {
  BoundedMemoryRateLimitStore,
  MongoRateLimitStore,
  ResilientRateLimitStore,
  SharedRateLimitUnavailableError,
} from "../services/sharedRateLimitStore";

class AtomicTestStore implements Store {
  readonly localKeys = false;
  readonly prefix = "test";
  private hits = 0;
  private readonly resetTime = new Date(Date.now() + 60_000);

  async increment(): Promise<IncrementResponse> {
    this.hits += 1;
    return { totalHits: this.hits, resetTime: this.resetTime };
  }

  async decrement(): Promise<void> {
    this.hits = Math.max(0, this.hits - 1);
  }

  async resetKey(): Promise<void> {
    this.hits = 0;
  }

  async resetAll(): Promise<void> {
    this.hits = 0;
  }
}

const failingStore = (message: string): Store => ({
  localKeys: false,
  prefix: "failing",
  increment: jest.fn().mockRejectedValue(new Error(message)),
  decrement: jest.fn().mockRejectedValue(new Error(message)),
  resetKey: jest.fn().mockRejectedValue(new Error(message)),
  resetAll: jest.fn().mockRejectedValue(new Error(message)),
});

describe("API key shared rate limiting", () => {
  beforeEach(() => BoundedMemoryRateLimitStore.resetForTests());

  it("preserves each API key's dynamic limit under concurrent requests", async () => {
    const limiter = new ApiKeyRateLimiter(new AtomicTestStore());
    const results = await Promise.all(Array.from({ length: 100 }, () => limiter.consume("ak_shared", 25)));

    expect(results.filter((result) => result.allowed)).toHaveLength(25);
    expect(results.at(-1)).toMatchObject({ allowed: false, totalHits: 100, limit: 25 });
  });

  it("shares a process fallback counter between store instances", async () => {
    const first = new BoundedMemoryRateLimitStore("api-key-test", 60_000, 100);
    const second = new BoundedMemoryRateLimitStore("api-key-test", 60_000, 100);

    await first.increment("ak_same");
    const result = await second.increment("ak_same");

    expect(result.totalHits).toBe(2);
  });

  it("bounds key churn and recycles expired entries", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000);
    const store = new BoundedMemoryRateLimitStore("churn", 100, 2);

    await store.increment("one");
    await store.increment("two");
    await store.increment("three");
    expect(BoundedMemoryRateLimitStore.sizeForTests()).toBe(2);

    now.mockReturnValue(1_101);
    expect(BoundedMemoryRateLimitStore.sweepExpired()).toBe(2);
    expect(BoundedMemoryRateLimitStore.sizeForTests()).toBe(0);
  });

  it("uses MongoDB as the shared store when Redis is not configured", async () => {
    const mongo = new AtomicTestStore();
    const local = new AtomicTestStore();
    const store = new ResilientRateLimitStore("api-key-test", null, mongo, local, true, false);

    const result = await store.increment("ak_mongo");

    expect(result.totalHits).toBe(1);
    expect((local as any).hits).toBe(0);
  });

  it("fails closed instead of resetting the window after a configured Redis store fails", async () => {
    const store = new ResilientRateLimitStore(
      "api-key-test",
      failingStore("redis down"),
      new AtomicTestStore(),
      new AtomicTestStore(),
      true,
      false,
    );

    await expect(store.increment("ak_strict")).rejects.toBeInstanceOf(SharedRateLimitUnavailableError);
  });

  it("allows ordinary route limiters to degrade to bounded local memory", async () => {
    const memory = new AtomicTestStore();
    const store = new ResilientRateLimitStore(
      "route-test",
      failingStore("redis down"),
      failingStore("mongo down"),
      memory,
      false,
      true,
    );

    const result = await store.increment("client");

    expect(result.totalHits).toBe(1);
  });

  it("uses one atomic MongoDB upsert pipeline per increment", async () => {
    const resetTime = new Date(Date.now() + 60_000);
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue({ totalHits: 7, resetTime }),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
    };
    const store = new MongoRateLimitStore("api-key-test", 60_000, model as any, () => true);

    const result = await store.increment("ak_atomic");

    expect(result).toEqual({ totalHits: 7, resetTime });
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "api-key-test:ak_atomic" },
      expect.any(Array),
      expect.objectContaining({ upsert: true, new: true }),
    );
  });
});
