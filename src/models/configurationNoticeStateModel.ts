import { mongoose } from "../services/mongoService";

const ConfigurationNoticeStateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  fingerprint: { type: String, required: true, default: "" },
  issueIds: { type: [String], default: [] },
  notifiedAt: Date,
  deliveredAt: Date,
  deliveryClaimId: String,
  deliveryClaimedAt: Date,
  resolvedAt: Date,
  updatedAt: { type: Date, default: Date.now },
});

ConfigurationNoticeStateSchema.index({ key: 1 }, { unique: true });

export function getConfigurationNoticeStateModel() {
  return (
    mongoose.models.ConfigurationNoticeState ||
    mongoose.model("ConfigurationNoticeState", ConfigurationNoticeStateSchema)
  );
}
