import { mongoose } from "../services/mongoService";

export interface IpVerificationTokenDoc {
  token: string;
  fingerprint: string;
  ipAddress: string;
  issuedBy: "auto" | "turnstile" | "hcaptcha";
  challengePassed: boolean;
  fraudScore?: number;
  riskFlags?: string[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  lastValidatedAt?: Date;
}

const IpVerificationTokenSchema = new mongoose.Schema<IpVerificationTokenDoc>(
  {
    token: { type: String, required: true, unique: true, index: true },
    fingerprint: { type: String, required: true, index: true },
    ipAddress: { type: String, required: true, index: true },
    issuedBy: {
      type: String,
      enum: ["auto", "turnstile", "hcaptcha"],
      required: true,
      default: "auto",
    },
    challengePassed: { type: Boolean, required: true, default: false },
    fraudScore: { type: Number, default: undefined },
    riskFlags: { type: [String], default: [] },
    expiresAt: { type: Date, required: true, index: true },
    lastValidatedAt: { type: Date, default: undefined },
  },
  {
    collection: "ip_verification_tokens",
    timestamps: true,
  },
);

IpVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
IpVerificationTokenSchema.index({ fingerprint: 1, ipAddress: 1, expiresAt: 1 });

export const IpVerificationTokenModel =
  (mongoose.models.IpVerificationToken as mongoose.Model<IpVerificationTokenDoc>) ||
  mongoose.model<IpVerificationTokenDoc>("IpVerificationToken", IpVerificationTokenSchema);
