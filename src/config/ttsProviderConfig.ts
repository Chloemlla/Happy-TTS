import {
  parseFishAudioCatalogCurl,
  normalizeFishAudioCatalogConfig,
  type FishAudioCatalogConfig,
} from "./fishAudioCatalog";
import { isEdgeVoiceId } from "../tts/edge/edge.protocol";
import { EDGE_BUILTIN_VOICE_OPTIONS } from "../tts/edge/edge.voices.snapshot";

export type TtsProviderId = "openai" | "fish" | "edge";

export interface TtsProviderOption {
  id: string;
  name: string;
  description?: string;
}

export interface EdgeTtsRuntimeConfig {
  baseUrl: string;
  defaultVoice: string;
  /** 管理员刷新的上游音色清单；为空表示使用内置快照。 */
  voices: TtsProviderOption[];
  voicesUpdatedAt?: string;
}

export interface TtsProviderRuntimeConfig {
  provider: TtsProviderId;
  defaultModel: string;
  fish: {
    apiKey: string;
    baseUrl: string;
    referenceId: string;
    catalog?: FishAudioCatalogConfig;
  };
  edge: EdgeTtsRuntimeConfig;
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

/** 微软 Edge 朗读接口。该提供商没有「模型」概念，model 仅作为历史记录与缓存标识。 */
export const EDGE_DEFAULT_BASE_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
export const EDGE_DEFAULT_VOICE = "zh-CN-XiaoxiaoNeural";
export const EDGE_MODEL_ID = "edge-readaloud-v1";
export const EDGE_SUPPORTED_FORMATS = ["mp3"] as const;

const EDGE_MAX_VOICE_CATALOG_SIZE = 1000;

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

/** 不是「某个提供商自己的」模型 ID：切到别的提供商时不能沿用。 */
function isForeignTtsModelId(value: string, provider: TtsProviderId): boolean {
  if (provider !== "fish" && value === FISH_AUDIO_DEFAULT_MODEL) return true;
  if (provider !== "edge" && value === EDGE_MODEL_ID) return true;
  return provider !== "openai" && OPENAI_TTS_MODELS.some((item) => item.id === value);
}

function resolveFishModel(value: string): string {
  const normalized = value.trim();
  if (!normalized || isForeignTtsModelId(normalized, "fish")) {
    return FISH_AUDIO_DEFAULT_MODEL;
  }
  return normalized;
}

function resolveOpenAiModel(value: string, fallback = "tts-1"): string {
  const normalized = value.trim();
  if (normalized && !isForeignTtsModelId(normalized, "openai")) {
    return normalized;
  }

  const normalizedFallback = fallback.trim();
  return normalizedFallback && !isForeignTtsModelId(normalizedFallback, "openai")
    ? normalizedFallback
    : "tts-1";
}

/** 微软语音只有一种「模型」，不随管理员输入变化。 */
function resolveEdgeModel(): string {
  return EDGE_MODEL_ID;
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
  return normalized === "fish" || normalized === "openai" || normalized === "edge" ? normalized : fallback;
}

export function normalizeEdgeBaseUrl(value: unknown, fallback = EDGE_DEFAULT_BASE_URL): string {
  const candidate = normalizeString(value, fallback);
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol === "ws:" || parsed.protocol === "wss:") && !parsed.username && !parsed.password) {
      return parsed.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function normalizeEdgeVoiceId(value: unknown, fallback = EDGE_DEFAULT_VOICE): string {
  return isEdgeVoiceId(value) ? (value as string).trim() : fallback;
}

function normalizeEdgeVoiceCatalog(value: unknown): TtsProviderOption[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, TtsProviderOption>();
  for (const entry of value) {
    if (unique.size >= EDGE_MAX_VOICE_CATALOG_SIZE) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!isEdgeVoiceId(id) || unique.has(id)) continue;
    const name = normalizeString(raw.name, id, 128);
    const description = normalizeOptionalString(raw.description, "", 200);
    unique.set(id, description ? { id, name, description } : { id, name });
  }
  return Array.from(unique.values());
}

