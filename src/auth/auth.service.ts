/**
 * Auth domain — core authentication service.
 *
 * Encapsulates the authentication and authorisation logic that was previously
 * duplicated across authenticateToken.ts, auth.ts, and authMiddleware.ts.
 *
 * The service is dependency-injected at construction time so it can be
 * unit-tested without Express or JWT mocks.
 *
 * @see src/tts/tts.service.ts  — reference pattern
 */

import type { AuthUser, AuthServiceConfig, AuthServiceStatus, TokenVerifier, UserProvider } from "./auth.ports";
import { AuthError } from "./auth.errors";

export class AuthService {
  constructor(
    private readonly tokenVerifier: TokenVerifier,
    private readonly userProvider: UserProvider,
    private readonly config: AuthServiceConfig,
  ) {}

  /**
   * Authenticate a bearer token and return the resolved user.
   *
   * This is the core authentication flow used by every auth middleware:
   * 1. Verify the JWT signature and extract the userId
   * 2. Load the user record from the database
   * 3. Check account status (suspended / disabled)
   * 4. Return the user for downstream authorisation checks
   *
   * @throws AuthError with appropriate statusCode and errorCode
   */
  async authenticate(token: string): Promise<AuthUser> {
    let payload;
    try {
      payload = await this.tokenVerifier.verify(token);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw AuthError.unauthorized("TOKEN_INVALID", "Token 无效或已过期");
    }

    if (!payload.userId) {
      throw AuthError.unauthorized("TOKEN_NO_USER_ID", "Token 无 userId");
    }

    const user = await this.userProvider.getUserById(payload.userId);
    if (!user) {
      throw AuthError.unauthorized("USER_NOT_FOUND", "用户不存在");
    }

    this.checkAccountStatus(user);

    return user;
  }

  /**
   * Verify that the authenticated user has an allowed account status.
   *
   * @throws AuthError when the account is suspended or disabled
   */
  checkAccountStatus(user: AuthUser): void {
    if (user.accountStatus === "suspended") {
      throw AuthError.forbidden(
        "ACCOUNT_SUSPENDED",
        "账户已被封停",
      );
    }

    if (user.disabled) {
      throw AuthError.forbidden("ACCOUNT_DISABLED", "账户已被禁用");
    }
  }

  /**
   * Verify that the user holds the admin role.
   *
   * @throws AuthError when the user is not an admin
   */
  requireAdmin(user: AuthUser): void {
    if (user.role !== "admin") {
      throw AuthError.forbidden("FORBIDDEN", "权限不足，仅限管理员访问");
    }
  }

  /**
   * Check whether the user is an admin (no throw).
   */
  isAdmin(user: AuthUser): boolean {
    return user.role === "admin";
  }

  /**
   * Report service readiness (for health checks / diagnostics).
   */
  getStatus(): AuthServiceStatus {
    return {
      ready: true,
      tokenVerifierReady: true,
      userProviderReady: true,
    };
  }
}