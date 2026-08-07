import { mongoose } from "../../services/mongoService.js";

export interface ISilentVision {
  enabled: boolean;
  exclusiveAccess: boolean;
  noSurfacePreview: boolean;
  analyzerOnly: boolean;
  requiresExplicitConsent: boolean;
  maxFps: number;
  maxSessionMinutes: number;
  frameUploadEnabled: boolean;
  surfaceAnalysisUploadEnabled: boolean;
  endpointPrefix: string;
}

export interface ILifecycleLock {
  enabled: boolean;
  enforceKeepalive: boolean;
  selfHealOnKill: boolean;
  interceptUserStop: boolean;
  antiUninstallIntent: boolean;
  restartDelayMs: number;
  maxRestartBurst: number;
  reportEvents: boolean;
  endpointPrefix: string;
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
    exclusiveAccess: { type: Boolean },
    noSurfacePreview: { type: Boolean },
    analyzerOnly: { type: Boolean },
    requiresExplicitConsent: { type: Boolean },
    maxFps: { type: Number },
    maxSessionMinutes: { type: Number },
    frameUploadEnabled: { type: Boolean },
    surfaceAnalysisUploadEnabled: { type: Boolean },
    endpointPrefix: { type: String },
  },
  { _id: false },
);

const LifecycleLockSchema = new mongoose.Schema<ILifecycleLock>(
  {
    enabled: { type: Boolean },
    enforceKeepalive: { type: Boolean },
    selfHealOnKill: { type: Boolean },
    interceptUserStop: { type: Boolean },
    antiUninstallIntent: { type: Boolean },
    restartDelayMs: { type: Number },
    maxRestartBurst: { type: Number },
    reportEvents: { type: Boolean },
    endpointPrefix: { type: String },
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