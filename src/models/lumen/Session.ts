import { mongoose } from "../../services/mongoService";

export interface ISession {
  _id: string;
  refreshToken?: string;
  userId: string;
  deviceInstallationId?: string;
  createdAt: number;
  expiresAt: Date;
}

const SessionSchema = new mongoose.Schema<ISession>(
  {
    _id: { type: String },
    refreshToken: { type: String, unique: true, sparse: true },
    userId: { type: String, required: true },
    deviceInstallationId: { type: String },
    createdAt: { type: Number },
    expiresAt: { type: Date, required: true },
  },
  { strict: true, timestamps: false, collection: "sessions" },
);

SessionSchema.index({ refreshToken: 1 }, { unique: true, sparse: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1 });

const Session =
  (mongoose.models.Session as mongoose.Model<ISession>) ||
  mongoose.model<ISession>("Session", SessionSchema);

export { Session, SessionSchema };