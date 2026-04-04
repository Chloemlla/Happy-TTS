import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import axios from "axios";
import { config } from "../config/config";
import {
  buildDeepLXTranslateUrl,
  getDeepLXConfigSummary,
  isDeepLXConfigured,
  translateWithDeepLX,
} from "../services/deeplxService";

jest.mock("axios");

describe("deeplxService", () => {
  const originalConfig = {
    ...config.deeplx,
  };

  beforeEach(() => {
    Object.assign(config.deeplx, {
      baseUrl: "https://api.deeplx.org",
      apiKey: "demo-key",
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.assign(config.deeplx, originalConfig);
  });

  it("requires an API key for the official hosted endpoint", () => {
    Object.assign(config.deeplx, {
      baseUrl: "https://api.deeplx.org",
      apiKey: "",
    });

    expect(isDeepLXConfigured()).toBe(false);
    expect(getDeepLXConfigSummary()).toEqual({
      enabled: false,
      requiresApiKey: true,
      baseUrl: "https://api.deeplx.org",
      endpointPath: "https://api.deeplx.org/<api-key>/translate",
    });
  });

  it("rejects non-official DeepLX hosts", () => {
    Object.assign(config.deeplx, {
      baseUrl: "https://deeplx.internal.example.com/",
      apiKey: "",
    });

    expect(isDeepLXConfigured()).toBe(false);
    expect(() => buildDeepLXTranslateUrl()).toThrow(
      "DeepLX base URL must use https://api.deeplx.org",
    );
  });

  it("builds the hosted translate URL with the configured API key", () => {
    Object.assign(config.deeplx, {
      baseUrl: "https://api.deeplx.org/",
      apiKey: "demo-key",
    });

    expect(buildDeepLXTranslateUrl()).toBe("https://api.deeplx.org/demo-key/translate");
  });

  it("normalizes a direct DeepLX translation payload", async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: {
        data: "你好，世界",
        source_lang: "EN",
        target_lang: "ZH",
        alternatives: ["你好 世界", "您好，世界"],
      },
    });

    const result = await translateWithDeepLX({
      text: "Hello, world",
      sourceLang: "auto",
      targetLang: "zh",
    });

    expect(result).toEqual({
      translatedText: "你好，世界",
      alternatives: ["你好 世界", "您好，世界"],
      sourceLang: "EN",
      targetLang: "ZH",
    });
    expect(axios.post).toHaveBeenCalledWith(
      "https://api.deeplx.org/demo-key/translate",
      {
        text: "Hello, world",
        source_lang: "auto",
        target_lang: "ZH",
      },
      expect.objectContaining({
        timeout: 20000,
      }),
    );
  });
});
