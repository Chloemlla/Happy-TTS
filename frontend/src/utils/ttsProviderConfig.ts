import type {
  TtsProviderId,
  TtsProviderOption,
  TtsProviderPublicConfig,
  TtsVoiceMode,
} from "../types/tts";

export const FISH_DEFAULT_TTS_MODEL = "s2.1-pro-free";
export const FISH_DEFAULT_TTS_BASE_URL = "https://api.fish.audio";
export const OPENAI_DEFAULT_TTS_MODEL = "tts-1-hd";
export const OPENAI_TTS_OUTPUT_FORMATS = ["mp3", "opus", "aac", "flac"] as const;
export const FISH_TTS_OUTPUT_FORMATS = ["mp3"] as const;

export const OPENAI_TTS_MODELS: TtsProviderOption[] = [
  { id: "tts-1", name: "TTS-1", description: "标准质量，速度快" },
  { id: "tts-1-hd", name: "TTS-1-HD", description: "高清质量，更自然" },
];

export const OPENAI_TTS_VOICES: TtsProviderOption[] = [
  { id: "alloy", name: "Alloy", description: "中性、平衡的声音" },
  { id: "echo", name: "Echo", description: "男性、深沉的声音" },
  { id: "fable", name: "Fable", description: "英式口音、优雅" },
  { id: "onyx", name: "Onyx", description: "男性、深沉、戏剧性" },
  { id: "nova", name: "Nova", description: "女性、年轻、活泼" },
  { id: "shimmer", name: "Shimmer", description: "女性、温柔、轻柔" },
];

export const FALLBACK_TTS_PROVIDER_CONFIG: TtsProviderPublicConfig = {
  provider: "openai",
  defaultModel: OPENAI_DEFAULT_TTS_MODEL,
  defaultVoice: "nova",
  models: OPENAI_TTS_MODELS,
  voices: OPENAI_TTS_VOICES,
  voiceMode: "select",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapConfig(payload: unknown, depth = 0): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (normalizeProvider(payload.provider)) return payload;
  if (depth >= 4) return payload;
  const nested = [payload.config, payload.providerConfig, payload.data].find(isRecord);
  if (nested) return unwrapConfig(nested, depth + 1);
  return payload;
}

function normalizeProvider(value: unknown): TtsProviderId | null {
  return value === "openai" || value === "fish" ? value : null;
}

function normalizeVoiceMode(value: unknown, provider: TtsProviderId, hasVoices: boolean): TtsVoiceMode {
  if (value === "select" || value === "configured_reference" || value === "provider_default") {
    return value;
  }
  return provider === "fish" && !hasVoices ? "provider_default" : "select";
}

function normalizeOption(value: unknown): TtsProviderOption | null {
  if (typeof value === "string") {
    const id = value.trim();
    return id ? { id, name: id } : null;
  }
  if (!isRecord(value) || typeof value.id !== "string") return null;

  const id = value.id.trim();
  if (!id) return null;
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : id;
  const description =
    typeof value.description === "string" && value.description.trim()
      ? value.description.trim()
      : undefined;
  return { id, name, ...(description ? { description } : {}) };
}

function normalizeOptions(value: unknown): TtsProviderOption[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, TtsProviderOption>();
  for (const candidate of value) {
    const option = normalizeOption(candidate);
    if (option) unique.set(option.id, option);
  }
  return Array.from(unique.values());
}

function cloneFallback(): TtsProviderPublicConfig {
  return {
    ...FALLBACK_TTS_PROVIDER_CONFIG,
    models: [...FALLBACK_TTS_PROVIDER_CONFIG.models],
    voices: [...FALLBACK_TTS_PROVIDER_CONFIG.voices],
  };
}

export function getTtsOutputFormats(provider: TtsProviderId): readonly string[] {
  return provider === "fish" ? FISH_TTS_OUTPUT_FORMATS : OPENAI_TTS_OUTPUT_FORMATS;
}

export function supportsTtsSpeed(provider: TtsProviderId): boolean {
  return provider === "openai";
}

export function isTtsProviderConfigPayload(payload: unknown): boolean {
  const source = unwrapConfig(payload);
  return Boolean(source && normalizeProvider(source.provider));
}

export function normalizeTtsProviderConfig(payload: unknown): TtsProviderPublicConfig {
  const source = unwrapConfig(payload);
  const provider = normalizeProvider(source?.provider);
  if (!source || !provider) return cloneFallback();

  const providerDefaultModel = provider === "fish" ? FISH_DEFAULT_TTS_MODEL : OPENAI_DEFAULT_TTS_MODEL;
  const defaultModelCandidate =
    typeof source.defaultModel === "string" ? source.defaultModel.trim() : "";
  const hasProviderMismatch =
    (provider === "fish" && OPENAI_TTS_MODELS.some((option) => option.id === defaultModelCandidate)) ||
    (provider === "openai" && defaultModelCandidate === FISH_DEFAULT_TTS_MODEL);
  let models = normalizeOptions(source.models).filter((option) =>
    provider === "fish"
      ? !OPENAI_TTS_MODELS.some((openAiModel) => openAiModel.id === option.id)
      : option.id !== FISH_DEFAULT_TTS_MODEL,
  );
  if (provider === "openai" && models.length === 0) {
    models = [...OPENAI_TTS_MODELS];
  }
  if (
    defaultModelCandidate &&
    !hasProviderMismatch &&
    !models.some((option) => option.id === defaultModelCandidate)
  ) {
    models.unshift({ id: defaultModelCandidate, name: defaultModelCandidate, description: "管理员配置模型" });
  }
  if (models.length === 0) {
    models = [
      {
        id: providerDefaultModel,
        name: providerDefaultModel,
        ...(provider === "fish" ? { description: "Fish Audio 免费专业模型" } : {}),
      },
    ];
  }
  const defaultModel =
    defaultModelCandidate &&
    !hasProviderMismatch &&
    models.some((option) => option.id === defaultModelCandidate)
      ? defaultModelCandidate
      : models.find((option) => option.id === providerDefaultModel)?.id || models[0]?.id || providerDefaultModel;

  let voices = normalizeOptions(source.voices);
  let voiceMode = normalizeVoiceMode(source.voiceMode, provider, voices.length > 0);
  if (voiceMode === "select" && provider === "openai" && voices.length === 0) {
    voices = [...OPENAI_TTS_VOICES];
  }
  if (voiceMode === "select" && voices.length === 0) {
    voiceMode = "provider_default";
  }

  const defaultVoiceCandidate =
    typeof source.defaultVoice === "string" ? source.defaultVoice.trim() : "";
  const defaultVoice =
    voiceMode === "select"
      ? (defaultVoiceCandidate && voices.some((option) => option.id === defaultVoiceCandidate)
          ? defaultVoiceCandidate
          : voices[0]?.id)
      : undefined;

  return {
    provider,
    defaultModel,
    ...(defaultVoice ? { defaultVoice } : {}),
    models,
    voices,
    voiceMode,
  };
}
