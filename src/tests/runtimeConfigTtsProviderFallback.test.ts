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
  FISH_AUDIO_DEFAULT_BASE_URL,
  FISH_AUDIO_DEFAULT_MODEL,
} from "../config/ttsProviderConfig";
import { RuntimeConfigService } from "../services/runtimeConfigService";

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

    await expect(RuntimeConfigService.getRawTtsProviderConfig()).resolves.toEqual({
      provider: "fish",
      defaultModel: FISH_AUDIO_DEFAULT_MODEL,
      fish: {
        apiKey: "stored-fish-key",
        baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
        referenceId: "reference-a",
      },
    });
    await expect(RuntimeConfigService.getTtsProviderSetting()).resolves.toEqual({
      config: {
        provider: "fish",
        defaultModel: FISH_AUDIO_DEFAULT_MODEL,
        fish: {
          baseUrl: FISH_AUDIO_DEFAULT_BASE_URL,
          referenceId: "reference-a",
          apiKeyConfigured: true,
        },
        updatedAt: undefined,
      },
    });

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
});
