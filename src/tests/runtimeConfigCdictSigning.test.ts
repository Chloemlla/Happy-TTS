const mockRuntimeConfigFindOne = jest.fn();
const mockRuntimeConfigFindOneAndUpdate = jest.fn();
const mockRuntimeConfigDeleteOne = jest.fn();
const mockMongoose = { connection: { readyState: 1 } };

let storedConfig: Record<string, unknown> | null = null;
let storedUpdatedAt: Date | undefined;

jest.mock("../services/mongoService", () => ({
  mongoose: mockMongoose,
}));

jest.mock("../models/runtimeConfigModel", () => ({
  RuntimeConfigModel: {
    findOne: (...args: unknown[]) => mockRuntimeConfigFindOne(...args),
    findOneAndUpdate: (...args: unknown[]) => mockRuntimeConfigFindOneAndUpdate(...args),
    deleteOne: (...args: unknown[]) => mockRuntimeConfigDeleteOne(...args),
  },
}));

jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { RuntimeConfigService } from "../services/runtimeConfigService";

function readResult() {
  return {
    lean: () => ({
      exec: jest.fn().mockImplementation(async () =>
        storedConfig ? { value: storedConfig, updatedAt: storedUpdatedAt } : null,
      ),
    }),
  };
}

describe("RuntimeConfigService CDict signing settings", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    storedConfig = null;
    storedUpdatedAt = undefined;
    mockMongoose.connection.readyState = 1;
    mockRuntimeConfigFindOne.mockImplementation(() => readResult());
    mockRuntimeConfigFindOneAndUpdate.mockImplementation(
      (_filter: unknown, update: { value: Record<string, unknown>; updatedAt: Date }) => ({
        exec: jest.fn().mockImplementation(async () => {
          storedConfig = update.value;
          storedUpdatedAt = update.updatedAt;
          return {};
        }),
      }),
    );
    mockRuntimeConfigDeleteOne.mockImplementation(() => ({
      exec: jest.fn().mockImplementation(async () => {
        storedConfig = null;
        storedUpdatedAt = undefined;
        return {};
      }),
    }));
    await RuntimeConfigService.deleteCdictSigningSetting();
  });

  it("persists settings, updates the cache, and masks both secrets", async () => {
    const currentSecret = "a".repeat(64);
    const previousSecret = "b".repeat(64);

    await RuntimeConfigService.setCdictSigningSetting({
      mode: "enforce",
      appSignSecret: currentSecret,
      appSignSecretPrev: previousSecret,
      maxDriftMs: 120000,
    });

    expect(RuntimeConfigService.getCachedConfig().cdictSigning).toEqual({
      mode: "enforce",
      appSignSecret: currentSecret,
      appSignSecretPrev: previousSecret,
      maxDriftMs: 120000,
    });
    await expect(RuntimeConfigService.getCdictSigningSetting()).resolves.toMatchObject({
      setting: {
        config: {
          mode: "enforce",
          appSignSecret: "aa***aaaa",
          appSignSecretPrev: "bb***bbbb",
          hasAppSignSecret: true,
          hasAppSignSecretPrev: true,
          maxDriftMs: 120000,
        },
      },
    });
  });

  it("preserves blank secret inputs and explicitly clears the previous secret", async () => {
    const currentSecret = "c".repeat(64);
    const previousSecret = "d".repeat(64);
    storedConfig = {
      mode: "soft",
      appSignSecret: currentSecret,
      appSignSecretPrev: previousSecret,
      maxDriftMs: 300000,
    };

    await RuntimeConfigService.setCdictSigningSetting({
      appSignSecret: "   ",
      appSignSecretPrev: "   ",
      clearAppSignSecretPrev: true,
    });

    expect(storedConfig).toMatchObject({
      appSignSecret: currentSecret,
      appSignSecretPrev: "",
    });
    expect(RuntimeConfigService.getCachedConfig().cdictSigning.appSignSecretPrev).toBe("");
  });

  it.each([
    [{ mode: "invalid" }, "CDICT_REQUEST_SIGNING"],
    [{ appSignSecret: "too-short" }, "appSignSecret"],
    [{ appSignSecretPrev: "too-short" }, "appSignSecretPrev"],
    [{ maxDriftMs: 999 }, "CDICT_SIG_MAX_DRIFT_MS"],
    [{ maxDriftMs: 86400001 }, "CDICT_SIG_MAX_DRIFT_MS"],
  ])("rejects invalid input without persisting it", async (input, message) => {
    await expect(RuntimeConfigService.setCdictSigningSetting(input)).rejects.toThrow(message);
    expect(mockRuntimeConfigFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
