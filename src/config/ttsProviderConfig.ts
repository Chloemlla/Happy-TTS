export type TtsProviderId = "openai" | "fish";

export interface TtsProviderOption {
  id: string;
  name: string;
  description?: string;
}

export interface TtsProviderRuntimeConfig {
  provider: TtsProviderId;
  defaultModel: string;
  fish: {
    apiKey: string;
    baseUrl: string;
    referenceId: string;
  };
}

export interface TtsProviderExecutionSnapshot {
  providerId: TtsProviderId;
  model: string;
  voice: string;
  referenceId?: string;
  baseUrl?: string;
  cacheIdentity: string;
}

export interface TtsProviderPublicConfig {
  provider: TtsProviderId;
  defaultModel: string;
  defaultVoice?: string;
  models: TtsProviderOption[];
  voices: TtsProviderOption[];
  voiceMode: "select" | "configured_reference" | "provider_default";
}

export const FISH_AUDIO_DEFAULT_BASE_URL = "https://api.fish.audio";
export const FISH_AUDIO_DEFAULT_MODEL = "s2.1-pro-free";
export const FISH_AUDIO_SUPPORTED_FORMATS = ["mp3"] as const;

export const OPENAI_TTS_MODELS: readonly TtsProviderOption[] = [
  { id: "tts-1", name: "TTS-1", description: "标准质量，速度快" },
  { id: "tts-1-hd", name: "TTS-1-HD", description: "高清质量，更自然" },
];

export const OPENAI_TTS_VOICES: readonly TtsProviderOption[] = [
  { id: "alloy", name: "Alloy", description: "中性、平衡的声音" },
  { id: "echo", name: "Echo", description: "男性、深沉的声音" },
  { id: "fable", name: "Fable", description: "英式口音、优雅" },
  { id: "onyx", name: "Onyx", description: "男性、深沉、戏剧性" },
  { id: "nova", name: "Nova", description: "女性、年轻、活泼" },
  { id: "shimmer", name: "Shimmer", description: "女性、温柔、轻柔" },
];

function resolveFishModel(value: string): string {
  const normalized = value.trim();
  if (!normalized || OPENAI_TTS_MODELS.some((item) => item.id === normalized)) {
    return FISH_AUDIO_DEFAULT_MODEL;
  }
  return normalized;
}

