import { mongoose } from "../../services/mongoService.js";

export interface IApiNonce {
  _id: string;
  createdAt: number;
  expiresAt: Date;
}

const ApiNonceSchema = new mongoose.Schema<IApiNonce>(
  {
    _id: { type: String },
    createdAt: { type: Number },
    expiresAt: { type: Date, required: true },
  },
  { strict: true, timestamps: false, collection: "api_nonces" },
);

ApiNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const ApiNonce =
  (mongoose.models.ApiNonce as mongoose.Model<IApiNonce>) ||
  mongoose.model<IApiNonce>("ApiNonce", ApiNonceSchema);

export { ApiNonce, ApiNonceSchema };