import {
  EDGE_DEFAULT_BASE_URL,
  EDGE_DEFAULT_VOICE,
  EDGE_MODEL_ID,
  type TtsProviderExecutionSnapshot,
  type TtsProviderRuntimeConfig,
} from "../config/ttsProviderConfig";
import type { EdgeTtsClient } from "../tts/edge/edge.client";
import { EDGE_MAX_CHUNK_CHARS } from "../tts/edge/edge.protocol";
import { EDGE_MAX_CATALOG_SIZE, normalizeEdgeVoiceCatalog, resolveEdgeVoiceOptions } from "../tts/edge/edge.voices";
import { EDGE_BUILTIN_VOICE_OPTIONS } from "../tts/edge/edge.voices.snapshot";
import { EdgeTtsProvider } from "../tts/tts.edge-provider";
import type { TtsProviderRequest } from "../tts/tts.ports";

// assertAudioResponse 要求 mp3 以 ID3 标签或帧同步字开头，所以假音频必须带 ID3v2 头。
const ID3_HEADER = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(7)]);

function buildMp3(payload: string): Buffer {
  return Buffer.concat([ID3_HEADER, Buffer.from(payload)]);
}

function buildConfig(edge: Partial<TtsProviderRuntimeConfig["edge"]> = {}): TtsProviderRuntimeConfig {
  return {
    provider: "edge",
    defaultModel: EDGE_MODEL_ID,
    fish: { apiKey: "", baseUrl: "https://api.fish.audio", referenceId: "" },
    edge: {
      baseUrl: EDGE_DEFAULT_BASE_URL,
      defaultVoice: EDGE_DEFAULT_VOICE,
      voices: [],
      ...edge,
    },
  };
}

function buildExecution(overrides: Partial<TtsProviderExecutionSnapshot> = {}): TtsProviderExecutionSnapshot {
  return {
    providerId: "edge",
    model: EDGE_MODEL_ID,
    voice: EDGE_DEFAULT_VOICE,
    baseUrl: EDGE_DEFAULT_BASE_URL,
    cacheIdentity: ["edge", EDGE_MODEL_ID, EDGE_DEFAULT_VOICE, EDGE_DEFAULT_BASE_URL].join("|"),
    ...overrides,
  };
}

function buildProvider(synthesize: jest.Mock, config: TtsProviderRuntimeConfig = buildConfig()): EdgeTtsProvider {
  return new EdgeTtsProvider({ synthesize } as unknown as EdgeTtsClient, async () => config);
}

function buildRequest(overrides: Partial<TtsProviderRequest> = {}): TtsProviderRequest {
  return {
    text: "你好",
    model: EDGE_MODEL_ID,
    voice: EDGE_DEFAULT_VOICE,
    outputFormat: "mp3",
    speed: 1,
    providerExecution: buildExecution(),
    ...overrides,
  };
}

