import express, { type NextFunction, type Request, type Response } from "express";
import { cloudflareChallengeLimiter } from "../middleware/routeLimiters";

const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const TURNSTILE_CLEARANCE_REDEMPTION_PATH = "/challenge-platform/h/g/rc/:challengeId";

const router = express.Router();

function applyNoStoreHeaders(res: Response): void {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("X-Robots-Tag", "noindex, nofollow");
}

function isValidChallengeId(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE_ID_PATTERN.test(value);
}

function validateChallengeId(req: Request, _res: Response, next: NextFunction): void {
  if (!isValidChallengeId(req.params.challengeId)) {
    next("route");
    return;
  }

  next();
}

router.options(
  TURNSTILE_CLEARANCE_REDEMPTION_PATH,
  cloudflareChallengeLimiter,
  validateChallengeId,
  (_req, res) => {
    applyNoStoreHeaders(res);
    res.status(204).end();
  },
);

router.post(
  TURNSTILE_CLEARANCE_REDEMPTION_PATH,
  cloudflareChallengeLimiter,
  validateChallengeId,
  (_req, res) => {
    applyNoStoreHeaders(res);
    res.status(200).type("text/plain").send("OK");
  },
);

export default router;
