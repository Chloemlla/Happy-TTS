import mongoose, { type Document, Schema } from "mongoose";

export interface ISecurityEvent extends Document {
  deviceFingerprint: string;
  userId?: string;
  eventType: string;
  eventData?: Record<string, any>;
  riskScore?: number;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const securityEventSchema = new Schema<ISecurityEvent>(
  {
    deviceFingerprint: { type: String, required: true, index: true },
    userId: { type: String, index: true },
    eventType: { type: String, required: true, index: true },
    eventData: { type: Schema.Types.Mixed },
    riskScore: { type: Number },
    ipAddress: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: false }
);

export const SecurityEvent = mongoose.model<ISecurityEvent>(
  "SecurityEvent",
  securityEventSchema
);
