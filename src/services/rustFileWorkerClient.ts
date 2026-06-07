import { config } from "../config/config";
import {
  InternalServiceClient,
  InternalServiceClientError,
  type InternalServiceEnvelope,
} from "./internalServiceClient";

const RUST_FILE_WORKER_SOURCE = "rust-file-worker";

export interface RustFileWorkerClientOptions {
  internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  maxBytes: number;
}

export interface RustFileInspectResult {
  size: number;
  detectedMime: string;
  extension?: string;
  sha256: string;
  magic: {
    mime: string;
    extension?: string;
    kind: string;
  };
  image?: {
    width: number;
    height: number;
    format: string;
    animated: boolean;
  };
  archive?: {
    archiveType: string;
    entries: number;
    totalUncompressedSize: number;
    maxDepth: number;
    zipBombRisk: boolean;
    warnings: string[];
  };
  warnings: string[];
  source: typeof RUST_FILE_WORKER_SOURCE;
}

export interface RustFileHashResult {
  size: number;
  hashes: Record<string, string>;
  source: typeof RUST_FILE_WORKER_SOURCE;
}

export interface RustImageProcessResult {
  outputFormat: string;
  size: number;
  imageBuffer: Buffer;
  metadata: Record<string, unknown>;
  source: typeof RUST_FILE_WORKER_SOURCE;
}

export class RustFileWorkerClient {
  private readonly internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  private readonly maxBytes: number;

  public constructor(options: RustFileWorkerClientOptions) {
    this.internalClient = options.internalClient;
    this.maxBytes = options.maxBytes;
  }

  public static fromConfig(): RustFileWorkerClient {
    return new RustFileWorkerClient({
      internalClient: new InternalServiceClient({
        baseUrl: config.rustServices.fileWorker.url,
        internalToken: config.rustServices.internalToken,
        timeoutMs: config.rustServices.fileWorker.timeoutMs,
        serviceName: RUST_FILE_WORKER_SOURCE,
      }),
      maxBytes: config.rustServices.fileWorker.maxBytes,
    });
  }

  public async getHealth() {
    return this.internalClient.getHealth();
  }

  public async inspectFile(input: {
    fileBuffer: Buffer;
    fileName?: string;
    declaredMime?: string;
    operations?: string[];
  }): Promise<RustFileInspectResult> {
    this.validateBuffer(input.fileBuffer);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustFileInspectResult>>(
      "/v1/file/inspect",
      {
        fileBase64: input.fileBuffer.toString("base64"),
        fileName: input.fileName,
        declaredMime: input.declaredMime,
        operations: input.operations,
      },
    );

    return this.unwrap(response, "rust-file-worker returned an unsuccessful inspect response");
  }

  public async hashFile(input: { fileBuffer: Buffer; algorithms?: string[] }): Promise<RustFileHashResult> {
    this.validateBuffer(input.fileBuffer);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustFileHashResult>>(
      "/v1/file/hash",
      {
        fileBase64: input.fileBuffer.toString("base64"),
        algorithms: input.algorithms,
      },
    );

    return this.unwrap(response, "rust-file-worker returned an unsuccessful hash response");
  }

  public async inspectImage(input: { fileBuffer: Buffer; fileName?: string; declaredMime?: string }) {
    this.validateBuffer(input.fileBuffer);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<unknown>>(
      "/v1/file/image/inspect",
      {
        fileBase64: input.fileBuffer.toString("base64"),
        fileName: input.fileName,
        declaredMime: input.declaredMime,
      },
    );

    return this.unwrap(response, "rust-file-worker returned an unsuccessful image inspect response");
  }

  public async processImage(input: {
    fileBuffer: Buffer;
    outputFormat?: string;
    operations?: string[];
  }): Promise<RustImageProcessResult> {
    this.validateBuffer(input.fileBuffer);
    const response = await this.internalClient.postJson<
      InternalServiceEnvelope<{
        outputFormat: string;
        size: number;
        imageBase64: string;
        metadata?: Record<string, unknown>;
        source: typeof RUST_FILE_WORKER_SOURCE;
      }>
    >("/v1/file/image/process", {
      fileBase64: input.fileBuffer.toString("base64"),
      outputFormat: input.outputFormat,
      operations: input.operations,
    });
    const data = this.unwrap(response, "rust-file-worker returned an unsuccessful image process response");

    return {
      outputFormat: data.outputFormat,
      size: data.size,
      imageBuffer: Buffer.from(data.imageBase64, "base64"),
      metadata: data.metadata || {},
      source: data.source,
    };
  }

  public async inspectArchive(input: { fileBuffer: Buffer; fileName?: string }) {
    this.validateBuffer(input.fileBuffer);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<unknown>>(
      "/v1/file/archive/inspect",
      {
        fileBase64: input.fileBuffer.toString("base64"),
        fileName: input.fileName,
      },
    );

    return this.unwrap(response, "rust-file-worker returned an unsuccessful archive inspect response");
  }

  private validateBuffer(fileBuffer: Buffer): void {
    if (fileBuffer.length === 0) {
      throw new InternalServiceClientError("rust-file-worker file buffer is empty", {
        code: "bad_request",
        serviceName: RUST_FILE_WORKER_SOURCE,
        statusCode: 400,
      });
    }
    if (fileBuffer.length > this.maxBytes) {
      throw new InternalServiceClientError(`rust-file-worker file buffer exceeds ${this.maxBytes} bytes`, {
        code: "bad_request",
        serviceName: RUST_FILE_WORKER_SOURCE,
        statusCode: 400,
      });
    }
  }

  private unwrap<T>(response: InternalServiceEnvelope<T>, fallbackMessage: string): T {
    if (!response.success || !response.data) {
      throw new InternalServiceClientError(response.error || fallbackMessage, {
        code: "service_error",
        serviceName: RUST_FILE_WORKER_SOURCE,
      });
    }

    return response.data;
  }
}

export const rustFileWorkerClient = RustFileWorkerClient.fromConfig();
