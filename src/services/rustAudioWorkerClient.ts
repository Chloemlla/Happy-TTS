import { config } from "../config/config";
import {
  InternalServiceClient,
  InternalServiceClientError,
  type InternalServiceEnvelope,
} from "./internalServiceClient";
import type { TtsAudioPostProcessInput, TtsAudioPostProcessResult } from "../tts/tts.ports";

const RUST_AUDIO_WORKER_SOURCE = "rust-audio-worker";

export interface RustAudioWorkerClientOptions {
  internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  maxBytes: number;
  operations?: string[];
}

interface RustAudioWorkerData {
  outputFormat: string;
  durationMs?: number | null;
  size: number;
  loudness?: {
    integratedLufs?: number | null;
  } | null;
  audioBase64: string;
  metadata?: Record<string, unknown>;
  source: typeof RUST_AUDIO_WORKER_SOURCE;
}

export class RustAudioWorkerClient {
  private readonly internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  private readonly maxBytes: number;
  private readonly operations: string[];

  public constructor(options: RustAudioWorkerClientOptions) {
    this.internalClient = options.internalClient;
    this.maxBytes = options.maxBytes;
    this.operations = options.operations || ["passthrough", "analyze"];
  }

  public static fromConfig(): RustAudioWorkerClient {
    return new RustAudioWorkerClient({
      internalClient: new InternalServiceClient({
        baseUrl: config.rustServices.audioWorker.url,
        internalToken: config.rustServices.internalToken,
        timeoutMs: config.rustServices.audioWorker.timeoutMs,
        serviceName: RUST_AUDIO_WORKER_SOURCE,
      }),
      maxBytes: config.rustServices.audioWorker.maxBytes,
      operations: config.rustServices.audioWorker.operations,
    });
  }

  public async getHealth() {
    return this.internalClient.getHealth();
  }

  public async processAudio(input: TtsAudioPostProcessInput): Promise<TtsAudioPostProcessResult> {
    if (input.audioBuffer.length === 0) {
      throw new InternalServiceClientError("rust-audio-worker audio buffer is empty", {
        code: "bad_request",
        serviceName: RUST_AUDIO_WORKER_SOURCE,
        statusCode: 400,
      });
    }

    if (input.audioBuffer.length > this.maxBytes) {
      throw new InternalServiceClientError(`rust-audio-worker audio buffer exceeds ${this.maxBytes} bytes`, {
        code: "bad_request",
        serviceName: RUST_AUDIO_WORKER_SOURCE,
        statusCode: 400,
      });
    }

    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustAudioWorkerData>>("/v1/audio/process", {
      audioBase64: input.audioBuffer.toString("base64"),
      outputFormat: input.outputFormat,
      taskId: input.taskId,
      contentHash: input.contentHash,
      operations: this.operations,
    });

    if (!response.success || !response.data) {
      throw new InternalServiceClientError(response.error || "rust-audio-worker returned an unsuccessful response", {
        code: "service_error",
        serviceName: RUST_AUDIO_WORKER_SOURCE,
      });
    }

    return {
      audioBuffer: Buffer.from(response.data.audioBase64, "base64"),
      outputFormat: response.data.outputFormat,
      metadata: {
        ...(response.data.metadata || {}),
        durationMs: response.data.durationMs ?? undefined,
        loudness: response.data.loudness ?? undefined,
        size: response.data.size,
      },
      source: RUST_AUDIO_WORKER_SOURCE,
    };
  }
}

export const rustAudioWorkerClient = RustAudioWorkerClient.fromConfig();
