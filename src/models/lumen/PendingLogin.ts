import { mongoose } from "../../services/mongoService";

export interface IPendingLogin {
  _id: string;
  email: string;
  code: string;
  expiresAt: Date;
}

const PendingLoginSchema = new mongoose.Schema<IPendingLogin>(
  {
    _id: { type: String },
    email: { type: String, required: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { strict: true, timestamps: false, collection: "login_requests" },
);

PendingLoginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingLogin =
  (mongoose.models.PendingLogin as mongoose.Model<IPendingLogin>) ||
  mongoose.model<IPendingLogin>("PendingLogin", PendingLoginSchema);

export { PendingLogin, PendingLoginSchema };