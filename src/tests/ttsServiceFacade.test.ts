import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import path from "node:path";
import { generateSpeech } from "../services/tts";
import { TtsService as FacadeTtsService } from "../services/ttsService";
import { TtsService } from "../tts/tts.service";
import type { TtsRequest } from "../tts/tts.service";

jest.mock("../tts/tts.service", () => {
  const generate = jest.fn();
  class FakeTtsService {
    generateSpeech = generate;
  }
  return { TtsService: FakeTtsService, __generate: generate };
});

const generate = (jest.requireMock("../tts/tts.service") as any).__generate as jest.Mock;

const options = {
  text: "你好",
  model: "tts-1",
  voice: "alloy",
  outputFormat: "mp3",
} as const;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("services/tts generateSpeech", () => {
  it("未显式给 speed 时兜底 1.0", async () => {
    generate.mockResolvedValue({ fileName: "abc.mp3" });

    await expect(generateSpeech(options)).resolves.toBe(path.join(process.cwd(), "finish", "abc.mp3"));

    expect(generate).toHaveBeenCalledWith({
      text: "你好",
      model: "tts-1",
      voice: "alloy",
      outputFormat: "mp3",
      speed: 1.0,
    });
  });

  it("speed 显式传 0 以外的值时原样透传", async () => {
    generate.mockResolvedValue({ fileName: "slow.wav" });
    await generateSpeech({ ...options, speed: 0.6 });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ speed: 0.6 }));
  });

  it("speed=0 不会被 ?? 兜底吞掉", async () => {
    generate.mockResolvedValue({ fileName: "zero.mp3" });
    await generateSpeech({ ...options, speed: 0 });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ speed: 0 }));
  });

  it("customFileName 不下传给底层（底层按内容哈希命名）", async () => {
    generate.mockResolvedValue({ fileName: "hash.mp3" });
    await generateSpeech({ ...options, customFileName: "忽略我.wav" });
    expect(generate.mock.calls[0][0]).not.toHaveProperty("customFileName");
  });

  it("返回值始终落在进程工作目录的 finish 下", async () => {
    generate.mockResolvedValue({ fileName: "x.mp3" });
    const result = await generateSpeech(options);
    expect(path.isAbsolute(result)).toBe(true);
    expect(result.startsWith(path.join(process.cwd(), "finish"))).toBe(true);
  });

  it("底层失败时向上抛出，不吞错", async () => {
    generate.mockRejectedValue(new Error("provider unavailable"));
    await expect(generateSpeech(options)).rejects.toThrow("provider unavailable");
  });
});

describe("services/ttsService 门面", () => {
  it("只是转发同一个 TtsService 实现", () => {
    expect(FacadeTtsService).toBe(TtsService);
    expect(new FacadeTtsService()).toBeInstanceOf(TtsService);
  });

  it("门面导出的类可用于直接生成", async () => {
    generate.mockResolvedValue({ fileName: "direct.mp3" });
    const service = new FacadeTtsService();
    const request: TtsRequest = { text: "hi", model: "tts-1", voice: "alloy", outputFormat: "mp3", speed: 1 };
    await expect(service.generateSpeech(request)).resolves.toEqual({ fileName: "direct.mp3" });
  });
});
