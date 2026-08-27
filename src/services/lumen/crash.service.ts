import crypto from "node:crypto";
import { CrashReport, AdminCrashReport } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";

// ── Constants ───────────────────────────────────────────────────────────
const MAX_CRASHES_PER_HOUR = 20;
const CRASH_WINDOW_MS = 60 * 60 * 1000;
const STACK_LINES = 12;
const LINE_MAX_LENGTH = 200;

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Record a crash report.
 *
 * Validates deviceInstallationId and reportId, enforces a 20/hour rate limit,
 * checks idempotency by userId+reportId, computes a groupKey from the clean
 * stack trace, persists the full report losslessly, and updates the
 * AdminCrashReport aggregation.
 */
export async function recordCrashReport(
  userId: string,
  request: {
    deviceInstallationId?: string;
    reportId?: string;
    packageName?: string;
    versionCode?: number;
    crashedAtMillis?: number;
    crashedAtText?: string;
    exceptionType?: string;
    rootCause?: string;
    threadName?: string;
    processName?: string;
    systemInfo?: string;
    stackTrace?: string;
    recentEvents?: string[];
    kind?: string;
    durationMillis?: number;
    authorName?: string;
    authorUrl?: string;
    authorFingerprint?: string;
  },
) {
  // ── Validate required fields ──────────────────────────────────────────
  if (!request.deviceInstallationId || typeof request.deviceInstallationId !== "string") {
    throw ApiError.badRequest("deviceInstallationId is required");
  }
  if (!request.reportId || typeof request.reportId !== "string") {
    throw ApiError.badRequest("reportId is required");
  }

  // ── Rate limit: 20 per hour per user+device ───────────────────────────
  const windowStart = Date.now() - CRASH_WINDOW_MS;
  const recentCount = await CrashReport.countDocuments({
    userId,
    deviceInstallationId: request.deviceInstallationId,
    receivedAt: { $gte: windowStart },
  }).exec();

  if (recentCount >= MAX_CRASHES_PER_HOUR) {
    throw ApiError.tooManyRequests("Crash report rate limit exceeded (20/hour)");
  }

  // ── Idempotency: already ingested? ────────────────────────────────────
  // Only receivedAt is needed, so avoid pulling the stack trace payload back.
  const existing = await CrashReport.findOne({ userId, reportId: request.reportId })
    .select({ receivedAt: 1 })
    .lean()
    .exec();
  if (existing) {
    return {
      accepted: true,
      id: request.reportId,
      duplicate: true,
      receivedAt: existing.receivedAt,
    };
  }

  // ── Compute groupKey from clean stack ─────────────────────────────────
  const stackTrace = request.stackTrace || "";
  const nonBlankLines = stackTrace
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const cleanStackLines = nonBlankLines
    .slice(0, STACK_LINES)
    .map((l) => l.slice(0, LINE_MAX_LENGTH));
  const cleanStackJoined = cleanStackLines.join("\n").toLowerCase();
  // versionCode 来自客户端 JSON，可能是对象/数组等查询操作符，必须先归一化为有限整数
  const versionCode = Number.isFinite(Number(request.versionCode))
    ? Math.trunc(Number(request.versionCode))
    : 0;
  const groupKey = crypto
    .createHash("sha256")
    .update(cleanStackJoined + "|" + versionCode)
    .digest("hex");

  const now = Date.now();

  // ── Persist the full crash report losslessly ──────────────────────────
  const doc = await CrashReport.create({
    _id: crypto.randomUUID(),
    userId,
    deviceInstallationId: request.deviceInstallationId,
    reportId: request.reportId,
    packageName: request.packageName ?? "",
    versionCode,
    crashedAtMillis: request.crashedAtMillis ?? 0,
    crashedAtText: request.crashedAtText ?? "",
    exceptionType: request.exceptionType ?? "",
    rootCause: request.rootCause ?? "",
    threadName: request.threadName ?? "",
    processName: request.processName ?? "",
    systemInfo: request.systemInfo ?? "",
    stackTrace,
    recentEvents: request.recentEvents ?? [],
    kind: request.kind ?? "crash",
    durationMillis: request.durationMillis ?? 0,
    authorName: request.authorName ?? "",
    authorUrl: request.authorUrl ?? "",
    authorFingerprint: request.authorFingerprint ?? "",
    groupKey,
    cleanStack: cleanStackLines,
    receivedAt: now,
  });

  // ── Update AdminCrashReport aggregation ───────────────────────────────
  const updated = await AdminCrashReport.findOneAndUpdate(
    { groupKey: { $eq: groupKey }, versionCode: { $eq: versionCode } },
    {
      $inc: { count: 1 },
      $addToSet: { devices: request.deviceInstallationId },
      $set: {
        groupKey,
        versionCode,
        cleanStack: cleanStackLines,
        lastSeenAt: now,
      },
    },
    { upsert: true, new: true },
  ).exec();

  const affectedUsers = updated!.devices.length;
  const count = updated!.count;
  let risk = "low";
  if (count >= 50 || affectedUsers >= 20) risk = "high";
  else if (count >= 10 || affectedUsers >= 5) risk = "medium";

  // Repeat crashes from an already-known device leave both fields unchanged,
  // so the follow-up write is only worth issuing when something moved.
  if (updated!.affectedUsers !== affectedUsers || updated!.risk !== risk) {
    await AdminCrashReport.updateOne(
      { _id: updated!._id },
      { $set: { affectedUsers, risk } },
    ).exec();
  }

  return {
    accepted: true,
    id: request.reportId,
    duplicate: false,
    receivedAt: now,
  };
}