/**
 * Zod validation schemas for the GitHub Billing Service
 * Provides runtime schema validation for API responses and configurations
 */

import { z } from "zod/v4";
import { ALLOWED_DOMAINS, CACHE_PRIORITY, CONFIG_KEYS } from "./constants";

/**
 * HTTP method schema
 */
export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE"]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

/**
 * Config key schema
 */
export const ConfigKeySchema = z.enum(CONFIG_KEYS);
export type ConfigKey = z.infer<typeof ConfigKeySchema>;

/**
 * Cache priority schema
 */
export const CachePrioritySchema = z.enum([CACHE_PRIORITY.LOW, CACHE_PRIORITY.MEDIUM, CACHE_PRIORITY.HIGH]);
export type CachePriority = z.infer<typeof CachePrioritySchema>;

/**
 * URL validation that checks against allowed domains
 */
const GitHubUrlSchema = z.url().check((ctx) => {
  try {
    const parsedUrl = new URL(ctx.value);
    const hostname = parsedUrl.hostname.toLowerCase();
    const isValid = ALLOWED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (!isValid) {
      ctx.issues.push({
        code: "custom",
        message: "URL must be from an allowed GitHub domain",
        input: ctx.value,
      });
    }
  } catch {
    ctx.issues.push({
      code: "custom",
      message: "Invalid URL format",
      input: ctx.value,
    });
  }
});

/**
 * Parsed curl command schema
 */
export const ParsedCurlCommandSchema = z.object({
  url: GitHubUrlSchema,
  method: HttpMethodSchema.default("GET"),
  headers: z.record(z.string(), z.string()).default({}),
  cookies: z.string().default(""),
  customerId: z.string().optional(),
});
export type ParsedCurlCommand = z.infer<typeof ParsedCurlCommandSchema>;

/**
 * Discount target schema
 */
export const DiscountTargetSchema = z.object({
  id: z.string(),
  type: z.string(),
});
export type DiscountTarget = z.infer<typeof DiscountTargetSchema>;

/**
 * Discount detail schema
 */
export const DiscountDetailSchema = z.object({
  targets: z.array(DiscountTargetSchema).optional(),
  percentage: z.number().optional(),
  targetAmount: z.number().optional(),
  uuid: z.string().optional(),
  startDate: z.number().optional(),
  endDate: z.number().optional(),
  discountType: z.string().optional(),
  fundingSource: z.string().optional(),
});
export type DiscountDetail = z.infer<typeof DiscountDetailSchema>;

/**
 * Billing discount schema
 */
export const BillingDiscountSchema = z.object({
  isFullyApplied: z.boolean(),
  currentAmount: z.number(),
  targetAmount: z.number(),
  percentage: z.number(),
  uuid: z.string(),
  targets: z.array(DiscountTargetSchema),
  discount: DiscountDetailSchema.optional(),
  name: z.string().nullable(),
});
export type BillingDiscount = z.infer<typeof BillingDiscountSchema>;

/**
 * GitHub usage item schema (new format)
 */
export const GitHubUsageItemSchema = z.object({
  billedAmount: z.number(),
  totalAmount: z.number(),
  discountAmount: z.number(),
  quantity: z.number().nullable(),
  product: z.string().nullable(),
  repo: z.object({
    name: z.string(),
  }),
  org: z.object({
    name: z.string(),
    avatarSrc: z.string(),
    login: z.string(),
  }),
  usageAt: z.string(),
});
export type GitHubUsageItem = z.infer<typeof GitHubUsageItemSchema>;

/**
 * GitHub other item schema (new format)
 */
export const GitHubOtherItemSchema = z.object({
  billedAmount: z.number(),
  netAmount: z.number(),
  discountAmount: z.number(),
  usageAt: z.string(),
});
export type GitHubOtherItem = z.infer<typeof GitHubOtherItemSchema>;

/**
 * GitHub billing new response format schema (usage array format)
 */
export const GitHubBillingNewResponseSchema = z.object({
  usage: z.array(GitHubUsageItemSchema),
  other: z.array(GitHubOtherItemSchema),
});
export type GitHubBillingNewResponse = z.infer<typeof GitHubBillingNewResponseSchema>;

/**
 * GitHub billing discount response schema
 */
export const GitHubBillingDiscountResponseSchema = z.object({
  discounts: z.array(BillingDiscountSchema),
});
export type GitHubBillingDiscountResponse = z.infer<typeof GitHubBillingDiscountResponseSchema>;

/**
 * Usage breakdown schema
 */
export const UsageBreakdownSchema = z.object({
  actions: z.number().optional(),
  packages: z.number().optional(),
  codespaces: z.number().optional(),
  copilot: z.number().optional(),
});
export type UsageBreakdown = z.infer<typeof UsageBreakdownSchema>;

/**
 * Billing cycle schema
 */
export const BillingCycleSchema = z.object({
  start_date: z.string(),
  end_date: z.string(),
});
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

/**
 * Legacy billing response schema
 */
