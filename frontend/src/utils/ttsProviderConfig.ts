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
export const EDGE_DEFAULT_TTS_MODEL = "edge-readaloud-v1";
export const EDGE_DEFAULT_TTS_BASE_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
export const EDGE_DEFAULT_TTS_VOICE = "zh-CN-XiaoxiaoNeural";
export const EDGE_TTS_OUTPUT_FORMATS = ["mp3"] as const;

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

const FALLBACK_TTS_PROVIDER_BASE: TtsProviderPublicConfig = {
  provider: "openai",
  defaultModel: OPENAI_DEFAULT_TTS_MODEL,
  defaultVoice: "nova",
  models: OPENAI_TTS_MODELS,
  voices: OPENAI_TTS_VOICES,
  voiceMode: "select",
};

// providers 指向同一份基础配置而非自身，否则会形成自引用；主提供商排第一。
// 回退路径下 TTSForm 的切换控件靠这个列表取到“当前提供商”。
export const FALLBACK_TTS_PROVIDER_CONFIG: TtsProviderPublicConfig = {
  ...FALLBACK_TTS_PROVIDER_BASE,
  providers: [FALLBACK_TTS_PROVIDER_BASE],
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
  return value === "openai" || value === "fish" || value === "edge" ? value : null;
}

/** 不是该提供商自己的模型 ID：切到别的提供商时不能沿用。 */
export function isForeignTtsModelId(value: string, provider: TtsProviderId): boolean {
  if (provider !== "fish" && value === FISH_DEFAULT_TTS_MODEL) return true;
  if (provider !== "edge" && value === EDGE_DEFAULT_TTS_MODEL) return true;
  return provider !== "openai" && OPENAI_TTS_MODELS.some((option) => option.id === value);
}

export function defaultModelForProvider(provider: TtsProviderId): string {
  if (provider === "fish") return FISH_DEFAULT_TTS_MODEL;
  if (provider === "edge") return EDGE_DEFAULT_TTS_MODEL;
  return OPENAI_DEFAULT_TTS_MODEL;
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
  const base: TtsProviderPublicConfig = {
    ...FALLBACK_TTS_PROVIDER_BASE,
    models: [...FALLBACK_TTS_PROVIDER_BASE.models],
    voices: [...FALLBACK_TTS_PROVIDER_BASE.voices],
  };
  return { ...base, providers: [base] };
}

const TTS_PROVIDER_LABELS: Record<TtsProviderId, string> = {
  openai: "OpenAI",
  fish: "Fish Audio",
  edge: "微软语音",
};

/** 提供商的中文展示名，供 TTSForm 的切换控件与当前提供商标签共用。 */
export function getTtsProviderLabel(provider: TtsProviderId): string {
  return TTS_PROVIDER_LABELS[provider];
}

export function getTtsOutputFormats(provider: TtsProviderId): readonly string[] {
  if (provider === "fish") return FISH_TTS_OUTPUT_FORMATS;
  if (provider === "edge") return EDGE_TTS_OUTPUT_FORMATS;
  return OPENAI_TTS_OUTPUT_FORMATS;
}

export function supportsTtsSpeed(provider: TtsProviderId): boolean {
  return provider === "openai" || provider === "edge";
}

export function isTtsProviderConfigPayload(payload: unknown): boolean {
  const source = unwrapConfig(payload);
  return Boolean(source && normalizeProvider(source.provider));
}

/** 按单个提供商归一化：修正默认值、模型与音色列表。provider 非法时返回 null。 */
export function normalizeTtsProviderEntry(value: unknown): TtsProviderPublicConfig | null {
  if (!isRecord(value)) return null;
  const provider = normalizeProvider(value.provider);
  if (!provider) return null;

  const providerDefaultModel = defaultModelForProvider(provider);
  const defaultModelCandidate =
    typeof value.defaultModel === "string" ? value.defaultModel.trim() : "";
  const hasProviderMismatch = isForeignTtsModelId(defaultModelCandidate, provider);
  let models = normalizeOptions(value.models).filter(
    (option) => !isForeignTtsModelId(option.id, provider),
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
        ...(provider === "fish"
          ? { description: "Fish Audio 免费专业模型" }
          : provider === "edge"
            ? { description: "微软内置语音，无需额外密钥" }
            : {}),
      },
    ];
  }
  const defaultModel =
    defaultModelCandidate &&
    !hasProviderMismatch &&
    models.some((option) => option.id === defaultModelCandidate)
      ? defaultModelCandidate
      : models.find((option) => option.id === providerDefaultModel)?.id || models[0]?.id || providerDefaultModel;

  let voices = normalizeOptions(value.voices);
  let voiceMode = normalizeVoiceMode(value.voiceMode, provider, voices.length > 0);
  if (voiceMode === "select" && provider === "openai" && voices.length === 0) {
    voices = [...OPENAI_TTS_VOICES];
  }
  if (voiceMode === "select" && voices.length === 0) {
    voiceMode = "provider_default";
  }

  const defaultVoiceCandidate =
    typeof value.defaultVoice === "string" ? value.defaultVoice.trim() : "";
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

export function normalizeTtsProviderConfig(payload: unknown): TtsProviderPublicConfig {
  const source = unwrapConfig(payload);
  const primary = normalizeTtsProviderEntry(source);
  if (!primary) return cloneFallback();

  // 主配置恒排第一：调用方（TTSForm）用它作切换控件的初值，
  // 这样即便后端漏发主提供商或数组顺序异常，控件也一定包含当前提供商。
  const providers: TtsProviderPublicConfig[] = [primary];
  const seen = new Set<TtsProviderId>([primary.provider]);
  const rawProviders = source?.providers;
  if (Array.isArray(rawProviders)) {
    for (const candidate of rawProviders) {
      const entry = normalizeTtsProviderEntry(candidate);
      if (!entry || seen.has(entry.provider)) continue;
      seen.add(entry.provider);
      providers.push(entry);
    }
  }

  return { ...primary, providers };
}
