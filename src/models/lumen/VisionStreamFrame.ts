import { mongoose } from "../../services/mongoService";

export interface IVisionStreamFrame {
  _id: string;
  userId: string;
  sessionId: string;
  deviceInstallationId: string;
  receivedAt: number;
  exclusiveAccess: boolean;
  noSurfacePreview: boolean;
  pipeline: string;
  surfaceAttached: boolean;
  payload: unknown;
}

const VisionStreamFrameSchema = new mongoose.Schema<IVisionStreamFrame>(
  {
    _id: { type: String },
    userId: { type: String },
    sessionId: { type: String, required: true },
    deviceInstallationId: { type: String },
    receivedAt: { type: Number },
    exclusiveAccess: { type: Boolean },
    noSurfacePreview: { type: Boolean },
    pipeline: { type: String },
    surfaceAttached: { type: Boolean },
    payload: { type: mongoose.Schema.Types.Mixed },
  },
  { strict: true, timestamps: false, collection: "vision_stream_frames" },
);

VisionStreamFrameSchema.index({ sessionId: 1 });

const VisionStreamFrame =
  (mongoose.models.VisionStreamFrame as mongoose.Model<IVisionStreamFrame>) ||
  mongoose.model<IVisionStreamFrame>("VisionStreamFrame", VisionStreamFrameSchema);

export { VisionStreamFrame, VisionStreamFrameSchema };