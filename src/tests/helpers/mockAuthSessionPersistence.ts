/**
 * auth_sessions 的持久化替身（方法论 §五-62 之后的存量欠账 T-03/T-04/T-05）。
 *
 * 为什么需要它：G2-05 / G2-08 之后，`authenticateToken`、`authMiddlewareV2`、
 * `wsAuthentication.resolveWebSocketIdentity` 与登录流程都无条件读写 auth_sessions：
 *   登录  → issueTrackedLoginToken → createAuthSession → AuthSessionModel.create
 *   带令请求 → assertActiveAuthSession + touchAuthSession → AuthSessionModel.findOne
 * 而 `import app from "../app"` 这类整 app 套件、以及直接 init wsService 的套件都没有
 * MongoDB，真实现会在 mongoose 驱动缓冲 10s 后抛错：
 *   - 登录被控制器的外层 catch 成 500（totp-login 的「完整流程」实测耗时 11019 ms，
 *     日志里同一秒跟着 `audit_logs.insertMany() buffering timed out after 10000ms`）；
 *   - 带令请求变 401「会话不存在或已撤销」（totp-authentication-fix 两条）；
 *   - WS 的身份解析根本不会返回，客户端 3s 超时报 "Timed out waiting for /ws pong"
 *     （wsUpgradeRouting 三条）。
 * 这些套件的职责都不是会话撤销语义，所以把持久层换成本替身；真要验撤销链的是
 * authSessionService.test.ts / authenticateToken.integration.test.ts，它们各自接管。
 *
 * 用哪个接缝：只替换 authSessionService 这一层，**不**去 mock 中间件。中间件、控制器、
 * 口令校验与 JWT 校验全部照常执行，被拿掉的只有数据库。issueTrackedLoginToken 仍走
 * 真的 signLoginToken，所以签出来的令牌与线上一致、可被后续请求正常验签。
 *
 * 单独成文而不进 mockAppSecurityBoundaries：那 7 个套件里 commandRoutes /
 * libreChatRoutes 已各自 jest.mock 同一模块，共享替身的注册时刻会盖过它们的局部替身。
 */

const mockSessionDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: "mock-auth-session",
  sessionId: "as_mock_session",
  userId: "1",
  credentialHash: "mock-credential-hash",
  credentialType: "jwt",
  authKind: "jwt",
  deviceKey: "a".repeat(40),
  deviceId: "",
  deviceName: "jest",
  platform: "unknown",
  clientType: "web",
  ipAddress: "127.0.0.1",
  ipLocation: "未知",
  userAgent: "jest",
  oauthClientId: null,
  oauthTokenId: null,
  oauthGrantId: null,
  clientTokenHash: null,
  createdAt: new Date(),
  lastActivityAt: new Date(),
  revokedAt: null,
  updatedAt: new Date(),
  ...overrides,
});

jest.mock("../../services/authSessionService", () => {
  const actual = jest.requireActual("../../services/authSessionService");
  const { signLoginToken } = jest.requireActual("../../utils/authToken");
  return {
    ...actual,
    createAuthSession: jest.fn(async (input: any) =>
      mockSessionDoc({
        userId: input?.userId,
        credentialHash: typeof actual.hashAuthCredential === "function" && input?.credential
          ? actual.hashAuthCredential(input.credential)
          : "mock-credential-hash",
      }),
    ),
    // 登录必须拿到一个真签名的 JWT，否则后续带令请求会在 jwt.verify 就挂掉。
    issueTrackedLoginToken: jest.fn(async (user: any) => signLoginToken(user)),
    revokeAuthCredential: jest.fn(async () => undefined),
    revokeAllAuthSessions: jest.fn(async () => ({ revoked: 0 })),
    revokeAuthSessionsByOauthTokenIds: jest.fn(async () => undefined),
    revokeAuthSessionsByClientTokenHashes: jest.fn(async () => undefined),
    revokeAuthDevice: jest.fn(async () => ({ revoked: 0 })),
    assertActiveAuthSession: jest.fn(async (userId: string) => mockSessionDoc({ userId })),
    touchAuthSession: jest.fn(async () => undefined),
    listAuthDevices: jest.fn(async () => []),
  };
});

export { mockSessionDoc };
