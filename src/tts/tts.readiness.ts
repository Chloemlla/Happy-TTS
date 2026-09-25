import { config } from "../config/config";
import { RuntimeConfigService } from "../services/runtimeConfigService";

export interface TtsProviderCapabilityReadiness {
  name: "openai" | "fish" | "edge";
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
  // 微软内置语音不需要密钥，默认音色存在即视为可用。
  const edgeConfigured = Boolean(runtimeConfig.edge.defaultVoice.trim());

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
    {
      name: "edge",
      required: false,
      status: activeProvider === "edge" && edgeConfigured ? "ready" : "skipped",
      message:
        activeProvider !== "edge"
          ? "微软内置语音未启用"
          : edgeConfigured
            ? "微软内置语音已就绪"
            : "微软内置语音缺少默认音色配置",
      active: activeProvider === "edge",
      configured: edgeConfigured,
    },
  ];
}
