import logger from "../../utils/logger";
import { isConnected, mongoose } from "../mongoService";
import type { HCaptchaSettingDoc, TurnstileSettingDoc } from "./types";

const TurnstileSettingSchema = new mongoose.Schema<TurnstileSettingDoc>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "turnstile_settings" },
);

const HCaptchaSettingSchema = new mongoose.Schema<HCaptchaSettingDoc>(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "hcaptcha_settings" },
);

export const TurnstileSettingModel =
  (mongoose.models.TurnstileSetting as mongoose.Model<TurnstileSettingDoc>) ||
  mongoose.model<TurnstileSettingDoc>("TurnstileSetting", TurnstileSettingSchema);

export const HCaptchaSettingModel =
  (mongoose.models.HCaptchaSetting as mongoose.Model<HCaptchaSettingDoc>) ||
  mongoose.model<HCaptchaSettingDoc>("HCaptchaSetting", HCaptchaSettingSchema);

export async function getTurnstileKey(
  keyName: "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY",
): Promise<string | null> {
  try {
    if (isConnected()) {
      const doc = await TurnstileSettingModel.findOne({ key: keyName }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        return doc.value.trim();
      }
    }
  } catch (error) {
    logger.error("获取Turnstile密钥失败", { keyName, error: error instanceof Error ? error.message : String(error) });
  }
  return null;
}

export async function getHCaptchaKey(keyName: "HCAPTCHA_SECRET_KEY" | "HCAPTCHA_SITE_KEY"): Promise<string | null> {
  try {
    if (isConnected()) {
      const doc = await HCaptchaSettingModel.findOne({ key: keyName }).lean().exec();
      if (doc && typeof doc.value === "string" && doc.value.trim().length > 0) {
        return doc.value.trim();
      }
    }
  } catch (e) {
    logger.error(`读取hCaptcha ${keyName} 失败，回退到环境变量`, e);
  }

  const envKey = process.env[keyName]?.trim();
  return envKey && envKey.length > 0 ? envKey : null;
}

export function getTraceModel() {
  const schema = new mongoose.Schema(
    {
      traceId: { type: String, required: true, unique: true },
      time: { type: Date, default: Date.now },
      ip: String,
      ua: String,
      success: Boolean,
      reason: String,
      errorCode: String,
      errorMessage: String,
      score: Number,
      thresholdBase: Number,
      thresholdUsed: Number,
      passRateIp: Number,
      passRateUa: Number,
      policy: String,
      riskLevel: String,
      riskScore: Number,
      riskReasons: [String],
      challengeRequired: Boolean,
      verificationMethod: { type: String, default: "turnstile" },
      fingerprint: String,
      violationCount: Number,
      banned: Boolean,
      banExpiresAt: Date,
      cfErrorCodes: [String],
    },
    { collection: "shc_traces", timestamps: false },
  );
  return mongoose.models.SHCTrace || mongoose.model("SHCTrace", schema);
}
