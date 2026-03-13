import mongoose, { type Document, Schema } from "mongoose";

export interface IDeviceTracking extends Document {
  userId: string;
  deviceFingerprint: string;
  riskScore: number;
  riskLevel: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  isCompromised: boolean;
  isRoot: boolean;
  isDebugger: boolean;
  isEmulator: boolean;
  isVpn: boolean;
  signatureValid: boolean;
  hashValid: boolean;
  appVersion?: string;
  appBuild?: string;
  firstSeen: Date;
  lastSeen: Date;
  requestCount: number;
  blockedCount: number;
  ipAddress?: string;
  userAgent?: string;
}

const deviceTrackingSchema = new Schema<IDeviceTracking>(
  {
    userId: { type: String, required: true, index: true },
    deviceFingerprint: { type: String, required: true, index: true },
    riskScore: { type: Number, required: true, index: true },
    riskLevel: {
      type: String,
      required: true,
      enum: ["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
    },
    isCompromised: { type: Boolean, required: true },
    isRoot: { type: Boolean, required: true },
    isDebugger: { type: Boolean, required: true },
    isEmulator: { type: Boolean, required: true },
    isVpn: { type: Boolean, required: true },
    signatureValid: { type: Boolean, required: true },
    hashValid: { type: Boolean, required: true },
    appVersion: { type: String },
    appBuild: { type: String },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true, index: true },
    requestCount: { type: Number, default: 0 },
    blockedCount: { type: Number, default: 0 },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

// Compound index for user-device uniqueness
deviceTrackingSchema.index({ userId: 1, deviceFingerprint: 1 }, { unique: true });

export const DeviceTracking = mongoose.model<IDeviceTracking>(
  "DeviceTracking",
  deviceTrackingSchema
);
