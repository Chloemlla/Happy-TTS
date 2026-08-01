/**
 * Auth domain — token extractor adapters.
 *
 * Concrete implementations of TokenExtractor that extract a JWT token
 * from different parts of an HTTP request (Authorization header, cookie).
 */

import type { Request } from "express";
import type { TokenExtractor } from "../auth.ports";

/**
 * Extract token from the Authorization: Bearer <token> header.
 */
class BearerTokenExtractor implements TokenExtractor {
  extract(req: unknown): string | null {
    const request = req as Request;
    const authHeader = request.headers?.authorization || "";
    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token) return null;
    return token;
  }
}

/**
 * Extract token from cookies using the synapse_token cookie name.
 */
class CookieTokenExtractor implements TokenExtractor {
  extract(req: unknown): string | null {
    const request = req as Request;
    return request.cookies?.synapse_token || null;
  }
}

/**
 * Composite extractor that tries multiple strategies in order.
 */
class CompositeTokenExtractor implements TokenExtractor {
  constructor(private readonly extractors: TokenExtractor[]) {}

  extract(req: unknown): string | null {
    for (const extractor of this.extractors) {
      const token = extractor.extract(req);
      if (token) return token;
    }
    return null;
  }
}

/** Singleton: try Bearer header first, then cookie. */
export const defaultTokenExtractor: TokenExtractor = new CompositeTokenExtractor([
  new BearerTokenExtractor(),
  new CookieTokenExtractor(),
]);

/** Bearer-only extractor. */
export const bearerTokenExtractor: TokenExtractor = new BearerTokenExtractor();