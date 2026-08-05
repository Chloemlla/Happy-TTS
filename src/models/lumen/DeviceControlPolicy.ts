import { mongoose } from "../../services/mongoService";

export interface ISilentVision {
  enabled: boolean;
  requiresExplicitConsent: boolean;
  exclusiveAccess: boolean;
  noSurfacePreview: boolean;
  analyzerOnly: boolean;
  frameUploadEnabled: boolean;
  surfaceAnalysisUploadEnabled: boolean;
  maxSessionMinutes: number;
}

export interface ILifecycleLock {
  enabled: boolean;
  allowedProcesses: string[];
  enforcementLevel: string;
}

export interface IDeviceControlPolicy {
  _id: string;
  scope: string;
  userId?: string;
  deviceInstallationId?: string;
  silentVision: ISilentVision;
  lifecycleLock: ILifecycleLock;
  updatedAt: number;
  updatedBy: string;
}

const SilentVisionSchema = new mongoose.Schema<ISilentVision>(
  {
    enabled: { type: Boolean },
    requiresExplicitConsent: { type: Boolean },
    exclusiveAccess: { type: Boolean },
    noSurfacePreview: { type: Boolean },
    analyzerOnly: { type: Boolean },
    frameUploadEnabled: { type: Boolean },
    surfaceAnalysisUploadEnabled: { type: Boolean },
    maxSessionMinutes: { type: Number },
  },
  { _id: false },
);

const LifecycleLockSchema = new mongoose.Schema<ILifecycleLock>(
  {
    enabled: { type: Boolean },
    allowedProcesses: [{ type: String }],
    enforcementLevel: { type: String },
  },
  { _id: false },
);

const DeviceControlPolicySchema = new mongoose.Schema<IDeviceControlPolicy>(
  {
    _id: { type: String },
    scope: { type: String, required: true },
    userId: { type: String },
    deviceInstallationId: { type: String },
    silentVision: { type: SilentVisionSchema },
    lifecycleLock: { type: LifecycleLockSchema },
    updatedAt: { type: Number },
    updatedBy: { type: String },
  },
  { strict: true, timestamps: false, collection: "device_control_policies" },
);

const DeviceControlPolicy =
  (mongoose.models.DeviceControlPolicy as mongoose.Model<IDeviceControlPolicy>) ||
  mongoose.model<IDeviceControlPolicy>("DeviceControlPolicy", DeviceControlPolicySchema);

export { DeviceControlPolicy, DeviceControlPolicySchema };