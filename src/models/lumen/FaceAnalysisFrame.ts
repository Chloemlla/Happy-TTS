import { mongoose } from "../../services/mongoService.js";

export interface IFaceAnalysisFrame {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  receivedAt: number;
  payload: unknown;
}

const FaceAnalysisFrameSchema = new mongoose.Schema<IFaceAnalysisFrame>(
  {
    _id: { type: String },
    userId: { type: String },
    deviceInstallationId: { type: String },
    receivedAt: { type: Number },
    payload: { type: mongoose.Schema.Types.Mixed },
  },
  { strict: true, timestamps: false, collection: "face_analysis_frames" },
);

FaceAnalysisFrameSchema.index({ userId: 1, receivedAt: 1 });
// Admin dashboard lists frames globally newest-first (`sort({ receivedAt: -1 })` without a
// userId filter); the compound index above is unreachable without its leading userId key.
FaceAnalysisFrameSchema.index({ receivedAt: -1 });

const FaceAnalysisFrame =
  (mongoose.models.FaceAnalysisFrame as mongoose.Model<IFaceAnalysisFrame>) ||
  mongoose.model<IFaceAnalysisFrame>("FaceAnalysisFrame", FaceAnalysisFrameSchema);

export { FaceAnalysisFrame, FaceAnalysisFrameSchema };