function resolveOpenAiModel(value: string, fallback = "tts-1"): string {
  const normalized = value.trim();
  if (normalized && normalized !== FISH_AUDIO_DEFAULT_MODEL) {
    return normalized;
  }

  const normalizedFallback = fallback.trim();
  return normalizedFallback && normalizedFallback !== FISH_AUDIO_DEFAULT_MODEL ? normalizedFallback : "tts-1";
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeString(value: unknown, fallback: string, maxLength = 2048): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function normalizeOptionalString(value: unknown, fallback: string, maxLength = 2048): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

const TTS_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

export function normalizeTtsModelId(value: unknown, fallback: string): string {
  const candidate = normalizeString(value, fallback, 256);
  return TTS_MODEL_ID_PATTERN.test(candidate) ? candidate : fallback;
}

export function normalizeTtsProviderId(value: unknown, fallback: TtsProviderId = "openai"): TtsProviderId {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "fish" || normalized === "openai" ? normalized : fallback;
}

export function normalizeFishAudioBaseUrl(value: unknown, fallback = FISH_AUDIO_DEFAULT_BASE_URL): string {
  const candidate = normalizeString(value, fallback);
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password) {
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function normalizeTtsProviderRuntimeConfig(
  value: unknown,
  defaults: TtsProviderRuntimeConfig,
): TtsProviderRuntimeConfig {
  const raw = asObject(value);
  const fish = asObject(raw.fish);
  const provider = normalizeTtsProviderId(raw.provider, defaults.provider);
  const fallbackModel =
    provider === "fish" ? FISH_AUDIO_DEFAULT_MODEL : resolveOpenAiModel(defaults.defaultModel, "tts-1");
  const normalizedModel = normalizeTtsModelId(raw.defaultModel, fallbackModel);

  return {
    provider,
    defaultModel:
      provider === "fish"
        ? resolveFishModel(normalizedModel)
        : resolveOpenAiModel(normalizedModel, fallbackModel),
    fish: {
      apiKey: normalizeString(fish.apiKey, defaults.fish.apiKey, 2048),
      baseUrl: normalizeFishAudioBaseUrl(fish.baseUrl, defaults.fish.baseUrl),
      referenceId: normalizeOptionalString(fish.referenceId, defaults.fish.referenceId, 512),
    },
  };
}

export function mergeTtsProviderAdminUpdate(
  current: TtsProviderRuntimeConfig,
  input: unknown,
): TtsProviderRuntimeConfig {
  const raw = asObject(input);
  const fish = asObject(raw.fish);
  const provider = normalizeTtsProviderId(raw.provider, current.provider);
  let defaultModel = normalizeOptionalString(raw.defaultModel, current.defaultModel, 256);
  if (!defaultModel) {
    throw new Error("TTS 默认模型不能为空");
  }
  if (!TTS_MODEL_ID_PATTERN.test(defaultModel)) {
    throw new Error("TTS 默认模型格式无效");
  }
  const openAiFallback =
    current.provider === "openai" ? resolveOpenAiModel(current.defaultModel, "tts-1") : "tts-1";
  defaultModel =
    provider === "fish" ? resolveFishModel(defaultModel) : resolveOpenAiModel(defaultModel, openAiFallback);

  let baseUrl = current.fish.baseUrl;
  if (Object.prototype.hasOwnProperty.call(fish, "baseUrl")) {
    const candidate = normalizeOptionalString(fish.baseUrl, "", 2048);
    if (!candidate) {
      throw new Error("Fish Audio Base URL 不能为空");
    }
    try {
      const parsed = new URL(candidate);
      if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
        throw new Error("invalid protocol or credentials");
      }
    } catch {
      throw new Error("Fish Audio Base URL 必须是有效的 HTTP 或 HTTPS 地址");
    }
    baseUrl = normalizeFishAudioBaseUrl(candidate, current.fish.baseUrl);
  }

  const referenceId = Object.prototype.hasOwnProperty.call(fish, "referenceId")
    ? normalizeOptionalString(fish.referenceId, "", 512)
    : current.fish.referenceId;
  const apiKey = normalizeOptionalString(fish.apiKey, "", 2048) || current.fish.apiKey;

  return {
    provider,
    defaultModel,
    fish: {
      apiKey,
      baseUrl,
      referenceId,
    },
  };
}

export function buildTtsProviderPublicConfig(
  runtimeConfig: TtsProviderRuntimeConfig,
  openAiDefaults: { model: string; voice: string },
): TtsProviderPublicConfig {
  if (runtimeConfig.provider === "fish") {
    const defaultModel = resolveFishModel(runtimeConfig.defaultModel);
    return {
      provider: "fish",
      defaultModel,
      models: [
        {
          id: defaultModel,
          name: defaultModel,
          description: "Fish Audio 管理员配置模型",
        },
      ],
      voices: [],
      voiceMode: runtimeConfig.fish.referenceId ? "configured_reference" : "provider_default",
    };
  }

  const configuredModel = resolveOpenAiModel(runtimeConfig.defaultModel, openAiDefaults.model || "tts-1");
  const models = [...OPENAI_TTS_MODELS];
  if (!models.some((item) => item.id === configuredModel)) {
    models.unshift({ id: configuredModel, name: configuredModel, description: "管理员配置模型" });
  }

  const defaultVoice = OPENAI_TTS_VOICES.some((item) => item.id === openAiDefaults.voice)
    ? openAiDefaults.voice
    : "alloy";

  return {
    provider: "openai",
    defaultModel: configuredModel,
    defaultVoice,
    models,
    voices: [...OPENAI_TTS_VOICES],
    voiceMode: "select",
  };
}

export function buildTtsProviderExecutionSnapshot(
  runtimeConfig: TtsProviderRuntimeConfig,
  input: { model?: string; voice?: string },
  openAiDefaults: { model: string; voice: string; baseUrl?: string },
): TtsProviderExecutionSnapshot {
  if (runtimeConfig.provider === "fish") {
    const model = resolveFishModel(runtimeConfig.defaultModel);
    const referenceId = runtimeConfig.fish.referenceId.trim();
    const voice = referenceId ? "configured_reference" : "provider_default";
    const baseUrl = normalizeFishAudioBaseUrl(runtimeConfig.fish.baseUrl);
    return {
      providerId: "fish",
      model,
      voice,
      ...(referenceId ? { referenceId } : {}),
      baseUrl,
      cacheIdentity: ["fish", model, voice, referenceId || "default", baseUrl].join("|"),
    };
  }

  const configuredModel = resolveOpenAiModel(runtimeConfig.defaultModel, openAiDefaults.model || "tts-1");
  const allowedModels = new Set([...OPENAI_TTS_MODELS.map((item) => item.id), configuredModel]);
  const requestedModel = typeof input.model === "string" ? input.model.trim() : "";
  const model = allowedModels.has(requestedModel) ? requestedModel : configuredModel;

  const allowedVoices = new Set(OPENAI_TTS_VOICES.map((item) => item.id));
  const configuredVoice = allowedVoices.has(openAiDefaults.voice) ? openAiDefaults.voice : "alloy";
  const requestedVoice = typeof input.voice === "string" ? input.voice.trim() : "";
  const voice = allowedVoices.has(requestedVoice) ? requestedVoice : configuredVoice;
  const baseUrl = (openAiDefaults.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");

  return {
    providerId: "openai",
    model,
    voice,
    baseUrl,
    cacheIdentity: ["openai", model, voice, baseUrl].join("|"),
  };
}
