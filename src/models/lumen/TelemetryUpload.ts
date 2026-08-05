import { mongoose } from "../../services/mongoService";

export interface ITelemetryUpload {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  receivedAt: number;
  payload: unknown;
}

const TelemetryUploadSchema = new mongoose.Schema<ITelemetryUpload>(
  {
    _id: { type: String },
    userId: { type: String },
    deviceInstallationId: { type: String },
    receivedAt: { type: Number },
    payload: { type: mongoose.Schema.Types.Mixed },
  },
  { strict: true, timestamps: false, collection: "telemetry_uploads" },
);

TelemetryUploadSchema.index({ userId: 1, receivedAt: 1 });
TelemetryUploadSchema.index({ receivedAt: 1 });
TelemetryUploadSchema.index({ deviceInstallationId: 1 });

const TelemetryUpload =
  (mongoose.models.TelemetryUpload as mongoose.Model<ITelemetryUpload>) ||
  mongoose.model<ITelemetryUpload>("TelemetryUpload", TelemetryUploadSchema);

export { TelemetryUpload, TelemetryUploadSchema };