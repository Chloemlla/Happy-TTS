import crypto from "node:crypto";
import { CrashReport, AdminCrashReport } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";

// ── Constants ───────────────────────────────────────────────────────────
const MAX_CRASHES_PER_HOUR = 20;
const CRASH_WINDOW_MS = 60 * 60 * 1000;
const STACK_LINES = 12;
const LINE_MAX_LENGTH = 200;
const MAX_STACK_TRACE_CHARS = 64 * 1024;
const MAX_SYSTEM_INFO_CHARS = 8 * 1024;
const MAX_RECENT_EVENTS = 20;
const MAX_RECENT_EVENT_CHARS = 512;
const MAX_DEVICES_PER_GROUP = 10000;

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

  // ── Rate limit: 20 per hour per user ──────────────────────────────────
  // G7-26: keyed on userId (server-authenticated), not the client-supplied
  // deviceInstallationId which a client could rotate to reset the window.
  const windowStart = Date.now() - CRASH_WINDOW_MS;
  const recentCount = await CrashReport.countDocuments({
    userId,
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

  // G7-26: hard limits on unbounded client fields — a single crash report must
  // not be able to approach the 16MB BSON limit. Truncate rather than reject so
  // the crash is still ingested for triage.
  const persistedStackTrace = (request.stackTrace || "").slice(0, MAX_STACK_TRACE_CHARS);
  const systemInfo = (request.systemInfo || "").slice(0, MAX_SYSTEM_INFO_CHARS);
  const recentEvents = (request.recentEvents ?? [])
    .filter((e): e is string => typeof e === "string")
    .slice(0, MAX_RECENT_EVENTS)
    .map((e) => e.slice(0, MAX_RECENT_EVENT_CHARS));

  // ── Persist the crash report ──────────────────────────────────────────
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
    systemInfo,
    stackTrace: persistedStackTrace,
    recentEvents,
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
  // G7-27: the `devices` array must not grow without bound (a single document
  // could hit the 16MB cap and stop aggregating). Cap it, and read back only
  // the fields needed for risk computation instead of the whole document.
  const updated = await AdminCrashReport.findOneAndUpdate(
    { groupKey: { $eq: groupKey }, versionCode: { $eq: versionCode } },
    [
      {
        $set: {
          count: { $add: [{ $ifNull: ["$count", 0] }, 1] },
          devices: {
            $cond: [
              { $lt: [{ $size: { $ifNull: ["$devices", []] } }, MAX_DEVICES_PER_GROUP] },
              { $setUnion: [{ $ifNull: ["$devices", []] }, [request.deviceInstallationId]] },
              { $ifNull: ["$devices", []] },
            ],
          },
          groupKey,
          versionCode,
          cleanStack: cleanStackLines,
          lastSeenAt: now,
        },
      },
    ] as any,
    { upsert: true, new: true, projection: { _id: 1, devices: 1, count: 1 } },
  ).exec();

  const affectedUsers = updated!.devices.length;
  const count = updated!.count;
  let risk = "low";
  if (count >= 50 || affectedUsers >= 20) risk = "high";
  else if (count >= 10 || affectedUsers >= 5) risk = "medium";

  // Persist the derived fields. (The findOneAndUpdate above only projected
  // _id/devices/count, so the risk/affectedUsers update is issued unconditionally.)
  await AdminCrashReport.updateOne(
    { _id: updated!._id },
    { $set: { affectedUsers, risk } },
  ).exec();

  return {
    accepted: true,
    id: request.reportId,
    duplicate: false,
    receivedAt: now,
  };
}