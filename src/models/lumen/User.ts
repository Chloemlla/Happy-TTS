import { mongoose } from "../../services/mongoService";

export interface IDeviceSecurityEvidence {
  status: string;
  verified: boolean;
  completed: boolean;
  rooted: boolean;
  suspicious: boolean;
  hardwareIntegrityOk: boolean;
  selinuxEnforcing: boolean;
  teeAttestationOk: boolean;
  observedAt: number;
  scannerVersion: string;
}

export interface IUser {
  _id: string;
  email?: string;
  emailVerified?: boolean;
  deviceInstallationId?: string;
  deviceFingerprint?: string;
  deviceAssetModel?: string;
  deviceAssetVersionCode?: number;
  deviceAssetLastSeenAt?: number;
  deviceAssetSecurityConfig?: string;
  deviceSecurityEvidence?: IDeviceSecurityEvidence;
  featureFlags?: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
}

const DeviceSecurityEvidenceSchema = new mongoose.Schema<IDeviceSecurityEvidence>(
  {
    status: { type: String },
    verified: { type: Boolean },
    completed: { type: Boolean },
    rooted: { type: Boolean },
    suspicious: { type: Boolean },
    hardwareIntegrityOk: { type: Boolean },
    selinuxEnforcing: { type: Boolean },
    teeAttestationOk: { type: Boolean },
    observedAt: { type: Number },
    scannerVersion: { type: String },
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema<IUser>(
  {
    _id: { type: String },
    email: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean },
    deviceInstallationId: { type: String },
    deviceFingerprint: { type: String },
    deviceAssetModel: { type: String },
    deviceAssetVersionCode: { type: Number },
    deviceAssetLastSeenAt: { type: Number },
    deviceAssetSecurityConfig: { type: String },
    deviceSecurityEvidence: { type: DeviceSecurityEvidenceSchema },
    featureFlags: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Number },
    updatedAt: { type: Number },
  },
  { strict: true, timestamps: false, collection: "users" },
);

UserSchema.index({ email: 1 }, { unique: true, sparse: true });

const User =
  (mongoose.models.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);

export { User, UserSchema };