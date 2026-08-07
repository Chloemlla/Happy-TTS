import { mongoose } from "../../services/mongoService.js";

export interface IVisionStreamSession {
  _id: string;
  userId: string;
  deviceInstallationId: string;
  exclusiveAccess: boolean;
  noSurfacePreview: boolean;
  analyzerOnly: boolean;
  framesCaptured: number;
  framesUploaded: number;
  exclusiveHeld: boolean;
  surfaceDetached: boolean;
  startedAt: number;
  lastHeartbeatAt: number;
  expiresAt: number;
  status: string;
  metadata: unknown;
}

const VisionStreamSessionSchema = new mongoose.Schema<IVisionStreamSession>(
  {
    _id: { type: String },
    userId: { type: String, required: true },
    deviceInstallationId: { type: String },
    exclusiveAccess: { type: Boolean },
    noSurfacePreview: { type: Boolean },
    analyzerOnly: { type: Boolean },
    framesCaptured: { type: Number },
    framesUploaded: { type: Number },
    exclusiveHeld: { type: Boolean },
    surfaceDetached: { type: Boolean },
    startedAt: { type: Number },
    lastHeartbeatAt: { type: Number },
    expiresAt: { type: Number },
    status: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { strict: true, timestamps: false, collection: "vision_stream_sessions" },
);

VisionStreamSessionSchema.index({ userId: 1 });
VisionStreamSessionSchema.index({ lastHeartbeatAt: 1 });

const VisionStreamSession =
  (mongoose.models.VisionStreamSession as mongoose.Model<IVisionStreamSession>) ||
  mongoose.model<IVisionStreamSession>("VisionStreamSession", VisionStreamSessionSchema);

export { VisionStreamSession, VisionStreamSessionSchema };