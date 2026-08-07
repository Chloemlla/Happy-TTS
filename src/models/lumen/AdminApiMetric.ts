import { mongoose } from "../../services/mongoService.js";

export interface IAdminApiMetric {
  _id: string;
  endpoint: string;
  qps: number;
  p95Ms: number;
  status2xx: number;
  status4xx: number;
  status5xx: number;
  sampledAt: number;
}

const AdminApiMetricSchema = new mongoose.Schema<IAdminApiMetric>(
  {
    _id: { type: String },
    endpoint: { type: String },
    qps: { type: Number },
    p95Ms: { type: Number },
    status2xx: { type: Number },
    status4xx: { type: Number },
    status5xx: { type: Number },
    sampledAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_api_metrics" },
);

AdminApiMetricSchema.index({ sampledAt: 1 });

const AdminApiMetric =
  (mongoose.models.AdminApiMetric as mongoose.Model<IAdminApiMetric>) ||
  mongoose.model<IAdminApiMetric>("AdminApiMetric", AdminApiMetricSchema);

export { AdminApiMetric, AdminApiMetricSchema };