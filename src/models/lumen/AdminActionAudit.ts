import { mongoose } from "../../services/mongoService";

export interface IAdminActionAudit {
  _id: string;
  operator: string;
  action: string;
  payload: Record<string, unknown>;
  recordedAt: number;
}

const AdminActionAuditSchema = new mongoose.Schema<IAdminActionAudit>(
  {
    _id: { type: String },
    operator: { type: String, required: true },
    action: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    recordedAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_actions" },
);

AdminActionAuditSchema.index({ recordedAt: 1 });
AdminActionAuditSchema.index({ operator: 1 });

const AdminActionAudit =
  (mongoose.models.AdminActionAudit as mongoose.Model<IAdminActionAudit>) ||
  mongoose.model<IAdminActionAudit>("AdminActionAudit", AdminActionAuditSchema);

export { AdminActionAudit, AdminActionAuditSchema };