import type { Store } from "express-rate-limit";
import { createSharedRateLimitStore, SharedRateLimitUnavailableError } from "./sharedRateLimitStore";

const API_KEY_WINDOW_MS = 60_000;

export interface ApiKeyRateLimitResult {
  allowed: boolean;
  totalHits: number;
  limit: number;
  resetTime: Date;
}

export class ApiKeyRateLimiter {
  constructor(
    private readonly store: Store = createSharedRateLimitStore("api-key", API_KEY_WINDOW_MS, {
      requireSharedBackend: true,
      allowMongoFallbackAfterRedisError: false,
    }),
  ) {}

  async consume(keyId: string, dynamicLimit: number): Promise<ApiKeyRateLimitResult> {
    const limit = Number.isFinite(dynamicLimit) ? Math.max(0, dynamicLimit) : 0;
    const result = await this.store.increment(keyId);
    return {
      allowed: result.totalHits <= limit,
      totalHits: result.totalHits,
      limit,
      resetTime: result.resetTime || new Date(Date.now() + API_KEY_WINDOW_MS),
    };
  }
}

export { SharedRateLimitUnavailableError };
export const apiKeyRateLimiter = new ApiKeyRateLimiter();
