import { mongoose } from "../services/mongoService";

export type AuthSessionKind = "jwt" | "client-token" | "oauth";
export type AuthClientType = "web" | "PiliPlus" | "Synapse-Client" | "other";

export interface AuthSessionDoc {
  sessionId: string;
  userId: string;
  credentialHash: string;
  credentialType: "jwt" | "client-token" | "oauth-access";
  authKind: AuthSessionKind;
  deviceKey: string;
  deviceId: string | null;
  deviceName: string;
  platform: string;
  clientType: AuthClientType;
  ipAddress: string;
  ipLocation: string;
  userAgent: string;
  oauthClientId: string | null;
  oauthTokenId: string | null;
  oauthGrantId: string | null;
  clientTokenHash: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  revokedAt: Date | null;
  updatedAt: Date;
}

const AuthSessionSchema = new mongoose.Schema<AuthSessionDoc>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    credentialHash: { type: String, required: true, unique: true, index: true },
    credentialType: { type: String, enum: ["jwt", "client-token", "oauth-access"], required: true },
    authKind: { type: String, enum: ["jwt", "client-token", "oauth"], required: true, index: true },
    deviceKey: { type: String, required: true, index: true },
    deviceId: { type: String, default: null, index: true },
    deviceName: { type: String, required: true },
    platform: { type: String, required: true },
    clientType: { type: String, enum: ["web", "PiliPlus", "Synapse-Client", "other"], required: true, index: true },
    ipAddress: { type: String, required: true },
    ipLocation: { type: String, required: true },
    userAgent: { type: String, required: true },
    oauthClientId: { type: String, default: null, index: true },
    oauthTokenId: { type: String, default: null, index: true },
    oauthGrantId: { type: String, default: null, index: true },
    clientTokenHash: { type: String, default: null, index: true },
    createdAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    revokedAt: { type: Date, default: null, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

AuthSessionSchema.index({ userId: 1, deviceKey: 1, lastActivityAt: -1 });
AuthSessionSchema.index({ userId: 1, revokedAt: 1, lastActivityAt: -1 });

export const AuthSessionModel =
  (mongoose.models.AuthSession as mongoose.Model<AuthSessionDoc>) ||
  mongoose.model<AuthSessionDoc>("AuthSession", AuthSessionSchema);
