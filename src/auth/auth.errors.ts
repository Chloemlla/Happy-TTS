/**
 * Auth domain — typed error definitions.
 *
 * Each error carries a numeric HTTP status code and a machine-readable error
 * code string, mirroring the pattern used by TtsRequestError in the TTS module.
 *
 * @see src/tts/tts.errors.ts  — reference pattern
 */

export type AuthErrorCode =
  | "TOKEN_MISSING"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_NO_USER_ID"
  | "USER_NOT_FOUND"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_DISABLED"
  | "FORBIDDEN"
  | "AUTH_FAILED"
  | "INTERNAL_ERROR";

export class AuthError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: AuthErrorCode;

  constructor(statusCode: number, errorCode: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }

  /** Convenience factory: 401 Unauthorized variants. */
  static unauthorized(code: AuthErrorCode, message: string): AuthError {
    return new AuthError(401, code, message);
  }

  /** Convenience factory: 403 Forbidden variants. */
  static forbidden(code: AuthErrorCode, message: string): AuthError {
    return new AuthError(403, code, message);
  }

  /** Convenience factory: 500 Internal variants. */
  static internal(message: string): AuthError {
    return new AuthError(500, "INTERNAL_ERROR", message);
  }

  /** Serialise to a standard API response body. */
  toJSON(): { error: string; code?: string } {
    const body: { error: string; code?: string } = { error: this.message };
    if (this.errorCode === "ACCOUNT_SUSPENDED") {
      body.code = this.errorCode;
    }
    return body;
  }
}