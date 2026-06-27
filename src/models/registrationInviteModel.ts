import { mongoose } from "../services/mongoService";

export interface RegistrationInviteUse {
  userId: string;
  username: string;
  email: string;
  usedAt: Date;
}

export interface RegistrationInviteDoc {
  code: string;
  note?: string;
  active: boolean;
  maxUses: number;
  usedCount: number;
  usedBy: RegistrationInviteUse[];
  createdBy?: string;
  createdByUsername?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date | null;
}

const RegistrationInviteUseSchema = new mongoose.Schema<RegistrationInviteUse>(
  {
    userId: { type: String, required: true },
    username: { type: String, required: true },
    email: { type: String, required: true },
    usedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const RegistrationInviteSchema = new mongoose.Schema<RegistrationInviteDoc>(
  {
    code: { type: String, required: true, unique: true, index: true },
    note: { type: String, default: "" },
    active: { type: Boolean, default: true, index: true },
    maxUses: { type: Number, required: true, min: 1, default: 1 },
    usedCount: { type: Number, required: true, min: 0, default: 0 },
    usedBy: { type: [RegistrationInviteUseSchema], default: [] },
    createdBy: { type: String },
    createdByUsername: { type: String },
    expiresAt: { type: Date, default: null, index: true },
  },
  {
    collection: "registration_invites",
    timestamps: true,
  },
);

RegistrationInviteSchema.index({ active: 1, expiresAt: 1 });

export const RegistrationInviteModel =
  (mongoose.models.RegistrationInvite as mongoose.Model<RegistrationInviteDoc>) ||
  mongoose.model<RegistrationInviteDoc>("RegistrationInvite", RegistrationInviteSchema);