describe("EdgeTtsProvider", () => {
  it("rejects a request without a frozen Edge snapshot", async () => {
    const synthesize = jest.fn();
    const provider = buildProvider(synthesize);

    await expect(provider.synthesize(buildRequest({ providerExecution: undefined }))).rejects.toMatchObject({
      statusCode: 500,
      code: "TTS_PROVIDER_SNAPSHOT_MISSING",
      retryable: false,
    });
    await expect(
      provider.synthesize(buildRequest({ providerExecution: buildExecution({ providerId: "openai" }) })),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: "TTS_PROVIDER_SNAPSHOT_MISSING",
      retryable: false,
    });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("rejects an output format other than MP3", async () => {
    const synthesize = jest.fn();
    const provider = buildProvider(synthesize);

    await expect(provider.synthesize(buildRequest({ outputFormat: "wav" }))).rejects.toMatchObject({
      statusCode: 400,
      code: "TTS_OUTPUT_FORMAT_UNSUPPORTED",
      retryable: false,
    });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("rejects blank and over-long text", async () => {
    const synthesize = jest.fn();
    const provider = buildProvider(synthesize);

    await expect(provider.synthesize(buildRequest({ text: "   \n " }))).rejects.toMatchObject({
      statusCode: 400,
      code: "TTS_EMPTY_TEXT",
      retryable: false,
    });
    await expect(provider.synthesize(buildRequest({ text: "x".repeat(4097) }))).rejects.toMatchObject({
      statusCode: 400,
      code: "TTS_TEXT_TOO_LONG",
      retryable: false,
    });
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("synthesizes a short text in a single client call", async () => {
    const audio = buildMp3("edge-audio");
    const synthesize = jest.fn().mockResolvedValue({ audio, contentType: "audio/mpeg" });
    const provider = buildProvider(synthesize);
    const execution = buildExecution({ voice: "en-US-AriaNeural" });

    const response = await provider.synthesize(
      buildRequest({ voice: execution.voice, speed: 1.25, providerExecution: execution }),
    );

    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledWith({
      text: "你好",
      voice: "en-US-AriaNeural",
      speed: 1.25,
      baseUrl: EDGE_DEFAULT_BASE_URL,
    });
    expect(response).toEqual({
      provider: "edge",
      providerModel: EDGE_MODEL_ID,
      providerVoice: "en-US-AriaNeural",
      outputFormat: "mp3",
      audioBuffer: audio,
    });
  });

  it("falls back to the configured base url and voice when the snapshot omits them", async () => {
    const synthesize = jest.fn().mockResolvedValue({ audio: buildMp3("edge-audio"), contentType: "audio/mpeg" });
    const provider = buildProvider(
      synthesize,
      buildConfig({ baseUrl: "wss://speech.example.test/v1", defaultVoice: "en-GB-SoniaNeural" }),
    );

    const response = await provider.synthesize(
      buildRequest({
        model: "",
        voice: "",
        providerExecution: buildExecution({ model: "", voice: "", baseUrl: "" }),
      }),
    );

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ voice: "en-GB-SoniaNeural", baseUrl: "wss://speech.example.test/v1" }),
    );
    expect(response.providerModel).toBe(EDGE_MODEL_ID);
    expect(response.providerVoice).toBe("en-GB-SoniaNeural");
  });

  it("uses the built-in default voice when neither the snapshot nor the config has one", async () => {
    const synthesize = jest.fn().mockResolvedValue({ audio: buildMp3("edge-audio"), contentType: "audio/mpeg" });
    const provider = buildProvider(synthesize, buildConfig({ defaultVoice: "" }));

    const response = await provider.synthesize(
      buildRequest({ voice: "", providerExecution: buildExecution({ voice: "", baseUrl: "" }) }),
    );

    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({ voice: EDGE_DEFAULT_VOICE }));
    expect(response.providerVoice).toBe(EDGE_DEFAULT_VOICE);
  });

  it("splits a long text and strips the ID3 header of every following chunk", async () => {
    const firstAudio = buildMp3("first-chunk");
    const secondAudio = buildMp3("second-chunk");
    const synthesize = jest
      .fn()
      .mockResolvedValueOnce({ audio: firstAudio, contentType: "audio/mpeg" })
      .mockResolvedValueOnce({ audio: secondAudio, contentType: "audio/mpeg" });
    const provider = buildProvider(synthesize);
    const text = "a".repeat(EDGE_MAX_CHUNK_CHARS + 100);

    const response = await provider.synthesize(buildRequest({ text }));

    expect(synthesize).toHaveBeenCalledTimes(2);
    const chunkTexts = synthesize.mock.calls.map((call) => call[0].text);
    expect(chunkTexts).toEqual(["a".repeat(EDGE_MAX_CHUNK_CHARS), "a".repeat(100)]);
    expect(response.audioBuffer).toEqual(Buffer.concat([firstAudio, Buffer.from("second-chunk")]));
  });

  it("drops a following chunk that holds nothing but an ID3 header", async () => {
    const firstAudio = buildMp3("first-chunk");
    const synthesize = jest
      .fn()
      .mockResolvedValueOnce({ audio: firstAudio, contentType: "audio/mpeg" })
      .mockResolvedValueOnce({ audio: ID3_HEADER, contentType: "audio/mpeg" });
    const provider = buildProvider(synthesize);

    const response = await provider.synthesize(buildRequest({ text: "a".repeat(EDGE_MAX_CHUNK_CHARS + 100) }));

    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(response.audioBuffer).toEqual(firstAudio);
  });
});

describe("Edge 音色清单", () => {
  it("normalizes the raw upstream shape and derives display names", () => {
    expect(
      normalizeEdgeVoiceCatalog([
        {
          ShortName: "en-AU-NatashaNeural",
          LocaleName: "English (Australia)",
          Locale: "en-AU",
          Gender: "Female",
        },
        { ShortName: "en-AU-WilliamMultilingualNeural", LocaleName: "English (Australia)", Gender: "Male" },
        {
          ShortName: "zh-CN-XiaoxiaoNeural",
          LocaleName: "Chinese (Mandarin, Simplified)",
          Gender: "Female",
        },
      ]),
    ).toEqual([
      { id: "en-AU-NatashaNeural", name: "Natasha", description: "English (Australia) · 女" },
      {
        id: "en-AU-WilliamMultilingualNeural",
        name: "William Multilingual",
        description: "English (Australia) · 男",
      },
      { id: "zh-CN-XiaoxiaoNeural", name: "Xiaoxiao", description: "Chinese (Mandarin, Simplified) · 女" },
    ]);
  });

  it("accepts an already normalized catalog and dedupes by id", () => {
    expect(
      normalizeEdgeVoiceCatalog({
        voices: [
          { id: "en-US-AriaNeural", name: "Aria", description: "English (United States) · 女" },
          { id: "en-US-AriaNeural", name: "重复条目" },
          { id: "zh-CN-XiaoxiaoNeural" },
        ],
      }),
    ).toEqual([
      { id: "en-US-AriaNeural", name: "Aria", description: "English (United States) · 女" },
      { id: "zh-CN-XiaoxiaoNeural", name: "Xiaoxiao" },
    ]);
  });

  it("drops records that are not Edge voices", () => {
    expect(
      normalizeEdgeVoiceCatalog([
        { ShortName: "nova" },
        { id: "tts-1" },
        { ShortName: "zh-CN-Xiaoxiao" },
        {},
        null,
        "en-US-AriaNeural",
        42,
      ]),
    ).toEqual([]);
  });

  it("returns an empty catalog for payloads that carry no voice list", () => {
    expect(normalizeEdgeVoiceCatalog(null)).toEqual([]);
    expect(normalizeEdgeVoiceCatalog(undefined)).toEqual([]);
    expect(normalizeEdgeVoiceCatalog("en-US-AriaNeural")).toEqual([]);
    expect(normalizeEdgeVoiceCatalog({ voices: "nope" })).toEqual([]);
  });

  it("caps the catalog at the configured maximum size", () => {
    const oversized = Array.from({ length: EDGE_MAX_CATALOG_SIZE + 5 }, (_value, index) => ({
      id: `en-US-V${index}Neural`,
      name: `Voice ${index}`,
    }));

    const catalog = normalizeEdgeVoiceCatalog(oversized);

    expect(catalog).toHaveLength(EDGE_MAX_CATALOG_SIZE);
    expect(catalog[0]).toEqual({ id: "en-US-V0Neural", name: "Voice 0" });
  });

  it("returns copies of the configured catalog instead of the stored objects", () => {
    const configured = [{ id: "en-US-AriaNeural", name: "Aria" }];

    const resolved = resolveEdgeVoiceOptions(configured);

    expect(resolved).toEqual(configured);
    expect(resolved).not.toBe(configured);
    expect(resolved[0]).not.toBe(configured[0]);

    resolved[0].name = "changed";
    expect(configured[0].name).toBe("Aria");
  });

  it("falls back to the built-in snapshot when nothing was refreshed", () => {
    for (const configured of [undefined, []]) {
      const resolved = resolveEdgeVoiceOptions(configured);

      expect(resolved).toEqual(EDGE_BUILTIN_VOICE_OPTIONS);
      expect(resolved).toHaveLength(EDGE_BUILTIN_VOICE_OPTIONS.length);
      expect(resolved[0]).not.toBe(EDGE_BUILTIN_VOICE_OPTIONS[0]);
    }
  });
});
