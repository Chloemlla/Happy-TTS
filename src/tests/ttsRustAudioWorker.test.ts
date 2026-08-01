import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/config";
import { InternalServiceClientError } from "../services/internalServiceClient";
import { RustAudioWorkerClient } from "../services/rustAudioWorkerClient";
import { DefaultTtsAudioPostProcessor } from "../tts/tts.audioPostProcessor";
import { TtsGenerationError } from "../tts/tts.errors";
import { TtsService } from "../tts/tts.service";

const mockPersistAudioAsset = jest.fn();
const mockRestoreAudioAssetToDisk = jest.fn();
const mockGetAudioAssetMetadata = jest.fn();
const mockBuildFileOnlyMetadata = jest.fn();
const mockBuildWatermarkId = jest.fn();

interface MockFileOnlyAudioMetadataParams {
  contentHash: string;
  fileName: string;
  outputFormat: string;
  size: number;
  watermarkId?: string;
  ownerUserId?: string;
  sourceTaskId?: string;
  sourceFingerprintHash?: string;
  policyVersion?: string;
}

jest.mock("../tts/tts.asset", () => ({
  ttsAudioAssetStore: {
    persistAudioAsset: (...args: unknown[]) => mockPersistAudioAsset(...args),
    restoreAudioAssetToDisk: (...args: unknown[]) => mockRestoreAudioAssetToDisk(...args),
    getAudioAssetMetadata: (...args: unknown[]) => mockGetAudioAssetMetadata(...args),
    buildFileOnlyMetadata: (...args: unknown[]) => mockBuildFileOnlyMetadata(...args),
  },
}));

jest.mock("../tts/tts.assetAccess", () => ({
  ttsAssetAccessService: {
    buildWatermarkId: (...args: unknown[]) => mockBuildWatermarkId(...args),
  },
}));

