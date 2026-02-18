import mongoose, { type Document, Schema } from "mongoose";

export interface IInvitation extends Document {
  id: string;
  workspaceId: string;
  inviteeEmail: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  expiresAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    id: { type: String, required: true, unique: true },
    workspaceId: { type: String, required: true },
    inviteeEmail: { type: String, required: true },
    role: { type: String, enum: ["editor", "viewer"], required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending",
    },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { collection: "invitations" },
);

// 索引
InvitationSchema.index({ id: 1 }, { unique: true });
InvitationSchema.index({ workspaceId: 1 });
InvitationSchema.index({ inviteeEmail: 1 });
InvitationSchema.index({ status: 1 });
InvitationSchema.index({ expiresAt: 1 });

export default mongoose.models.Invitation || mongoose.model<IInvitation>("Invitation", InvitationSchema);
