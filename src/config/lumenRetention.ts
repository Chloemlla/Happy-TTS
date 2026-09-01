/**
 * D3 / G8-06 / G8-22 / G8-29 / G7-25: retention for the lumen ingestion collections.
 *
 * Their time fields (`receivedAt`, `lastSeenAt`) are epoch millis Numbers, and Mongo
 * TTL only works on BSON Date. Converting them would change the JSON the published
 * Project-Lumen SDK reads (privileged-control.service / telemetry.service return
 * `receivedAt` verbatim), so the wire field stays a Number and a separate
 * `ttlExpireAt: Date` carries the TTL — the same split mobileClientTokenModel uses.
 *
 * A document with no `ttlExpireAt` is never reaped, so enabling this cannot delete
 * pre-existing rows until the backfill migration runs.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function retentionDaysFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

/**
 * Days to keep each collection. 0 disables retention for that collection: no
 * `ttlExpireAt` is written, so nothing expires.
 *
 * syncChange defaults to 0 on purpose. It is not telemetry — clients pull deltas by
 * cursor, and dropping a change a device has not fetched yet silently desyncs it.
 * Its bound needs an owner decision on the maximum offline window.
 */
export const LUMEN_RETENTION_DAYS = {
  visionStreamFrame: retentionDaysFromEnv(process.env.LUMEN_RETENTION_VISION_FRAME_DAYS, 7),
  faceAnalysisFrame: retentionDaysFromEnv(process.env.LUMEN_RETENTION_FACE_FRAME_DAYS, 7),
  telemetryUpload: retentionDaysFromEnv(process.env.LUMEN_RETENTION_TELEMETRY_DAYS, 30),
  lifecycleEvent: retentionDaysFromEnv(process.env.LUMEN_RETENTION_LIFECYCLE_DAYS, 30),
  crashReport: retentionDaysFromEnv(process.env.LUMEN_RETENTION_CRASH_REPORT_DAYS, 90),
  adminCrashReport: retentionDaysFromEnv(process.env.LUMEN_RETENTION_CRASH_GROUP_DAYS, 180),
  syncChange: retentionDaysFromEnv(process.env.LUMEN_RETENTION_SYNC_CHANGE_DAYS, 0),
} as const;

export type LumenRetentionKind = keyof typeof LUMEN_RETENTION_DAYS;

/** The TTL anchor for a document ingested at `nowMillis`, or undefined when retention is off. */
export function lumenTtlExpireAt(kind: LumenRetentionKind, nowMillis: number): Date | undefined {
  const days = LUMEN_RETENTION_DAYS[kind];
  if (days <= 0) return undefined;
  return new Date(nowMillis + days * DAY_MS);
}
