import { mongoose } from "../../services/mongoService.js";

export interface IAdminCrashReport {
  _id: string;
  groupKey: string;
  versionCode: number;
  count: number;
  affectedUsers: number;
  risk: string;
  cleanStack: string[];
  lastSeenAt: number;
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
    lastSeenAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_crash_reports" },
);

AdminCrashReportSchema.index({ lastSeenAt: 1 });

const AdminCrashReport =
  (mongoose.models.AdminCrashReport as mongoose.Model<IAdminCrashReport>) ||
  mongoose.model<IAdminCrashReport>("AdminCrashReport", AdminCrashReportSchema);

export { AdminCrashReport, AdminCrashReportSchema };