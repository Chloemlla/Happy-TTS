/**
 * Auth domain — composition root.
 *
 * Factory function that wires the AuthService together with its concrete
 * adapters. This is the single place where the dependency graph is assembled;
 * all consumers import the singleton instance.
 *
 * Usage:
 *   import { createAuthService } from "../auth/composition";
 *   const auth = createAuthService();
 *   const user = await auth.authenticate(token);
 */

import { AuthService } from "./auth.service";
import { JwtTokenVerifier } from "./adapters/jwtTokenVerifier";
import { userStorageProvider } from "./adapters/userStorageProvider";
import { config } from "../config/config";

let instance: AuthService | null = null;

export function createAuthService(): AuthService {
  if (instance) return instance;

  const tokenVerifier = new JwtTokenVerifier({ secret: config.jwtSecret });

  instance = new AuthService(tokenVerifier, userStorageProvider, {
    jwtSecret: config.jwtSecret,
    tokenExpiresIn: config.jwtExpiresIn,
    bcryptSaltRounds: config.bcryptSaltRounds,
  });

  return instance;
}

/** Convenience singleton. */
export const authService = createAuthService();