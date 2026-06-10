import express from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken } from "../middleware/authenticateToken";
import adminOnly from "../middleware/adminOnly";
import {
  rustBenchmarkService,
  type RustBenchmarkStartOptions,
  type RustBenchmarkTarget,
  type RustBenchmarkOperation,
  type RustBenchmarkTransport,
} from "../services/rustBenchmarkService";

const router = express.Router();
const rustBenchmarkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Benchmark 请求过于频繁，请稍后再试" },
});

router.use(rustBenchmarkLimiter, authenticateToken, adminOnly);

router.get("/targets", (_req, res) => {
  res.json({
    success: true,
    data: rustBenchmarkService.getTargets(),
  });
});

router.get("/status", (_req, res) => {
  res.json({
    success: true,
    data: rustBenchmarkService.getSnapshot(),
  });
});

router.post("/start", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const snapshot = await rustBenchmarkService.start({
      target: body.target as RustBenchmarkTarget | undefined,
      operation: body.operation as RustBenchmarkOperation | undefined,
      durationMs: numberOrUndefined(body.durationMs),
      concurrency: numberOrUndefined(body.concurrency),
      payloadBytes: numberOrUndefined(body.payloadBytes),
      targetValue: stringOrUndefined(body.targetValue),
      baseUrl: stringOrUndefined(body.baseUrl),
      internalToken: stringOrUndefined(body.internalToken),
      timeoutMs: numberOrUndefined(body.timeoutMs),
      transport: stringOrUndefined(body.transport) as RustBenchmarkTransport | undefined,
    } satisfies RustBenchmarkStartOptions);

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Rust benchmark start failed";
    const statusCode = message.includes("already running") ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
});

router.post("/stop", (_req, res) => {
  res.json({
    success: true,
    data: rustBenchmarkService.stop(),
  });
});

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default router;
