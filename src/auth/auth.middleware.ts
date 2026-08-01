/**
 * Auth domain — Express middleware adapters.
 *
 * Thin adapters that bridge the AuthService (pure domain logic) to the
 * Express middleware layer. Each middleware function:
 * 1. Extracts the token from the request (via the injected extractor)
 * 2. Delegates to AuthService.authenticate()
 * 3. Attaches the resolved user to the request object
 * 4. Calls next() or returns an error response
 *
 * These are the **new** middleware that should gradually replace the
 * legacy middleware in src/middleware/authenticateToken.ts, auth.ts, and
 * authMiddleware.ts.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthService } from "./auth.service";
import type { TokenExtractor } from "./auth.ports";
import { AuthError } from "./auth.errors";

/**
 * Create an Express middleware that authenticates requests via a bearer token.
 *
 * @param authService — the injected AuthService instance
 * @param extractor   — strategy for extracting the token from the request
 * @param options.authCacheBypass — paths that should always reach the handler
 *        (authentication is still performed but failure is non-fatal)
 */
export function createAuthenticateToken(
  authService: AuthService,
  extractor: TokenExtractor,
  options?: { authCacheBypass?: string[] },
): RequestHandler {
  const bypassPaths = new Set(options?.authCacheBypass ?? []);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // If the request is already authenticated via API key or OAuth, skip JWT.
      const authedReq = req as Request & { user?: unknown; apiKey?: unknown; oauthToken?: unknown };
      if ((authedReq.apiKey || authedReq.oauthToken) && authedReq.user) {
        return next();
      }

      const token = extractor.extract(req);
      if (!token) {
        if (bypassPaths.has(req.path)) {
          return next();
        }
        return res.status(401).json({ error: "未授权" });
      }

      const user = await authService.authenticate(token);
      authedReq.user = user;
      (authedReq as any).auth = { kind: "session", user };
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json(error.toJSON());
      }
      return res.status(401).json({ error: "认证失败" });
    }
  };
}

/**
 * Create an Express middleware that requires the authenticated user to be
 * an administrator.
 */
export function createRequireAdmin(authService: AuthService): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: "未认证" });
      }

      authService.requireAdmin(user);
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(error.statusCode).json(error.toJSON());
      }
      return res.status(500).json({ error: "管理员权限校验失败" });
    }
  };
}