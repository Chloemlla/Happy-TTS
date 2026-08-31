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
  { timestamps: false },
);

// Serves `find({ eventType }).sort({ createdAt: -1 })` — the security event list query.
// The single-field eventType index leaves an in-memory sort behind; the compound index
// lets MongoDB use the index for both filter and sort.
securityEventSchema.index({ eventType: 1, createdAt: -1 });

export const SecurityEvent =
  (mongoose.models.SecurityEvent as mongoose.Model<ISecurityEvent>) ||
  mongoose.model<ISecurityEvent>("SecurityEvent", securityEventSchema);
