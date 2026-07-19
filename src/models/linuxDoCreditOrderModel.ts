import { mongoose } from "../services/mongoService";

export type LinuxDoCreditOrderStatus = "pending" | "paid" | "failed" | "refunded" | "expired";
export type LinuxDoCreditProtocol = "epay" | "ldc";

export interface LinuxDoCreditOrderDoc {
  outTradeNo: string;
  tradeNo: string | null;
  userId: string;
  keyId: string;
  protocol: LinuxDoCreditProtocol;
  money: number;
  credits: number;
  orderName: string;
  status: LinuxDoCreditOrderStatus;
  payUrl: string | null;
  notifyPayload: Record<string, unknown> | null;
  paidAt: Date | null;
  creditedAt: Date | null;
  creditOperationId: string | null;
  failReason: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LinuxDoCreditOrderSchema = new mongoose.Schema<LinuxDoCreditOrderDoc>(
  {
    outTradeNo: { type: String, required: true, unique: true, index: true },
    tradeNo: { type: String, default: null, index: true },
    userId: { type: String, required: true, index: true },
    keyId: { type: String, required: true, index: true },
    protocol: { type: String, enum: ["epay", "ldc"], required: true, default: "epay" },
    money: { type: Number, required: true, min: 0.01 },
    credits: { type: Number, required: true, min: 0.01 },
    orderName: { type: String, required: true, maxlength: 64 },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded", "expired"],
      required: true,
      default: "pending",
      index: true,
    },
    payUrl: { type: String, default: null },
    notifyPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    paidAt: { type: Date, default: null },
    creditedAt: { type: Date, default: null },
    creditOperationId: { type: String, default: null },
    failReason: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true, collection: "linuxdo_credit_orders" },
);

LinuxDoCreditOrderSchema.index({ userId: 1, createdAt: -1 });
LinuxDoCreditOrderSchema.index({ keyId: 1, createdAt: -1 });
LinuxDoCreditOrderSchema.index({ status: 1, expiresAt: 1 });

export const LinuxDoCreditOrderModel =
  (mongoose.models.LinuxDoCreditOrder as mongoose.Model<LinuxDoCreditOrderDoc>) ||
  mongoose.model<LinuxDoCreditOrderDoc>("LinuxDoCreditOrder", LinuxDoCreditOrderSchema);