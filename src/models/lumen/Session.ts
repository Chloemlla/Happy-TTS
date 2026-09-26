import { mongoose } from "../../services/mongoService.js";

export interface ISession {
  _id: string;
  refreshToken?: string;
  userId: string;
  deviceInstallationId?: string;
  /**
   * 官方客户端识别字段（S-02）。与 Synapse 的 auth_sessions 保持同一套词汇：
   * clientType 归一化成 web/PiliPlus/Synapse-Client/Project-Lumen/other，platform 是
   * Android/Windows/... 这类可展示标签。没有它们，「设备与会话」无法把 lumen 会话
   * 认成「Project-Lumen / Android」，多个安装也会塌成一组。
   */
  clientType?: string;
  platform?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  lastActiveAt?: Date;
  lastUsedAt?: Date;
  createdAt: number;
  expiresAt: Date;
  refreshExpiresAt: Date;
}

const SessionSchema = new mongoose.Schema<ISession>(
  {
    _id: { type: String },
    refreshToken: { type: String, unique: true, sparse: true },
    userId: { type: String, required: true },
    deviceInstallationId: { type: String },
    clientType: { type: String },
    platform: { type: String },
    deviceName: { type: String },
    userAgent: { type: String },
    ipAddress: { type: String },
    lastActiveAt: { type: Date },
    lastUsedAt: { type: Date },
    createdAt: { type: Number },
    expiresAt: { type: Date, required: true },
    refreshExpiresAt: { type: Date, required: true },
  },
  { strict: true, timestamps: false, collection: "sessions" },
);

SessionSchema.index({ refreshToken: 1 }, { unique: true, sparse: true });
SessionSchema.index({ refreshExpiresAt: 1 }, { expireAfterSeconds: 0 });
SessionSchema.index({ userId: 1 });
SessionSchema.index({ userId: 1, deviceInstallationId: 1 });

const Session =
  (mongoose.models.Session as mongoose.Model<ISession>) ||
  mongoose.model<ISession>("Session", SessionSchema);

export { Session, SessionSchema };