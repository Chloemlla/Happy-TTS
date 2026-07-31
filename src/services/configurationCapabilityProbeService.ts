import { startupConfig } from "../config/config";
import {
  getTtsProviderCapabilityReadiness,
  type TtsProviderCapabilityReadiness,
} from "../tts/tts.readiness";
import logger from "../utils/logger";
import { ChatProviderModel } from "./librechat/models";
import { mongoose } from "./mongoService";
import { TurnstileService } from "./turnstileService";
import { WebhookSecretModel } from "./webhookEventService";

export interface OptionalCapabilityProbeSnapshot {
  turnstile: {
    secretConfigured: boolean;
    siteConfigured: boolean;
  };
  hcaptcha: {
    secretConfigured: boolean;
    siteConfigured: boolean;
  };
  resendWebhookConfigured: boolean;
  ipfsUploadConfigured: boolean;
  libreChatProviderConfigured: boolean;
  ttsProviders: TtsProviderCapabilityReadiness[];
}

async function probeBoolean(label: string, probe: () => Promise<boolean>): Promise<boolean> {
  try {
    return await probe();
  } catch (error) {
    logger.warn("[Config] Optional capability probe failed", {
      capability: label,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function hasStoredResendWebhookSecret(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  const stored = await WebhookSecretModel.find({ provider: "resend" })
    .select({ secret: 1 })
    .limit(100)
    .lean()
    .exec();
  return stored.some((item: { secret?: unknown }) => typeof item.secret === "string" && item.secret.trim());
}

async function hasStoredIpfsUploadUrl(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  const stored = await mongoose.connection.collection("shorturl_settings").findOne(
    { key: "IPFS_UPLOAD_URL" },
    { projection: { value: 1 } },
  );
  return Boolean(typeof stored?.value === "string" && stored.value.trim());
}

async function hasStoredLibreChatProvider(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  const stored = await ChatProviderModel.find({ enabled: { $ne: false } })
    .select({ baseUrl: 1, apiKey: 1, model: 1 })
    .limit(100)
    .lean()
    .exec();
  return stored.some(
    (item: { baseUrl?: unknown; apiKey?: unknown; model?: unknown }) =>
      typeof item.baseUrl === "string" &&
      item.baseUrl.trim().length > 0 &&
      typeof item.apiKey === "string" &&
      item.apiKey.trim().length > 0 &&
      typeof item.model === "string" &&
      item.model.trim().length > 0,
  );
}

export async function probeOptionalCapabilities(): Promise<OptionalCapabilityProbeSnapshot> {
  const [
    turnstileConfig,
    hcaptchaConfig,
    storedWebhook,
    storedIpfs,
    storedLibreChat,
    ttsProviders,
  ] = await Promise.all([
    TurnstileService.getConfig().catch((error) => {
      logger.warn("[Config] Turnstile configuration probe failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { secretKey: null, siteKey: null, enabled: false };
    }),
    TurnstileService.getHCaptchaConfig().catch((error) => {
      logger.warn("[Config] hCaptcha configuration probe failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { secretKey: null, siteKey: null, enabled: false };
    }),
    probeBoolean("resend-webhook", hasStoredResendWebhookSecret),
    probeBoolean("ipfs-upload", hasStoredIpfsUploadUrl),
    probeBoolean("librechat-provider", hasStoredLibreChatProvider),
    getTtsProviderCapabilityReadiness().catch((error) => {
      logger.warn("[Config] TTS provider configuration probe failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [] as TtsProviderCapabilityReadiness[];
    }),
  ]);

  const envWebhookConfigured = ["RESEND_WEBHOOK_SECRET", "WEBHOOK_SECRET"].some(
    (name) => Boolean(process.env[name]?.trim()),
  );
  const envLibreChatConfigured = Boolean(
    process.env.CHAT_BASE_URL?.trim() && process.env.CHAT_API_KEY?.trim(),
  );

  return {
    turnstile: {
      secretConfigured: Boolean(turnstileConfig.secretKey),
      siteConfigured: Boolean(turnstileConfig.siteKey),
    },
    hcaptcha: {
      secretConfigured: Boolean(hcaptchaConfig.secretKey),
      siteConfigured: Boolean(hcaptchaConfig.siteKey),
    },
    resendWebhookConfigured: envWebhookConfigured || storedWebhook,
    ipfsUploadConfigured: Boolean(startupConfig.ipfs.uploadUrl?.trim()) || storedIpfs,
    libreChatProviderConfigured: envLibreChatConfigured || storedLibreChat,
    ttsProviders,
  };
}
