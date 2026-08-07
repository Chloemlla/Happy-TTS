import { mongoose } from "../../services/mongoService.js";

export interface IAdminTelemetry {
  _id: string;
  label: string;
  value: number;
  rangeDays: number;
  sampledAt: number;
}

const AdminTelemetrySchema = new mongoose.Schema<IAdminTelemetry>(
  {
    _id: { type: String },
    label: { type: String },
    value: { type: Number },
    rangeDays: { type: Number },
    sampledAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_telemetry" },
);

AdminTelemetrySchema.index({ sampledAt: 1 });

const AdminTelemetry =
  (mongoose.models.AdminTelemetry as mongoose.Model<IAdminTelemetry>) ||
  mongoose.model<IAdminTelemetry>("AdminTelemetry", AdminTelemetrySchema);

export { AdminTelemetry, AdminTelemetrySchema };