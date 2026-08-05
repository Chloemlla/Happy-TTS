import { mongoose } from "../../services/mongoService";

export interface IAdminTemplate {
  _id: string;
  name: string;
  tier: string;
  countdownStyle: string;
  color: string;
  locales: string[];
  layoutJson: unknown;
  updatedAt: number;
}

const AdminTemplateSchema = new mongoose.Schema<IAdminTemplate>(
  {
    _id: { type: String },
    name: { type: String },
    tier: { type: String },
    countdownStyle: { type: String },
    color: { type: String },
    locales: [{ type: String }],
    layoutJson: { type: mongoose.Schema.Types.Mixed },
    updatedAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_templates" },
);

AdminTemplateSchema.index({ updatedAt: 1 });

const AdminTemplate =
  (mongoose.models.AdminTemplate as mongoose.Model<IAdminTemplate>) ||
  mongoose.model<IAdminTemplate>("AdminTemplate", AdminTemplateSchema);

export { AdminTemplate, AdminTemplateSchema };