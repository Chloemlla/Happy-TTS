/**
 * Auth domain — public API.
 *
 * Re-exports the domain's public surface: ports, errors, service, and
 * middleware adapters. External consumers should import from this index
 * rather than reaching into individual files.
 *
 * @example
 *   import { AuthService, AuthError, createAuthenticateToken } from "../auth";
 */
export { AuthService } from "./auth.service";
export { AuthError } from "./auth.errors";
export { createAuthenticateToken, createRequireAdmin } from "./auth.middleware";
export type {
  AuthUser,
  AuthServiceConfig,
  AuthServiceStatus,
  TokenPayload,
  TokenVerifier,
  UserProvider,
  TokenExtractor,
  PasswordVerifier,
} from "./auth.ports";