import type { NextFunction, Request, Response } from "express";

const mockPassThrough = (_req: Request, _res: Response, next: NextFunction): void => next();
const mockMiddlewareGroup = new Proxy(mockPassThrough, {
  get: () => mockPassThrough,
});

jest.mock("../../middleware/ipCheck", () => ({
  ipCheckMiddleware: mockPassThrough,
}));

jest.mock("../../middleware/tamperProtection", () => ({
  tamperProtectionMiddleware: mockPassThrough,
}));

jest.mock("../../middleware/rateLimit", () => ({
  rateLimitMiddleware: mockPassThrough,
}));

jest.mock("../../middleware/routeLimiters", () =>
  new Proxy(
    {
      __esModule: true,
      createLimiter: () => mockPassThrough,
      getRateLimitMetricsSnapshot: () => ({
        total429Hits: 0,
        byLimiter: {},
        byCategory: {},
        hotIps: [],
        hotRoutes: [],
      }),
    },
    {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) {
          return Reflect.get(target, property, receiver);
        }
        return typeof property === "string" && property.endsWith("Limiter") ? mockPassThrough : undefined;
      },
    },
  ),
);

jest.mock("../../middleware/rateLimiter", () =>
  new Proxy(
    {
      __esModule: true,
      createLimiter: () => mockPassThrough,
      resourceLimiter: mockMiddlewareGroup,
      passkeyLimiter: mockMiddlewareGroup,
      totpLimiter: mockMiddlewareGroup,
      apiLimiter: mockMiddlewareGroup,
    },
    {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) {
          return Reflect.get(target, property, receiver);
        }
        return typeof property === "string" && property.endsWith("Limiter") ? mockMiddlewareGroup : undefined;
      },
    },
  ),
);

jest.mock("../../services/rateLimiter", () => ({
  rateLimiter: {
    isRateLimited: () => false,
    recordRequest: () => undefined,
    reset: () => undefined,
  },
  RateLimiter: class {
    isRateLimited(): boolean {
      return false;
    }

    recordRequest(): void {}

    reset(): void {}
  },
}));

jest.mock("express-rate-limit", () => ({
  __esModule: true,
  default: () => mockPassThrough,
  rateLimit: () => mockPassThrough,
}));
