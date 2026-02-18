/**
 * GitHub Billing Service - Modular Architecture
 *
 * This module exports all billing-related components for the GitHub Billing Service.
 */

// Constants
export * from "./constants";

// Error classes
export * from "./errors";
// Re-export schema types with Schema suffix to avoid conflicts
export type {
  CachePriority as SchemaCachePriority,
  ConfigKey as SchemaConfigKey,
  ValidationError as SchemaValidationError,
} from "./schemas";
// Validation schemas - explicitly re-export to avoid conflicts with constants
export {
  type AggregatedBillingData,
  AggregatedBillingDataSchema,
  type BillingCycle,
  BillingCycleSchema,
  type BillingDiscount,
  BillingDiscountSchema,
  type CacheEntry,
  CacheEntrySchema,
  type CacheMetrics,
  CacheMetricsSchema,
  CachePrioritySchema,
  ConfigKeySchema,
  type DiscountDetail,
  DiscountDetailSchema,
  type DiscountTarget,
  DiscountTargetSchema,
  detectResponseFormat,
  type GitHubBillingDiscountResponse,
  GitHubBillingDiscountResponseSchema,
  type GitHubBillingNewResponse,
  GitHubBillingNewResponseSchema,
  type GitHubBillingResponse,
  GitHubBillingResponseSchema,
  type GitHubBillingUsage,
  GitHubBillingUsageSchema,
  type GitHubOtherItem,
  GitHubOtherItemSchema,
  type GitHubUsageItem,
  GitHubUsageItemSchema,
  // Types from schemas (using different names to avoid conflicts)
  type HttpMethod,
  // Schemas
  HttpMethodSchema,
  type LegacyBillingResponse,
  LegacyBillingResponseSchema,
  type MultiCurlConfig,
  MultiCurlConfigSchema,
  type ParsedCurlCommand,
  ParsedCurlCommandSchema,
  type UsageBreakdown,
  UsageBreakdownSchema,
  ValidationErrorSchema,
  type ValidationResult,
  ValidationResultSchema,
  // Helper functions
  validateSchema,
} from "./schemas";
