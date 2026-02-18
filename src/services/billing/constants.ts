/**
 * Constants for the GitHub Billing Service
 * Extracted from the monolithic service for better maintainability
 */

/**
 * Cache-related constants
 */
export const CACHE_CONSTANTS = {
  /** Maximum number of cache entries before LRU eviction */
  MAX_CACHE_SIZE: 1000,
  /** Default cache TTL in minutes */
  DEFAULT_TTL_MINUTES: 60,
  /** Minimum cache TTL in minutes */
  MIN_TTL_MINUTES: 15,
  /** Maximum cache TTL in minutes */
  MAX_TTL_MINUTES: 240,
  /** Threshold for cache warmup (percentage of TTL remaining) */
  WARMUP_THRESHOLD: 0.25,
  /** Current cache version for migrations */
  CACHE_VERSION: 1,
  /** High access count threshold for TTL adjustment */
  HIGH_ACCESS_COUNT_THRESHOLD: 50,
  /** Medium access count threshold for TTL adjustment */
  MEDIUM_ACCESS_COUNT_THRESHOLD: 20,
  /** Low access count threshold for TTL adjustment */
  LOW_ACCESS_COUNT_THRESHOLD: 5,
  /** TTL multiplier for high-frequency access */
  HIGH_FREQUENCY_TTL_MULTIPLIER: 1.5,
  /** TTL multiplier for medium-frequency access */
  MEDIUM_FREQUENCY_TTL_MULTIPLIER: 1.2,
  /** TTL multiplier for low-frequency access */
  LOW_FREQUENCY_TTL_MULTIPLIER: 0.8,
} as const;

/**
 * API request-related constants
 */
export const API_CONSTANTS = {
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 30000,
  /** Maximum number of retry attempts */
  MAX_RETRIES: 3,
  /** Base delay for exponential backoff in milliseconds */
  BASE_RETRY_DELAY_MS: 1000,
  /** Maximum delay for exponential backoff in milliseconds */
  MAX_RETRY_DELAY_MS: 30000,
  /** Number of tokens for rate limiting */
  RATE_LIMIT_TOKENS: 10,
  /** Rate limit interval in milliseconds */
  RATE_LIMIT_INTERVAL_MS: 60000,
  /** Maximum concurrent requests for aggregated data fetching */
  MAX_CONCURRENT_REQUESTS: 3,
} as const;

/**
 * Circuit breaker constants
 */
export const CIRCUIT_BREAKER_CONSTANTS = {
  /** Number of failures before circuit opens */
  FAILURE_THRESHOLD: 5,
  /** Time in milliseconds before attempting to close circuit */
  RESET_TIMEOUT_MS: 60000,
  /** Number of requests to allow in half-open state */
  HALF_OPEN_REQUESTS: 3,
} as const;

/**
 * Allowed domains for URL validation
 */
export const ALLOWED_DOMAINS = ["github.com", "api.github.com"] as const;

/**
 * HTTP status codes for error handling
 */
export const HTTP_STATUS_CODES = {
  OK: 200,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Retryable HTTP status codes
 */
export const RETRYABLE_STATUS_CODES = [
  HTTP_STATUS_CODES.TOO_MANY_REQUESTS,
  HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
  HTTP_STATUS_CODES.SERVICE_UNAVAILABLE,
] as const;

/**
 * Non-retryable HTTP status codes (authentication/authorization errors)
 */
export const NON_RETRYABLE_STATUS_CODES = [HTTP_STATUS_CODES.UNAUTHORIZED, HTTP_STATUS_CODES.FORBIDDEN] as const;

/**
 * Priority levels for cache entries
 */
export const CACHE_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

/**
 * Configuration keys for multi-config support
 */
export const CONFIG_KEYS = ["config1", "config2", "config3"] as const;

/**
 * Default values for various operations
 */
export const DEFAULTS = {
  /** Default customer ID when none is provided */
  CUSTOMER_ID: "default",
  /** Default HTTP method */
  HTTP_METHOD: "GET",
  /** Default priority for new cache entries */
  CACHE_PRIORITY: CACHE_PRIORITY.MEDIUM,
} as const;

/**
 * Log action types for API activity logging
 */
export const LOG_ACTIONS = {
  FETCH: "fetch",
  CACHE_HIT: "cache_hit",
  CACHE_MISS: "cache_miss",
  ERROR: "error",
} as const;

/**
 * Type exports for constants
 */
export type ConfigKey = (typeof CONFIG_KEYS)[number];
export type CachePriority = (typeof CACHE_PRIORITY)[keyof typeof CACHE_PRIORITY];
export type LogAction = (typeof LOG_ACTIONS)[keyof typeof LOG_ACTIONS];
export type AllowedDomain = (typeof ALLOWED_DOMAINS)[number];
