import type { NextFunction, Request, Response } from "express";
import { Entitlement } from "../../models/lumen/index.js";

/**
 * Tier hierarchy (higher index = higher tier).
 * FREE=0, PRO=1, PLUS=2, TEAM=3
 */
const TIER_ORDER = ["FREE", "PRO", "PLUS", "TEAM"] as const;
type Tier = (typeof TIER_ORDER)[number];

function tierIndex(tier: string): number {
  const idx = TIER_ORDER.indexOf(tier as Tier);
  return idx >= 0 ? idx : -1;
}

/**
 * Resolve the highest active entitlement tier for a user.
 */
async function resolveHighestTier(userId: string): Promise<Tier | null> {
  const entitlements = await Entitlement.find({
    userId,
    status: "active",
  })
    .sort({ expiresAt: -1 })
    .lean()
    .exec();

  if (!entitlements || entitlements.length === 0) return null;

  let highest: Tier | null = null;
  let highestIdx = -1;

  for (const e of entitlements) {
    const idx = tierIndex(e.tier);
    if (idx > highestIdx) {
      highestIdx = idx;
      highest = e.tier as Tier;
    }
  }

  return highest;
}

/**
 * Middleware that requires the authenticated user to have at least a PLUS
 * entitlement.
 *
 * Must run after `requireAuth()` (i.e. `req.lumenUserId` must be set).
 *
 * Responds with 403 and reasonCode "commercial_plus_required" if the user
 * does not have a sufficiently high tier.
 */
export function requirePlusEntitlement(): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.lumenUserId) {
        res.status(401).json({ error: "Unauthorized", reasonCode: "auth_required" });
        return;
      }

      const highestTier = await resolveHighestTier(req.lumenUserId);

      if (!highestTier || tierIndex(highestTier) < tierIndex("PLUS")) {
        res.status(403).json({
          error: "Forbidden",
          reasonCode: "commercial_plus_required",
          message: "Project Lumen Commercial Edition Plus entitlement is required for cloud sync and backup.",
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}