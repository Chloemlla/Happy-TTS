import {
  FISH_AUDIO_DEFAULT_BASE_URL,
  FISH_AUDIO_SUPPORTED_FORMATS,
  type TtsProviderRuntimeConfig,
} from "../config/ttsProviderConfig";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import { TtsGenerationError } from "./tts.errors";
import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "./tts.ports";

const FISH_AUDIO_TIMEOUT_MS = 45_000;

type FishConfigLoader = () => Promise<TtsProviderRuntimeConfig>;
type FetchLike = typeof fetch;

function buildFishTtsUrl(baseUrl: string): string {
  const normalized = (baseUrl || FISH_AUDIO_DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (normalized.endsWith("/v1/tts")) return normalized;
  if (normalized.endsWith("/v1")) return `${normalized}/tts`;
  return `${normalized}/v1/tts`;
}

function mapFishResponseError(status: number): TtsGenerationError {
  if (status === 400 || status === 422) {
    return new TtsGenerationError("Fish Audio 请求参数无效", 400, "TTS_BAD_REQUEST", false);
  }
  if (status === 401 || status === 403) {
    return new TtsGenerationError("Fish Audio 鉴权失败，请联系管理员检查配置", 502, "TTS_AUTH_FAILED", false);
  }
  if (status === 429) {
    return new TtsGenerationError("Fish Audio 请求过于频繁，请稍后重试", 429, "TTS_RATE_LIMITED", true);
  }
  if (status >= 500) {
    return new TtsGenerationError("Fish Audio 服务暂时不可用", 502, "TTS_UPSTREAM_UNAVAILABLE", true);
  }
  return new TtsGenerationError("Fish Audio 请求失败", 502, "TTS_PROVIDER_ERROR", false);
}

export class FishAudioTtsProvider implements TtsProvider {
  public readonly providerId = "fish";

  constructor(
    private readonly loadConfig: FishConfigLoader = () => RuntimeConfigService.getRawTtsProviderConfig(),
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  public async synthesize(request: TtsProviderRequest): Promise<TtsProviderResponse> {
    const execution = request.providerExecution;
    if (!execution || execution.providerId !== "fish") {
      throw new TtsGenerationError("Fish Audio 执行配置缺失", 500, "TTS_PROVIDER_SNAPSHOT_MISSING", false);
    }

    if (!(FISH_AUDIO_SUPPORTED_FORMATS as readonly string[]).includes(request.outputFormat)) {
      throw new TtsGenerationError(
        "Fish Audio 当前仅支持 MP3 输出格式",
        400,
        "TTS_OUTPUT_FORMAT_UNSUPPORTED",
        false,
      );
    }

    const runtimeConfig = await this.loadConfig();
    const apiKey = runtimeConfig.fish.apiKey.trim();
    if (!apiKey) {
      throw new TtsGenerationError(
        "Fish Audio 尚未配置，请联系管理员设置 API Key",
        503,
        "TTS_PROVIDER_NOT_CONFIGURED",
        false,
      );
    }

    const body: { text: string; format: string; reference_id?: string } = {
      text: request.text,
      format: request.outputFormat,
    };
    if (execution.referenceId) {
      body.reference_id = execution.referenceId;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(buildFishTtsUrl(execution.baseUrl || runtimeConfig.fish.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          model: execution.model,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FISH_AUDIO_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new TtsGenerationError("Fish Audio 生成超时，请稍后重试", 504, "TTS_UPSTREAM_TIMEOUT", true);
      }
      throw new TtsGenerationError("Fish Audio 服务暂时不可用", 502, "TTS_UPSTREAM_UNAVAILABLE", true);
    }

    if (!response.ok) {
      throw mapFishResponseError(response.status);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!contentType.startsWith("audio/")) {
      throw new TtsGenerationError(
        "Fish Audio 返回了非音频响应",
        502,
        "TTS_INVALID_PROVIDER_RESPONSE",
        true,
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    if (audioBuffer.length === 0) {
      throw new TtsGenerationError("Fish Audio 返回了空音频", 502, "TTS_EMPTY_PROVIDER_RESPONSE", true);
    }

    return {
      provider: this.providerId,
      providerModel: execution.model,
      providerVoice: execution.voice,
      outputFormat: request.outputFormat,
      audioBuffer,
    };
  }
}
