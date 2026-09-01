import { mongoose } from "../../services/mongoService.js";

export interface IFaceAnalysisFrame {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  receivedAt: number;
  payload: unknown;
  /** D3: TTL anchor. Mongo TTL needs a Date, and `receivedAt` must stay epoch millis for the SDK. */
  ttlExpireAt?: Date;
}

const FaceAnalysisFrameSchema = new mongoose.Schema<IFaceAnalysisFrame>(
  {
    _id: { type: String },
    userId: { type: String },
    deviceInstallationId: { type: String },
    receivedAt: { type: Number },
    payload: { type: mongoose.Schema.Types.Mixed },
    ttlExpireAt: { type: Date },
  },
  { strict: true, timestamps: false, collection: "face_analysis_frames" },
);

FaceAnalysisFrameSchema.index({ userId: 1, receivedAt: 1 });
// Admin dashboard lists frames globally newest-first (`sort({ receivedAt: -1 })` without a
// userId filter); the compound index above is unreachable without its leading userId key.
FaceAnalysisFrameSchema.index({ receivedAt: -1 });
FaceAnalysisFrameSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0 });

const FaceAnalysisFrame =
  (mongoose.models.FaceAnalysisFrame as mongoose.Model<IFaceAnalysisFrame>) ||
  mongoose.model<IFaceAnalysisFrame>("FaceAnalysisFrame", FaceAnalysisFrameSchema);

export { FaceAnalysisFrame, FaceAnalysisFrameSchema };