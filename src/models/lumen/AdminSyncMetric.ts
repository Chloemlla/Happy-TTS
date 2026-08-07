import { mongoose } from "../../services/mongoService.js";

export interface IAdminSyncMetric {
  _id: string;
  endpoint: string;
  averagePayloadKb: number;
  largestPayloadKb: number;
  p95Ms: number;
  rejectedPayloads: number;
  sampledAt: number;
}

const AdminSyncMetricSchema = new mongoose.Schema<IAdminSyncMetric>(
  {
    _id: { type: String },
    endpoint: { type: String },
    averagePayloadKb: { type: Number },
    largestPayloadKb: { type: Number },
    p95Ms: { type: Number },
    rejectedPayloads: { type: Number },
    sampledAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_sync_metrics" },
);

AdminSyncMetricSchema.index({ sampledAt: 1 });

const AdminSyncMetric =
  (mongoose.models.AdminSyncMetric as mongoose.Model<IAdminSyncMetric>) ||
  mongoose.model<IAdminSyncMetric>("AdminSyncMetric", AdminSyncMetricSchema);

export { AdminSyncMetric, AdminSyncMetricSchema };