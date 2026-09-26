const mockRuntimeConfigFindOne = jest.fn();
const mockRuntimeConfigFindOneAndUpdate = jest.fn();
const mockLoggerWarn = jest.fn();
const mockMongoose = {
  connection: {
    readyState: 1,
  },
};

jest.mock("../services/mongoService", () => ({
  mongoose: mockMongoose,
}));

jest.mock("../models/runtimeConfigModel", () => ({
  RuntimeConfigModel: {
    findOne: (...args: unknown[]) => mockRuntimeConfigFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockRuntimeConfigFindOneAndUpdate(...args),
  },
}));

jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

import {
  EDGE_DEFAULT_BASE_URL,
  EDGE_DEFAULT_VOICE,
  FISH_AUDIO_DEFAULT_BASE_URL,
  FISH_AUDIO_DEFAULT_MODEL,
} from "../config/ttsProviderConfig";
import { RuntimeConfigService } from "../services/runtimeConfigService";
import { EDGE_BUILTIN_VOICE_OPTIONS } from "../tts/edge/edge.voices.snapshot";

function mockReadResult(value: unknown) {
  return {
    lean: () => ({
      exec: jest.fn().mockResolvedValue(value),
    }),
  };
}

function mockReadFailure(error: Error) {
  return {
    lean: () => ({
      exec: jest.fn().mockRejectedValue(error),
    }),
  };
}

describe("RuntimeConfigService TTS provider fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMongoose.connection.readyState = 1;
    mockRuntimeConfigFindOne.mockReturnValue(mockReadResult(null));
    mockRuntimeConfigFindOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({}),
    });
  });

  it("keeps the loaded TTS provider cache when a Mongo read throws", async () => {
    await RuntimeConfigService.setTtsProviderSetting({
      provider: "fish",
      defaultModel: FISH_AUDIO_DEFAULT_MODEL,
      fish: {
        apiKey: "stored-fish-key",
        baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
        referenceId: "reference-a",
      },
    });

    const readError = new Error("temporary Mongo read failure");
    mockRuntimeConfigFindOne.mockReturnValue(mockReadFailure(readError));

    // 这里不再用整块 toEqual：TtsProviderRuntimeConfig 是会长大的结构（cd66146f 多提供商
    // 并存刚加了 enabledProviders），整块相等等于每加一个字段就全组红。
    // 关键值照旧精确钉，只对“新增字段”宽容。
    const rawConfig = await RuntimeConfigService.getRawTtsProviderConfig();
    expect(rawConfig).toEqual(
      expect.objectContaining({
        provider: "fish",
        defaultModel: FISH_AUDIO_DEFAULT_MODEL,
        fish: {
          apiKey: "stored-fish-key",
          baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
          referenceId: "reference-a",
          catalog: {},
        },
        edge: {
          baseUrl: EDGE_DEFAULT_BASE_URL,
          defaultVoice: EDGE_DEFAULT_VOICE,
          voices: [],
        },
      }),
    );
    // 新字段单独验一次：当前生效的提供商必须在 enabledProviders 里（读失败走缓存时也不能丢）。
    expect(rawConfig?.enabledProviders).toEqual(expect.arrayContaining(["fish"]));

    const setting = await RuntimeConfigService.getTtsProviderSetting();
    expect(setting.config).toEqual(
      expect.objectContaining({
        provider: "fish",
        defaultModel: FISH_AUDIO_DEFAULT_MODEL,
        fish: {
          baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
          referenceId: "reference-a",
          apiKeyConfigured: true,
          modelCurl: "",
          defaultVoicesCurl: "",
        },
        edge: {
          baseUrl: EDGE_DEFAULT_BASE_URL,
          defaultVoice: EDGE_DEFAULT_VOICE,
          voiceSource: "snapshot",
          voiceCount: EDGE_BUILTIN_VOICE_OPTIONS.length,
        },
        updatedAt: undefined,
      }),
    );
    // 管理端设定页同样不能漏掉多提供商列表（它是页面渲染的开关）。
    expect(setting.config?.enabledProviders).toEqual(expect.arrayContaining(["fish"]));

    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[RuntimeConfig] Failed to read runtime configuration",
      expect.objectContaining({
        configKey: "TTS_PROVIDER",
        error: "temporary Mongo read failure",
        fallback: "cache-or-defaults",
      }),
    );
  });

  it("uses defaults when Mongo confirms that the TTS provider document is absent", async () => {
    await RuntimeConfigService.setTtsProviderSetting({
      provider: "fish",
      defaultModel: FISH_AUDIO_DEFAULT_MODEL,
      fish: {
        apiKey: "stored-fish-key",
        baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
        referenceId: "reference-a",
      },
    });

    mockRuntimeConfigFindOne.mockReturnValue(mockReadResult(null));

    await expect(RuntimeConfigService.getRawTtsProviderConfig()).resolves.toMatchObject({
      provider: "openai",
    });
  });

  it("reports a stored Edge voice catalog as refreshed and drops ids that are not Edge voices", async () => {
    mockRuntimeConfigFindOne.mockReturnValue(
      mockReadResult({
        value: {
          provider: "edge",
          defaultModel: "edge-readaloud-v1",
          fish: {
            apiKey: "stored-fish-key",
            baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
            referenceId: "reference-a",
          },
          edge: {
            baseUrl: EDGE_DEFAULT_BASE_URL,
            defaultVoice: EDGE_DEFAULT_VOICE,
            voices: [
              { id: "en-US-AriaNeural", name: "Aria" },
              { id: "nova", name: "Nova" },
              { id: "zh-CN-XiaoxiaoNeural" },
            ],
            voicesUpdatedAt: "2026-09-25T00:00:00.000Z",
          },
        },
      }),
    );

    const setting = await RuntimeConfigService.getTtsProviderSetting();

    expect(setting.config.edge).toEqual({
      baseUrl: EDGE_DEFAULT_BASE_URL,
      defaultVoice: EDGE_DEFAULT_VOICE,
      voiceSource: "refreshed",
      voiceCount: 2,
      voicesUpdatedAt: "2026-09-25T00:00:00.000Z",
    });
  });
});
