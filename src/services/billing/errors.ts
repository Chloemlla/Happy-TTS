/**
 * Custom error classes for the GitHub Billing Service
 * Provides structured error handling with appropriate error codes and context
 */

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Circuit breaker state type
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Base error class for all billing service errors
 */
export class BillingServiceError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "BillingServiceError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts the error to a JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

/**
 * Error class for API-related errors
 */
export class BillingApiError extends BillingServiceError {
  public readonly statusCode?: number;
  public readonly requestId?: string;

  constructor(message: string, statusCode?: number, requestId?: string, context?: Record<string, unknown>) {
    super(message, "API_ERROR", { ...context, statusCode, requestId });
    this.name = "BillingApiError";
    this.statusCode = statusCode;
    this.requestId = requestId;
  }

  /**
   * Creates a BillingApiError from an HTTP response
   */
  static fromResponse(
    statusCode: number,
    statusText: string,
    requestId?: string,
    context?: Record<string, unknown>,
  ): BillingApiError {
    const message = `GitHub API returned error: ${statusCode} - ${statusText}`;
    return new BillingApiError(message, statusCode, requestId, context);
  }

  /**
   * Creates a BillingApiError for timeout scenarios
   */
  static timeout(timeoutMs: number, requestId?: string): BillingApiError {
    return new BillingApiError(`Request timed out after ${timeoutMs}ms`, undefined, requestId, { timeoutMs });
  }

  /**
   * Creates a BillingApiError for network errors
   */
  static networkError(originalError: Error, requestId?: string): BillingApiError {
    return new BillingApiError(`Network error: ${originalError.message}`, undefined, requestId, {
      originalError: originalError.message,
    });
  }
}

/**
 * Error class for cache-related errors
 */
export class CacheError extends BillingServiceError {
  public readonly operation: "get" | "set" | "delete" | "warmup" | "cleanup";

  constructor(
    message: string,
    operation: "get" | "set" | "delete" | "warmup" | "cleanup",
    context?: Record<string, unknown>,
  ) {
    super(message, "CACHE_ERROR", { ...context, operation });
    this.name = "CacheError";
    this.operation = operation;
  }

  /**
   * Creates a CacheError for cache miss scenarios
   */
  static miss(customerId: string): CacheError {
    return new CacheError(`Cache miss for customer: ${customerId}`, "get", { customerId });
  }

  /**
   * Creates a CacheError for cache write failures
   */
  static writeFailed(customerId: string, originalError: Error): CacheError {
    return new CacheError(`Failed to write cache for customer: ${customerId}`, "set", {
      customerId,
      originalError: originalError.message,
    });
  }

  /**
   * Creates a CacheError for warmup failures
   */
  static warmupFailed(customerId: string, originalError: Error): CacheError {
    return new CacheError(`Cache warmup failed for customer: ${customerId}`, "warmup", {
      customerId,
      originalError: originalError.message,
    });
  }
}

/**
 * Error class for configuration-related errors
 */
export class ConfigError extends BillingServiceError {
  public readonly configKey?: string;
  public readonly validationErrors?: ValidationError[];

  constructor(
    message: string,
    configKey?: string,
    validationErrors?: ValidationError[],
    context?: Record<string, unknown>,
  ) {
    super(message, "CONFIG_ERROR", { ...context, configKey, validationErrors });
    this.name = "ConfigError";
    this.configKey = configKey;
    this.validationErrors = validationErrors;
  }

  /**
   * Creates a ConfigError for missing configuration
   */
  static notFound(configKey: string): ConfigError {
    return new ConfigError(`Configuration not found: ${configKey}`, configKey);
  }

  /**
   * Creates a ConfigError for invalid configuration
   */
  static invalid(configKey: string, validationErrors: ValidationError[]): ConfigError {
    const errorMessages = validationErrors.map((e) => `${e.field}: ${e.message}`).join(", ");
    return new ConfigError(`Invalid configuration for ${configKey}: ${errorMessages}`, configKey, validationErrors);
  }

  /**
   * Creates a ConfigError for curl parsing failures
   */
  static parseFailed(message: string, curlCommand?: string): ConfigError {
    return new ConfigError(`Failed to parse curl command: ${message}`, undefined, undefined, {
      curlCommandLength: curlCommand?.length,
    });
  }

  /**
   * Creates a ConfigError for URL validation failures
   */
  static invalidUrl(url: string, reason: string): ConfigError {
    return new ConfigError(`Invalid URL: ${reason}`, undefined, [{ field: "url", message: reason, value: url }]);
  }
}

/**
 * Error class for circuit breaker errors
 */
export class CircuitBreakerError extends BillingServiceError {
  public readonly state: CircuitState;

  constructor(message: string, state: CircuitState, context?: Record<string, unknown>) {
    super(message, "CIRCUIT_BREAKER_ERROR", { ...context, state });
    this.name = "CircuitBreakerError";
    this.state = state;
  }

  /**
   * Creates a CircuitBreakerError for open circuit
   */
  static circuitOpen(resetTimeMs: number): CircuitBreakerError {
    return new CircuitBreakerError(`Circuit breaker is open. Will reset in ${resetTimeMs}ms`, "open", { resetTimeMs });
  }

  /**
   * Creates a CircuitBreakerError for half-open circuit failure
   */
  static halfOpenFailed(): CircuitBreakerError {
    return new CircuitBreakerError("Circuit breaker test request failed, returning to open state", "half-open");
  }
}

/**
 * Error class for rate limiting errors
 */
export class RateLimitError extends BillingServiceError {
  public readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, context?: Record<string, unknown>) {
    super(message, "RATE_LIMIT_ERROR", { ...context, retryAfterMs });
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }

  /**
   * Creates a RateLimitError for local rate limiting
   */
  static localLimitExceeded(retryAfterMs: number): RateLimitError {
    return new RateLimitError(`Rate limit exceeded. Retry after ${retryAfterMs}ms`, retryAfterMs);
  }

  /**
   * Creates a RateLimitError from GitHub API rate limit response
   */
  static fromGitHubResponse(retryAfterHeader?: string): RateLimitError {
    const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : 60000;
    return new RateLimitError("GitHub API rate limit exceeded", retryAfterMs, { source: "github" });
  }
}

/**
 * Type guard to check if an error is a BillingServiceError
 */
export function isBillingServiceError(error: unknown): error is BillingServiceError {
  return error instanceof BillingServiceError;
}

/**
 * Type guard to check if an error is a BillingApiError
 */
export function isBillingApiError(error: unknown): error is BillingApiError {
  return error instanceof BillingApiError;
}

/**
 * Type guard to check if an error is a CacheError
 */
export function isCacheError(error: unknown): error is CacheError {
  return error instanceof CacheError;
}

/**
 * Type guard to check if an error is a ConfigError
 */
export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof ConfigError;
}

/**
 * Type guard to check if an error is a CircuitBreakerError
 */
export function isCircuitBreakerError(error: unknown): error is CircuitBreakerError {
  return error instanceof CircuitBreakerError;
}

/**
 * Type guard to check if an error is a RateLimitError
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
