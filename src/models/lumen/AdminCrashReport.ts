import { mongoose } from "../../services/mongoService.js";

export interface IAdminCrashReport {
  _id: string;
  groupKey: string;
  versionCode: number;
  count: number;
  affectedUsers: number;
  risk: string;
  cleanStack: string[];
  devices: string[];
  lastSeenAt: number;
  /** D3: TTL anchor. Refreshed on every ingest upsert, so a live crash group is never reaped. */
  ttlExpireAt?: Date;
}

const AdminCrashReportSchema = new mongoose.Schema<IAdminCrashReport>(
  {
    _id: { type: String },
    groupKey: { type: String },
    versionCode: { type: Number },
    count: { type: Number },
    affectedUsers: { type: Number },
    risk: { type: String },
    cleanStack: [{ type: String }],
    devices: { type: [String], default: [] },
    lastSeenAt: { type: Number },
    ttlExpireAt: { type: Date },
  },
  { strict: true, timestamps: false, collection: "admin_crash_reports" },
);

AdminCrashReportSchema.index({ lastSeenAt: 1 });
// Admin list sorts/filters: risk + recency, and the count/user/version orderings.
AdminCrashReportSchema.index({ risk: 1, lastSeenAt: -1 });
AdminCrashReportSchema.index({ count: -1, lastSeenAt: -1 });
AdminCrashReportSchema.index({ affectedUsers: -1, lastSeenAt: -1 });
AdminCrashReportSchema.index({ versionCode: 1, lastSeenAt: -1 });
// Ingest upserts one aggregate row per (groupKey, versionCode).
AdminCrashReportSchema.index({ groupKey: 1, versionCode: 1 });
AdminCrashReportSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0 });

const AdminCrashReport =
  (mongoose.models.AdminCrashReport as mongoose.Model<IAdminCrashReport>) ||
  mongoose.model<IAdminCrashReport>("AdminCrashReport", AdminCrashReportSchema);

export { AdminCrashReport, AdminCrashReportSchema };