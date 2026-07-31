import { config } from "../config/config";
import { RuntimeConfigService } from "../services/runtimeConfigService";

export interface TtsProviderCapabilityReadiness {
  name: "openai" | "fish";
  required: false;
  status: "ready" | "skipped";
  message: string;
  active: boolean;
  configured: boolean;
}

export async function getTtsProviderCapabilityReadiness(): Promise<TtsProviderCapabilityReadiness[]> {
  const runtimeConfig = await RuntimeConfigService.getRawTtsProviderConfig();
  const activeProvider = runtimeConfig.provider;
  const openAiConfigured = Boolean(config.openaiApiKey?.trim());
  const fishConfigured = Boolean(runtimeConfig.fish.apiKey.trim());

  return [
    {
      name: "openai",
      required: false,
      status: activeProvider === "openai" && openAiConfigured ? "ready" : "skipped",
      message:
        activeProvider !== "openai"
          ? "OpenAI TTS 未启用"
          : openAiConfigured
            ? "OpenAI TTS 已配置"
            : "OpenAI TTS 已启用但未配置 API Key",
      active: activeProvider === "openai",
      configured: openAiConfigured,
    },
    {
      name: "fish",
      required: false,
      status: activeProvider === "fish" && fishConfigured ? "ready" : "skipped",
      message:
        activeProvider !== "fish"
          ? "Fish Audio TTS 未启用"
          : fishConfigured
            ? "Fish Audio TTS 已配置"
            : "Fish Audio TTS 已启用但未配置 API Key",
      active: activeProvider === "fish",
      configured: fishConfigured,
    },
  ];
}
