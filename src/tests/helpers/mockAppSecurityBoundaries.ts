import type { NextFunction, Request, RequestHandler, Response } from "express";

const mockPassThrough = (_req: Request, _res: Response, next: NextFunction): void => next();
const mockMiddlewareGroup = new Proxy(mockPassThrough, {
  get: () => mockPassThrough,
});

/**
 * 每个 limiter 必须拥有**自己的函数身份**。
 *
 * 原先这里对所有 `*Limiter` 导出都返回同一个 mockPassThrough。而
 * src/routes/routeModules/knownMiddleware.ts 的 knownMountLimiters 是 `Map<函数引用, 名字>`，
 * 身份全同 ⇒ 40 条注册塌成同一个键、只剩最后插入的那个名字赢，于是治理校验把任意
 * limiter 都读成 "ttsLimiter"，同一次校验里两条自相矛盾的消息一起出现：
 *   middleware-consistency-violation: has rate limiter "ttsLimiter" ... not declared in rateLimitPolicy.limiters
 *   rate-limit-not-found: declares rateLimitPolicy.mode="mount" with limiter "adminLimiter" but it is not found ...
 * assertRouteGovernance() 是 throw 的 ⇒ 十几个路由套件在 import 阶段整组阵亡。
 * 替身要保持的正是「可区分」：按名字缓存，一个名字一个函数。
 */
const mockLimiterStubs = new Map<string, RequestHandler>();

function mockLimiterStub(name: string): RequestHandler {
  let handler = mockLimiterStubs.get(name);
  if (!handler) {
    handler = (_req: Request, _res: Response, next: NextFunction): void => next();
    Object.defineProperty(handler, "name", { value: name });
    mockLimiterStubs.set(name, handler);
  }
  return handler;
}

// express-rate-limit 的 default/rateLimit 每次调用都给新身份：真实代码里一个 limiter
// 一次调用，身份若再共用，上面的 Map 会重蹈覆辙。
let mockRateLimitCalls = 0;
function mockFreshLimiter(): RequestHandler {
  mockRateLimitCalls += 1;
  return mockLimiterStub(`rateLimit#${mockRateLimitCalls}`);
}

jest.mock("../../middleware/ipCheck", () => ({
  ipCheckMiddleware: mockPassThrough,
}));

jest.mock("../../middleware/tamperProtection", () => ({
  tamperProtectionMiddleware: mockPassThrough,
}));

jest.mock("../../middleware/routeLimiters", () =>
  new Proxy(
    {
      __esModule: true,
      createLimiter: (opts?: { name?: string }) => mockLimiterStub(opts?.name || "createdLimiter"),
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
        return typeof property === "string" && property.endsWith("Limiter")
          ? mockLimiterStub(property)
          : undefined;
      },
    },
  ),
);

jest.mock("../../middleware/rateLimiter", () =>
  new Proxy(
    {
      __esModule: true,
      createLimiter: (opts?: { name?: string }) => mockLimiterStub(opts?.name || "createdLimiter"),
      resourceLimiter: mockMiddlewareGroup,
    },
    {
      get(target, property, receiver) {
        if (Reflect.has(target, property)) {
          return Reflect.get(target, property, receiver);
        }
        return typeof property === "string" && property.endsWith("Limiter")
          ? mockLimiterStub(property)
          : undefined;
      },
    },
  ),
);

jest.mock("express-rate-limit", () => ({
  __esModule: true,
  default: () => mockFreshLimiter(),
  rateLimit: () => mockFreshLimiter(),
}));
