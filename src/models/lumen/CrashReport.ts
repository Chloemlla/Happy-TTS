import { mongoose } from "../../services/mongoService.js";

export interface ICrashReport {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  reportId: string;
  packageName: string;
  versionCode: number;
  crashedAtMillis: number;
  crashedAtText: string;
  exceptionType: string;
  rootCause: string;
  threadName: string;
  processName: string;
  systemInfo: string;
  stackTrace: string;
  recentEvents: string[];
  kind: string;
  durationMillis: number;
  authorName: string;
  authorUrl: string;
  authorFingerprint: string;
  groupKey: string;
  cleanStack: string[];
  receivedAt: number;
  /** D3: TTL anchor. Mongo TTL needs a Date, and `receivedAt` must stay epoch millis for the SDK. */
  ttlExpireAt?: Date;
}

const CrashReportSchema = new mongoose.Schema<ICrashReport>(
  {
    _id: { type: String },
    userId: { type: String },
    deviceInstallationId: { type: String },
    reportId: { type: String },
    packageName: { type: String },
    versionCode: { type: Number },
    crashedAtMillis: { type: Number },
    crashedAtText: { type: String },
    exceptionType: { type: String },
    rootCause: { type: String },
    threadName: { type: String },
    processName: { type: String },
    systemInfo: { type: String },
    stackTrace: { type: String },
    recentEvents: [{ type: String }],
    kind: { type: String },
    durationMillis: { type: Number },
    authorName: { type: String },
    authorUrl: { type: String },
    authorFingerprint: { type: String },
    groupKey: { type: String },
    cleanStack: [{ type: String }],
    receivedAt: { type: Number },
    ttlExpireAt: { type: Date },
  },
  { strict: true, timestamps: false, collection: "crash_reports" },
);

// Unique so concurrent duplicate crash reports for the same user+reportId can't
// create multiple documents (the service uses findOne-then-create today).
// PRECONDITION: de-duplicate existing {userId, reportId} rows before this index is
// built, otherwise the unique index creation fails on first sync (mongoose only logs it).
CrashReportSchema.index({ userId: 1, reportId: 1 }, { unique: true });
CrashReportSchema.index({ userId: 1, receivedAt: -1 });
CrashReportSchema.index({ groupKey: 1 });
// Ingest rate limiting counts per user+device inside a time window.
CrashReportSchema.index({ userId: 1, deviceInstallationId: 1, receivedAt: -1 });
// Admin group drill-down pages reports newest-first within one group.
CrashReportSchema.index({ groupKey: 1, crashedAtMillis: -1 });
// Admin device-ID filtering resolves the matching groupKey set from the index alone.
CrashReportSchema.index({ deviceInstallationId: 1, groupKey: 1 });
CrashReportSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0 });

const CrashReport =
  (mongoose.models.CrashReport as mongoose.Model<ICrashReport>) ||
  mongoose.model<ICrashReport>("CrashReport", CrashReportSchema);

export { CrashReport, CrashReportSchema };