describe("Rust audio worker integration", () => {
  const originalAudioDir = config.audioDir;
  const testAudioDir = path.join(process.cwd(), "test-data", "audio-worker");

  beforeEach(async () => {
    jest.clearAllMocks();
    config.audioDir = testAudioDir;
    config.rustServices.audioWorker.enabled = false;
    config.rustServices.audioWorker.fallbackEnabled = true;
    config.rustServices.audioWorker.maxBytes = 20 * 1024 * 1024;
    mockRestoreAudioAssetToDisk.mockResolvedValue(false);
    mockGetAudioAssetMetadata.mockResolvedValue(null);
    mockPersistAudioAsset.mockResolvedValue(null);
    mockBuildFileOnlyMetadata.mockImplementation((params: MockFileOnlyAudioMetadataParams) => ({
      contentHash: params.contentHash,
      fileName: params.fileName,
      outputFormat: params.outputFormat,
      mimeType: params.outputFormat === "mp3" ? "audio/mpeg" : `audio/${params.outputFormat}`,
      size: params.size,
      watermarkId: params.watermarkId,
      ownerUserId: params.ownerUserId,
      sourceTaskId: params.sourceTaskId,
      sourceFingerprintHash: params.sourceFingerprintHash,
      policyVersion: params.policyVersion,
      storage: "file",
    }));
    mockBuildWatermarkId.mockReturnValue("watermark-test-id");
    await fs.rm(testAudioDir, { recursive: true, force: true });
    await fs.mkdir(testAudioDir, { recursive: true });
  });

  afterAll(async () => {
    config.audioDir = originalAudioDir;
    await fs.rm(testAudioDir, { recursive: true, force: true });
  });

  it("RustAudioWorkerClient should encode audio bytes and decode processed output", async () => {
    const internalClient = {
      getHealth: jest.fn(),
      postJson: jest.fn().mockResolvedValue({
        success: true,
        data: {
          outputFormat: "mp3",
          durationMs: null,
          size: 15,
          loudness: null,
          audioBase64: Buffer.from("processed-audio").toString("base64"),
          metadata: { detectedFormat: "mp3" },
          source: "rust-audio-worker",
        },
      }),
    };
    const client = new RustAudioWorkerClient({
      internalClient,
      maxBytes: 1024,
      operations: ["passthrough", "analyze"],
    });

    const result = await client.processAudio({
      audioBuffer: Buffer.from("raw-audio"),
      outputFormat: "mp3",
      taskId: "tts_test",
      contentHash: "content-hash",
    });

    expect(result).toMatchObject({
      outputFormat: "mp3",
      source: "rust-audio-worker",
      metadata: {
        detectedFormat: "mp3",
        size: 15,
      },
    });
    expect(result.audioBuffer.toString()).toBe("processed-audio");
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/audio/process", {
      audioBase64: Buffer.from("raw-audio").toString("base64"),
      outputFormat: "mp3",
      taskId: "tts_test",
      contentHash: "content-hash",
      operations: ["passthrough", "analyze"],
    });
  });

  it("DefaultTtsAudioPostProcessor should passthrough when disabled", async () => {
    const audioWorkerClient = {
      processAudio: jest.fn(),
    };
    const processor = new DefaultTtsAudioPostProcessor(audioWorkerClient as any);
    const audioBuffer = Buffer.from("raw-audio");

    const result = await processor.process({
      audioBuffer,
      outputFormat: "mp3",
      contentHash: "content-hash",
    });

    expect(result).toEqual({
      audioBuffer,
      outputFormat: "mp3",
      source: "node-passthrough",
    });
    expect(audioWorkerClient.processAudio).not.toHaveBeenCalled();
  });

  it("DefaultTtsAudioPostProcessor should fallback to the original buffer when Rust fails", async () => {
    config.rustServices.audioWorker.enabled = true;
    config.rustServices.audioWorker.fallbackEnabled = true;
    const audioWorkerClient = {
      processAudio: jest.fn().mockRejectedValue(
        new InternalServiceClientError("rust-audio-worker timed out after 30000ms", {
          code: "timeout",
          serviceName: "rust-audio-worker",
        }),
      ),
    };
    const processor = new DefaultTtsAudioPostProcessor(audioWorkerClient as any);
    const audioBuffer = Buffer.from("raw-audio");

    const result = await processor.process({
      audioBuffer,
      outputFormat: "mp3",
      contentHash: "content-hash",
    });

    expect(result.audioBuffer).toBe(audioBuffer);
    expect(result.source).toBe("node-passthrough");
  });

  it("DefaultTtsAudioPostProcessor should fail when Rust fails and fallback is disabled", async () => {
    config.rustServices.audioWorker.enabled = true;
    config.rustServices.audioWorker.fallbackEnabled = false;
    const audioWorkerClient = {
      processAudio: jest.fn().mockRejectedValue(new Error("audio worker failed")),
    };
    const processor = new DefaultTtsAudioPostProcessor(audioWorkerClient as any);

    await expect(
      processor.process({
        audioBuffer: Buffer.from("raw-audio"),
        outputFormat: "mp3",
        contentHash: "content-hash",
      }),
    ).rejects.toBeInstanceOf(TtsGenerationError);
  });

  it("TtsService should write and persist processed audio without changing public result fields", async () => {
    const providerRouter = {
      resolveExecutionSnapshot: jest.fn().mockResolvedValue({
        providerId: "openai",
        model: "tts-1",
        voice: "alloy",
        baseUrl: "https://api.openai.com/v1",
        cacheIdentity: "openai|tts-1|alloy|https://api.openai.com/v1",
      }),
      synthesize: jest.fn().mockResolvedValue({
        provider: "openai",
        providerModel: "tts-1",
        providerVoice: "alloy",
        outputFormat: "mp3",
        audioBuffer: Buffer.from("raw-audio"),
      }),
    };
    const audioPostProcessor = {
      process: jest.fn().mockResolvedValue({
        audioBuffer: Buffer.from("processed-audio"),
        outputFormat: "mp3",
        metadata: { detectedFormat: "mp3" },
        source: "rust-audio-worker",
      }),
    };
    const service = new TtsService(providerRouter as any, audioPostProcessor);

    const result = await service.generateSpeech({
      text: "second phase audio worker test",
      model: "tts-1",
      voice: "alloy",
      outputFormat: "mp3",
      speed: 1,
      taskId: "tts_audio_worker_test",
      isAdmin: true,
    });

    const fileContent = await fs.readFile(path.join(testAudioDir, result.fileName));
    expect(fileContent.toString()).toBe("processed-audio");
    expect(mockPersistAudioAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: result.fileName,
        outputFormat: "mp3",
        buffer: Buffer.from("processed-audio"),
        sourceTaskId: "tts_audio_worker_test",
      }),
    );
    expect(result).toMatchObject({
      isDuplicate: false,
      outputFormat: "mp3",
      provider: "openai",
      providerModel: "tts-1",
      providerVoice: "alloy",
      watermarkId: "watermark-test-id",
    });
    expect(audioPostProcessor.process).toHaveBeenCalledWith(
      expect.objectContaining({
        audioBuffer: Buffer.from("raw-audio"),
        outputFormat: "mp3",
        taskId: "tts_audio_worker_test",
      }),
    );
  });
});