export const LegacyBillingResponseSchema = z.object({
  total_usage: z.number().optional(),
  included_usage: z.number().optional(),
  billable_usage: z.number().optional(),
  usage_breakdown: UsageBreakdownSchema.optional(),
  billing_cycle: BillingCycleSchema.optional(),
  total_paid_minutes_used: z.number().optional(),
  included_minutes: z.number().optional(),
  minutes_used_breakdown: z.record(z.string(), z.number()).optional(),
});
export type LegacyBillingResponse = z.infer<typeof LegacyBillingResponseSchema>;

/**
 * GitHub billing usage schema (unified format)
 */
export const GitHubBillingUsageSchema = z.object({
  // Legacy fields
  total_usage: z.number().optional(),
  included_usage: z.number().optional(),
  billable_usage: z.number().optional(),
  usage_breakdown: UsageBreakdownSchema.optional(),
  billing_cycle: BillingCycleSchema.optional(),

  // Discount format fields
  billable_amount: z.number().optional(),
  discount_details: z.array(BillingDiscountSchema).optional(),

  // New usage array format fields
  total_discount_amount: z.number().optional(),
  usage_details: z.array(GitHubUsageItemSchema).optional(),
  other_details: z.array(GitHubOtherItemSchema).optional(),
  repo_breakdown: z.record(z.string(), z.number()).optional(),
  org_breakdown: z.record(z.string(), z.number()).optional(),
  daily_breakdown: z.record(z.string(), z.number()).optional(),

  // Compatibility fields
  total_paid_minutes_used: z.number().optional(),
  included_minutes: z.number().optional(),
  minutes_used_breakdown: z.record(z.string(), z.number()).optional(),
  timestamp: z.string().optional(),

  // Customer ID (added during processing)
  customerId: z.string().optional(),
});
export type GitHubBillingUsage = z.infer<typeof GitHubBillingUsageSchema>;

/**
 * Combined GitHub billing response schema
 * Validates any of the three response formats
 */
export const GitHubBillingResponseSchema = z.union([
  GitHubBillingNewResponseSchema,
  GitHubBillingDiscountResponseSchema,
  LegacyBillingResponseSchema,
]);
export type GitHubBillingResponse = z.infer<typeof GitHubBillingResponseSchema>;

/**
 * Multi curl config schema
 */
export const MultiCurlConfigSchema = z.object({
  config1: ParsedCurlCommandSchema.optional(),
  config2: ParsedCurlCommandSchema.optional(),
  config3: ParsedCurlCommandSchema.optional(),
  lastUpdated: z.date(),
});
export type MultiCurlConfig = z.infer<typeof MultiCurlConfigSchema>;

/**
 * Aggregated billing data schema
 */
export const AggregatedBillingDataSchema = z.object({
  totalBillableAmount: z.number(),
  totalDiscountAmount: z.number(),
  configCount: z.number(),
  configs: z.object({
    config1: GitHubBillingUsageSchema.optional(),
    config2: GitHubBillingUsageSchema.optional(),
    config3: GitHubBillingUsageSchema.optional(),
  }),
  aggregatedRepoBreakdown: z.record(z.string(), z.number()),
  aggregatedOrgBreakdown: z.record(z.string(), z.number()),
  aggregatedDailyBreakdown: z.record(z.string(), z.number()),
  timestamp: z.string(),
});
export type AggregatedBillingData = z.infer<typeof AggregatedBillingDataSchema>;

/**
 * Cache entry schema
 */
export const CacheEntrySchema = z.object({
  customerId: z.string(),
  data: GitHubBillingUsageSchema,
  lastUpdated: z.date(),
  expiresAt: z.date(),
  accessCount: z.number().default(0),
  lastAccessed: z.date(),
  createdAt: z.date(),
  priority: CachePrioritySchema.default("medium"),
});
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

/**
 * Cache metrics schema
 */
export const CacheMetricsSchema = z.object({
  totalEntries: z.number(),
  hitRate: z.number(),
  avgAccessCount: z.number(),
  cacheSize: z.number(),
  expiredEntries: z.number(),
  memoryUsage: z.number().optional(),
});
export type CacheMetrics = z.infer<typeof CacheMetricsSchema>;

/**
 * Validation error schema
 */
export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  value: z.unknown().optional(),
});
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

/**
 * Validation result schema
 */
export const ValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

/**
 * Helper function to validate data against a schema
 */
export function validateSchema<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Helper function to detect response format
 */
export function detectResponseFormat(data: unknown): "usage_array" | "discount" | "legacy" | "unknown" {
  if (typeof data !== "object" || data === null) {
    return "unknown";
  }

  const obj = data as Record<string, unknown>;

  // Check for usage array format
  if ("usage" in obj && Array.isArray(obj.usage)) {
    return "usage_array";
  }

  // Check for discount format
  if ("discounts" in obj && Array.isArray(obj.discounts)) {
    return "discount";
  }

  // Check for legacy format
  if ("total_usage" in obj || "billable_usage" in obj || "included_usage" in obj) {
    return "legacy";
  }

  return "unknown";
}
