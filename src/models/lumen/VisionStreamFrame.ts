import { mongoose } from "../../services/mongoService.js";

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
  /** D3: TTL anchor. Mongo TTL needs a Date, and `receivedAt` must stay epoch millis for the SDK. */
  ttlExpireAt?: Date;
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
    ttlExpireAt: { type: Date },
  },
  { strict: true, timestamps: false, collection: "vision_stream_frames" },
);

VisionStreamFrameSchema.index({ sessionId: 1 });
VisionStreamFrameSchema.index({ ttlExpireAt: 1 }, { expireAfterSeconds: 0 });

const VisionStreamFrame =
  (mongoose.models.VisionStreamFrame as mongoose.Model<IVisionStreamFrame>) ||
  mongoose.model<IVisionStreamFrame>("VisionStreamFrame", VisionStreamFrameSchema);

export { VisionStreamFrame, VisionStreamFrameSchema };