function normalizeEdgeStoredConfig(raw: unknown, defaults: EdgeTtsRuntimeConfig): EdgeTtsRuntimeConfig {
  const edge = asObject(raw);
  const voicesUpdatedAt = normalizeOptionalString(edge.voicesUpdatedAt, "", 64);
  const hasVoices = Array.isArray(edge.voices);
  return {
    baseUrl: normalizeEdgeBaseUrl(edge.baseUrl, defaults.baseUrl),
    defaultVoice: normalizeEdgeVoiceId(edge.defaultVoice, defaults.defaultVoice),
    voices: hasVoices ? normalizeEdgeVoiceCatalog(edge.voices) : defaults.voices,
    ...(voicesUpdatedAt ? { voicesUpdatedAt } : {}),
  };
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
    provider === "fish"
      ? FISH_AUDIO_DEFAULT_MODEL
      : provider === "edge"
        ? EDGE_MODEL_ID
        : resolveOpenAiModel(defaults.defaultModel, "tts-1");
  const normalizedModel = normalizeTtsModelId(raw.defaultModel, fallbackModel);

  return {
    provider,
    defaultModel:
      provider === "fish"
        ? resolveFishModel(normalizedModel)
        : provider === "edge"
          ? resolveEdgeModel()
          : resolveOpenAiModel(normalizedModel, fallbackModel),
    fish: {
      apiKey: normalizeString(fish.apiKey, defaults.fish.apiKey, 2048),
      baseUrl: normalizeFishAudioBaseUrl(fish.baseUrl, defaults.fish.baseUrl),
      referenceId: normalizeOptionalString(fish.referenceId, defaults.fish.referenceId, 512),
      catalog: normalizeFishAudioCatalogConfig(fish.catalog ?? defaults.fish.catalog),
    },
    edge: normalizeEdgeStoredConfig(raw.edge, defaults.edge),
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
    provider === "fish"
      ? resolveFishModel(defaultModel)
      : provider === "edge"
        ? resolveEdgeModel()
        : resolveOpenAiModel(defaultModel, openAiFallback);

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
  const catalogInput = Object.prototype.hasOwnProperty.call(fish, "catalog")
    ? fish.catalog
    : current.fish.catalog;
  const currentCatalog = current.fish.catalog || {};
  let catalog = normalizeFishAudioCatalogConfig(catalogInput);
  if (Object.prototype.hasOwnProperty.call(fish, "modelCurl")) {
    const modelCurl = typeof fish.modelCurl === "string" ? fish.modelCurl.trim() : "";
    catalog = {
      ...catalog,
      ...(modelCurl
        ? { modelRequest: parseFishAudioCatalogCurl(modelCurl, currentCatalog.modelRequest, "/model/web") }
        : { modelRequest: undefined }),
    };
  }
  if (Object.prototype.hasOwnProperty.call(fish, "defaultVoicesCurl")) {
    const defaultVoicesCurl = typeof fish.defaultVoicesCurl === "string" ? fish.defaultVoicesCurl.trim() : "";
    catalog = {
      ...catalog,
      ...(defaultVoicesCurl
        ? {
            defaultVoicesRequest: parseFishAudioCatalogCurl(
              defaultVoicesCurl,
              currentCatalog.defaultVoicesRequest,
              "/model/default-voices",
            ),
          }
        : { defaultVoicesRequest: undefined }),
    };
  }

  const edge = asObject(raw.edge);
  let edgeBaseUrl = current.edge.baseUrl;
  if (Object.prototype.hasOwnProperty.call(edge, "baseUrl")) {
    const candidate = normalizeOptionalString(edge.baseUrl, "", 2048);
    if (!candidate) {
      throw new Error("微软语音接口地址不能为空");
    }
    try {
      const parsed = new URL(candidate);
      if (
        (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("invalid protocol or credentials");
      }
    } catch {
      throw new Error("微软语音接口地址必须是有效的 ws 或 wss 地址");
    }
    edgeBaseUrl = normalizeEdgeBaseUrl(candidate, current.edge.baseUrl);
  }

  let edgeDefaultVoice = current.edge.defaultVoice;
  if (Object.prototype.hasOwnProperty.call(edge, "defaultVoice")) {
    const candidate = normalizeOptionalString(edge.defaultVoice, "", 128);
    if (!candidate || !isEdgeVoiceId(candidate)) {
      throw new Error("微软语音默认音色格式无效");
    }
    edgeDefaultVoice = candidate;
  }

  return {
    provider,
    defaultModel,
    fish: {
      apiKey,
      baseUrl,
      referenceId,
      catalog,
    },
    // 音色清单只由刷新接口写入，管理端保存不覆盖。
    edge: {
      baseUrl: edgeBaseUrl,
      defaultVoice: edgeDefaultVoice,
      voices: current.edge.voices,
      ...(current.edge.voicesUpdatedAt ? { voicesUpdatedAt: current.edge.voicesUpdatedAt } : {}),
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

  if (runtimeConfig.provider === "edge") {
    const voices = runtimeConfig.edge.voices.length
      ? runtimeConfig.edge.voices.map((entry) => ({ ...entry }))
      : EDGE_BUILTIN_VOICE_OPTIONS.map((entry) => ({ ...entry }));
    const configuredVoice = runtimeConfig.edge.defaultVoice;
    return {
      provider: "edge",
      defaultModel: EDGE_MODEL_ID,
      defaultVoice: voices.some((item) => item.id === configuredVoice)
        ? configuredVoice
        : EDGE_DEFAULT_VOICE,
      models: [
        { id: EDGE_MODEL_ID, name: "Edge 朗读", description: "微软内置语音，无需额外密钥" },
      ],
      voices,
      voiceMode: "select",
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
    const requestedReferenceId = typeof input.voice === "string" ? input.voice.trim() : "";
    const referenceId = requestedReferenceId || runtimeConfig.fish.referenceId.trim();
    const safeReferenceId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(referenceId) ? referenceId : "";
    const voice = safeReferenceId ? "configured_reference" : "provider_default";
    const baseUrl = normalizeFishAudioBaseUrl(runtimeConfig.fish.baseUrl);
    return {
      providerId: "fish",
      model,
      voice,
      ...(safeReferenceId ? { referenceId: safeReferenceId } : {}),
      baseUrl,
      cacheIdentity: ["fish", model, voice, safeReferenceId || "default", baseUrl].join("|"),
    };
  }

  if (runtimeConfig.provider === "edge") {
    const requestedVoice = typeof input.voice === "string" ? input.voice.trim() : "";
    const voice = isEdgeVoiceId(requestedVoice) ? requestedVoice : runtimeConfig.edge.defaultVoice;
    const baseUrl = normalizeEdgeBaseUrl(runtimeConfig.edge.baseUrl);
    return {
      providerId: "edge",
      model: EDGE_MODEL_ID,
      voice,
      baseUrl,
      cacheIdentity: ["edge", EDGE_MODEL_ID, voice, baseUrl].join("|"),
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
