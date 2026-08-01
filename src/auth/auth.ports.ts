/**
 * Auth domain — port definitions.
 *
 * Following the TTS module pattern (tts.ports.ts), these interfaces define the
 * boundaries between authentication logic and its dependencies. Concrete
 * implementations live in the middleware layer and are injected into the
 * AuthService at composition root.
 *
 * @see src/tts/tts.ports.ts  — reference pattern
 */

/** Canonical authenticated user shape consumed by auth middleware. */
export interface AuthUser {
  id: string;
  username: string;
  role: string;
  accountStatus?: string;
  disabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Payload carried inside a signed JWT. */
export interface TokenPayload {
  userId: string;
  [key: string]: unknown;
}

// ── Ports ──────────────────────────────────────────────────────────────────

/** Extracts the principal identity from a signed token string. */
export interface TokenVerifier {
  verify(token: string): Promise<TokenPayload>;
}

/** Looks up a user record by internal ID. */
export interface UserProvider {
  getUserById(userId: string): Promise<AuthUser | null>;
}

/** Extracts a raw token string from the incoming HTTP request. */
export interface TokenExtractor {
  extract(req: unknown): string | null;
}

/** Compares a plaintext secret against a stored hash. */
export interface PasswordVerifier {
  compare(plaintext: string, hash: string): Promise<boolean>;
}

// ── Service-level configuration ────────────────────────────────────────────

export interface AuthServiceConfig {
  jwtSecret: string;
  tokenExpiresIn: string;
  bcryptSaltRounds: number;
}

// ── Status flags exposed by the service ─────────────────────────────────────

export interface AuthServiceStatus {
  ready: boolean;
  tokenVerifierReady: boolean;
  userProviderReady: boolean;
}