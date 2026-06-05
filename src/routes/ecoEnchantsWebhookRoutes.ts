import crypto from "node:crypto";
import type { Request, Response } from "express";
import express from "express";
import { Router } from "express";
import { EcoEnchantsController } from "../controllers/ecoEnchantsController";
import { createLimiter } from "../middleware/routeLimiters";

const router = Router();

function getWebhookRequestId(req: Request): string {
  const header = req.headers["x-request-id"];
  if (typeof header === "string" && header.trim()) return header.trim();
  if (Array.isArray(header) && typeof header[0] === "string" && header[0].trim()) return header[0].trim();
  return `req_${crypto.randomUUID()}`;
}

const ecoEnchantsWebhookLimiter = createLimiter({
  name: "ecoenchantsWebhook",
  category: "public-api",
  windowMs: 60 * 1000,
  max: 120,
  message: "EcoEnchants webhook requests are too frequent, please retry later.",
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      requestId: getWebhookRequestId(req),
      error: {
        code: "rate_limited",
        message: "EcoEnchants webhook requests are too frequent, please retry later.",
        docsUrl: "https://docs.example.com/ecoenchants/errors#rate_limited",
        retryAfterSeconds: 60,
      },
    });
  },
});

router.post(
  "/:provider",
  ecoEnchantsWebhookLimiter,
  express.raw({ type: "application/json", limit: "1mb" }),
  EcoEnchantsController.webhook,
);

export default router;
