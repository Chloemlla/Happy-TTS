/**
 * GitHub Billing Service - Modular Architecture
 * 
 * This module exports all billing-related components for the GitHub Billing Service.
 */

// Constants
export * from './constants';

// Error classes
export * from './errors';

// Validation schemas - explicitly re-export to avoid conflicts with constants
export {
  // Schemas
  HttpMethodSchema,
  ConfigKeySchema,
  CachePrioritySchema,
  ParsedCurlCommandSchema,
  DiscountTargetSchema,
  DiscountDetailSchema,
  BillingDiscountSchema,
  GitHubUsageItemSchema,
  GitHubOtherItemSchema,
  GitHubBillingNewResponseSchema,
  GitHubBillingDiscountResponseSchema,
  UsageBreakdownSchema,
  BillingCycleSchema,
  LegacyBillingResponseSchema,
  GitHubBillingUsageSchema,
  GitHubBillingResponseSchema,
  MultiCurlConfigSchema,
  AggregatedBillingDataSchema,
  CacheEntrySchema,
  CacheMetricsSchema,
  ValidationErrorSchema,
  ValidationResultSchema,
  
  // Types from schemas (using different names to avoid conflicts)
  type HttpMethod,
  type ParsedCurlCommand,
  type DiscountTarget,
  type DiscountDetail,
  type BillingDiscount,
  type GitHubUsageItem,
  type GitHubOtherItem,
  type GitHubBillingNewResponse,
  type GitHubBillingDiscountResponse,
  type UsageBreakdown,
  type BillingCycle,
  type LegacyBillingResponse,
  type GitHubBillingUsage,
  type GitHubBillingResponse,
  type MultiCurlConfig,
  type AggregatedBillingData,
  type CacheEntry,
  type CacheMetrics,
  type ValidationResult,
  
  // Helper functions
  validateSchema,
  detectResponseFormat,
} from './schemas';

// Re-export schema types with Schema suffix to avoid conflicts
export type { ConfigKey as SchemaConfigKey } from './schemas';
export type { CachePriority as SchemaCachePriority } from './schemas';
export type { ValidationError as SchemaValidationError } from './schemas';
