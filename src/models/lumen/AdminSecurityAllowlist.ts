import { mongoose } from "../../services/mongoService";

export interface IAdminSecurityAllowlist {
  _id: string;
  origin: string;
  protocol: string;
  risk: string;
  updatedAt: number;
}

const AdminSecurityAllowlistSchema = new mongoose.Schema<IAdminSecurityAllowlist>(
  {
    _id: { type: String },
    origin: { type: String },
    protocol: { type: String },
    risk: { type: String },
    updatedAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_security_allowlist" },
);

AdminSecurityAllowlistSchema.index({ updatedAt: 1 });

const AdminSecurityAllowlist =
  (mongoose.models.AdminSecurityAllowlist as mongoose.Model<IAdminSecurityAllowlist>) ||
  mongoose.model<IAdminSecurityAllowlist>("AdminSecurityAllowlist", AdminSecurityAllowlistSchema);

export { AdminSecurityAllowlist, AdminSecurityAllowlistSchema };