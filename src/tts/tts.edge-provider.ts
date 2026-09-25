import {
  EDGE_DEFAULT_VOICE,
  EDGE_MODEL_ID,
  EDGE_SUPPORTED_FORMATS,
  type TtsProviderRuntimeConfig,
} from "../config/ttsProviderConfig";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import { EdgeTtsClient } from "./edge/edge.client";
import { EDGE_AUDIO_CONTENT_TYPE, EDGE_MAX_CHUNK_CHARS, splitEdgeText } from "./edge/edge.protocol";
import { TtsGenerationError } from "./tts.errors";
import { assertAudioResponse } from "./tts.provider";
import type { TtsProvider, TtsProviderRequest, TtsProviderResponse } from "./tts.ports";

type EdgeConfigLoader = () => Promise<TtsProviderRuntimeConfig>;

/**
 * 拼接多块 MP3 时，后续块可能带 ID3v2 标签，会让部分播放器把标签当成音频数据。
 * 这里只剥离非首块的前导 ID3v2（含可选 footer）。返回值可能为空，调用方自行过滤。
 */
function stripLeadingId3(buffer: Buffer): Buffer {
  if (buffer.length < 10 || buffer.subarray(0, 3).toString("latin1") !== "ID3") {
    return buffer;
  }
  const size =
    ((buffer[6] as number) << 21) |
    ((buffer[7] as number) << 14) |
    ((buffer[8] as number) << 7) |
    (buffer[9] as number);
  const footerLength = ((buffer[5] as number) & 0x10) === 0x10 ? 10 : 0;
  const total = 10 + size + footerLength;
  return total < buffer.length ? buffer.subarray(total) : Buffer.alloc(0);
}

export class EdgeTtsProvider implements TtsProvider {
  public readonly providerId = "edge";

  constructor(
    private readonly client: EdgeTtsClient = new EdgeTtsClient(),
    private readonly loadConfig: EdgeConfigLoader = () =>
      RuntimeConfigService.getRawTtsProviderConfig(),
  ) {}

  public async synthesize(request: TtsProviderRequest): Promise<TtsProviderResponse> {
    const execution = request.providerExecution;
    if (!execution || execution.providerId !== "edge") {
      throw new TtsGenerationError("微软内置语音执行配置缺失", 500, "TTS_PROVIDER_SNAPSHOT_MISSING", false);
    }

    if (!(EDGE_SUPPORTED_FORMATS as readonly string[]).includes(request.outputFormat)) {
      throw new TtsGenerationError(
        "微软内置语音当前仅支持 MP3 输出格式",
        400,
        "TTS_OUTPUT_FORMAT_UNSUPPORTED",
        false,
      );
    }

    const text = String(request.text ?? "");
    if (!text.trim()) {
      throw new TtsGenerationError("文本不能为空", 400, "TTS_EMPTY_TEXT", false);
    }
    if (text.length > 4096) {
      throw new TtsGenerationError("文本长度不能超过4096个字符", 400, "TTS_TEXT_TOO_LONG", false);
    }

    const runtimeConfig = await this.loadConfig();
    const baseUrl = execution.baseUrl || runtimeConfig.edge.baseUrl;
    const voice = execution.voice || runtimeConfig.edge.defaultVoice || EDGE_DEFAULT_VOICE;

    const chunks = splitEdgeText(text, EDGE_MAX_CHUNK_CHARS);
    const parts: Buffer[] = [];
    let contentType = EDGE_AUDIO_CONTENT_TYPE;

    for (const [index, chunk] of chunks.entries()) {
      const result = await this.client.synthesize({
        text: chunk,
        voice,
        speed: request.speed,
        baseUrl,
      });
      if (index === 0) {
        contentType = result.contentType || EDGE_AUDIO_CONTENT_TYPE;
        parts.push(result.audio);
        continue;
      }
      const audio = stripLeadingId3(result.audio);
      if (audio.length > 0) parts.push(audio);
    }

    const audioBuffer = Buffer.concat(parts);
    assertAudioResponse(contentType, audioBuffer, request.outputFormat);

    return {
      provider: this.providerId,
      providerModel: execution.model || EDGE_MODEL_ID,
      providerVoice: voice,
      outputFormat: request.outputFormat,
      audioBuffer,
    };
  }
}
