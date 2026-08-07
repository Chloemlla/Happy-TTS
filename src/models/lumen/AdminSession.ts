import { mongoose } from "../../services/mongoService.js";

export interface IAdminSession {
  _id: string;
  refreshToken: string;
  username: string;
  role: string;
  lastUsedAt?: Date;
  expiresAt: Date;
  refreshExpiresAt: Date;
  createdAt: number;
}

const AdminSessionSchema = new mongoose.Schema<IAdminSession>(
  {
    _id: { type: String },
    refreshToken: { type: String, required: true, unique: true },
    username: { type: String },
    role: { type: String },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    refreshExpiresAt: { type: Date },
    createdAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "admin_sessions" },
);

AdminSessionSchema.index({ refreshExpiresAt: 1 }, { expireAfterSeconds: 0 });

const AdminSession =
  (mongoose.models.AdminSession as mongoose.Model<IAdminSession>) ||
  mongoose.model<IAdminSession>("AdminSession", AdminSessionSchema);

export { AdminSession, AdminSessionSchema };