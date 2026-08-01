/**
 * Auth domain — JWT token verifier adapter.
 *
 * Concrete implementation of TokenVerifier using the jsonwebtoken library.
 * This is the only place in the codebase that directly depends on the JWT
 * library; all auth middleware uses the TokenVerifier port instead.
 */

import jwt from "jsonwebtoken";
import type { TokenPayload, TokenVerifier } from "../auth.ports";
import { AuthError } from "../auth.errors";

export interface JwtVerifierConfig {
  secret: string;
}

export class JwtTokenVerifier implements TokenVerifier {
  constructor(private readonly config: JwtVerifierConfig) {}

  async verify(token: string): Promise<TokenPayload> {
    try {
      const decoded = jwt.verify(token, this.config.secret) as TokenPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw AuthError.unauthorized("TOKEN_INVALID", "Token 无效或已过期");
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw AuthError.unauthorized("TOKEN_EXPIRED", "Token 已过期");
      }
      throw AuthError.unauthorized("AUTH_FAILED", "认证失败");
    }
  }
}