import express, { type NextFunction, type Request, type Response } from "express";
import { cloudflareChallengeLimiter } from "../middleware/routeLimiters";

const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Turnstile 组件按站点根发起、正常由 Cloudflare 边缘应答的相对路径。本站直连源站
 * （不经 CF 代理），这些请求会落到后端，所以逐条桩掉：既不污染 404 日志，也避免
 * 组件把 404 当成挑战失败。
 *   - /h/g/rc/<id>：清除挑战的兑换（redemption）请求
 *   - /h/b/c/<id>：挑战平台 API 变体，实测出现在 Turnstile 弹层交互之后
 * 遇到新变体时往数组里加一条即可（末段沿用同一套格式校验）。
 */
const STUBBED_CHALLENGE_PATHS: readonly string[] = [
  "/challenge-platform/h/g/rc/:challengeId",
  "/challenge-platform/h/b/c/:challengeId",
];

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

for (const challengePath of STUBBED_CHALLENGE_PATHS) {
  router.options(challengePath, cloudflareChallengeLimiter, validateChallengeId, (_req, res) => {
    applyNoStoreHeaders(res);
    res.status(204).end();
  });

  router.post(challengePath, cloudflareChallengeLimiter, validateChallengeId, (_req, res) => {
    applyNoStoreHeaders(res);
    res.status(200).type("text/plain").send("OK");
  });
}

export default router;
