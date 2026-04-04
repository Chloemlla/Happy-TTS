import { mongoose } from "../services/mongoService";

export const RUNTIME_CONFIG_KEYS = ["IPQS", "LINUXDO", "NEXAI"] as const;

export type RuntimeConfigKey = (typeof RUNTIME_CONFIG_KEYS)[number];

export interface RuntimeConfigSettingDoc {
  key: RuntimeConfigKey;
  value: Record<string, unknown>;
  updatedAt?: Date;
}

const RuntimeConfigSettingSchema = new mongoose.Schema<RuntimeConfigSettingDoc>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
      enum: RUNTIME_CONFIG_KEYS,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "runtime_config_settings" },
);

export const RuntimeConfigModel =
  (mongoose.models.RuntimeConfigSetting as mongoose.Model<RuntimeConfigSettingDoc>) ||
  mongoose.model<RuntimeConfigSettingDoc>("RuntimeConfigSetting", RuntimeConfigSettingSchema);
