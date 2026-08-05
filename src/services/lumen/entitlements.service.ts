import crypto from "node:crypto";
import { Entitlement, type EntitlementTier, type EntitlementStatus } from "../../models/lumen/index.js";
import { lumenConfig } from "../../config/lumen.js";
import { ApiError } from "./errors.js";
import logger from "../../utils/logger.js";

// ── Tier rank ──────────────────────────────────────────────────────────
const TIER_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  PLUS: 2,
  TEAM: 3,
};

function resolveTierRank(tier: string): number {
  return TIER_RANK[tier] ?? 0;
}

/**
 * Map a product ID to its entitlement tier.
 */
function tierForProduct(productId: string): EntitlementTier {
  const lower = productId.toLowerCase();
  if (lower === "team") return "TEAM";
  if (lower === "plus" || lower === "monthly" || lower === "yearly") return "PLUS";
  if (lower === "pro") return "PRO";
  return "FREE";
}

/**
 * Given a list of entitlements, resolve the highest active tier.
 */
function resolveActiveTier(entitlements: Array<{ tier: string; status: string }>): EntitlementTier {
  let highest: EntitlementTier = "FREE";
  let highestRank = 0;

  for (const e of entitlements) {
    if (e.status !== "active") continue;
    const rank = resolveTierRank(e.tier);
    if (rank > highestRank) {
      highestRank = rank;
      highest = e.tier as EntitlementTier;
    }
  }

  return highest;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * List all entitlements for a user, sorted by purchasedAt descending.
 * Returns the resolved active tier and the entitlement records.
 */
export async function listEntitlements(userId: string) {
  const entitlements = await Entitlement.find({ userId })
    .sort({ purchasedAt: -1 })
    .lean()
    .exec();

  const tier = resolveActiveTier(entitlements);

  return {
    tier,
    syncedAt: new Date().toISOString(),
    entitlements: entitlements.map((e) => ({
      id: e._id,
      source: e.source,
      productId: e.productId,
      tier: e.tier,
      status: e.status,
      purchasedAt: e.purchasedAt,
      expiresAt: e.expiresAt,
      lastVerifiedAt: e.lastVerifiedAt,
    })),
  };
}

/**
 * Check if a user has an active entitlement at or above the required tier.
 */
export async function userHasTierAtLeast(userId: string, requiredTier: string): Promise<boolean> {
  const requiredRank = resolveTierRank(requiredTier);
  if (requiredRank <= 0) return true; // FREE is always satisfied.

  const entitlements = await Entitlement.find({
    userId,
    status: "active",
  })
    .lean()
    .exec();

  const highest = resolveActiveTier(entitlements);
  return resolveTierRank(highest) >= requiredRank;
}

/**
 * Verify a Google Play purchase.
 *
 * When `acceptUnverified` is true (dev mode), the entitlement is immediately
 * marked active. Otherwise it is saved as pending and the tier defaults to FREE.
 */
export async function verifyGooglePurchase(
  userId: string,
  productId: string,
  purchaseToken: string,
  deviceInstallationId?: string,
  acceptUnverified?: boolean,
) {
  const accept = acceptUnverified ?? lumenConfig.acceptUnverifiedPurchases;
  const now = Date.now();

  const tier = tierForProduct(productId);
  const status: EntitlementStatus = accept ? "active" : "pending";

  const entitlement = await Entitlement.create({
    _id: crypto.randomUUID(),
    userId,
    source: "google_play",
    productId,
    purchaseToken,
    tier,
    status,
    purchasedAt: now,
    expiresAt: now + 365 * 24 * 60 * 60 * 1000, // 1 year default
    lastVerifiedAt: now,
    rawPayloadJson: JSON.stringify({
      deviceInstallationId,
      acceptUnverified: accept,
    }),
  });

  logger.info("[Lumen Entitlements] Purchase recorded", {
    userId,
    productId,
    tier,
    status,
    acceptUnverified: accept,
  });

  return {
    status,
    tier: accept ? tier : "FREE",
    verifiedAt: new Date(now).toISOString(),
    entitlement: {
      id: entitlement._id,
      source: entitlement.source,
      productId: entitlement.productId,
      tier: entitlement.tier,
      status: entitlement.status,
      purchasedAt: entitlement.purchasedAt,
      expiresAt: entitlement.expiresAt,
    },
  };
}

export { tierForProduct, resolveActiveTier, resolveTierRank };