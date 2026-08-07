import { mongoose } from "../../services/mongoService.js";

export interface IAdminAccessAudit {
  _id: string;
  at: number;
  userId: string;
  endpoint: string;
  ip: string;
  geo: string;
  status: string;
}

const AdminAccessAuditSchema = new mongoose.Schema<IAdminAccessAudit>(
  {
    _id: { type: String },
    at: { type: Number },
    userId: { type: String },
    endpoint: { type: String },
    ip: { type: String },
    geo: { type: String },
    status: { type: String },
  },
  { strict: true, timestamps: false, collection: "admin_access_audit" },
);

AdminAccessAuditSchema.index({ at: 1 });
AdminAccessAuditSchema.index({ endpoint: 1 });

const AdminAccessAudit =
  (mongoose.models.AdminAccessAudit as mongoose.Model<IAdminAccessAudit>) ||
  mongoose.model<IAdminAccessAudit>("AdminAccessAudit", AdminAccessAuditSchema);

export { AdminAccessAudit, AdminAccessAuditSchema };