import fs from "node:fs";
import path from "node:path";

export type RustSharedMemoryIpcErrorCode = "bad_request" | "network_error" | "service_error" | "timeout";

export class RustSharedMemoryIpcError extends Error {
  public readonly code: RustSharedMemoryIpcErrorCode;

  public constructor(message: string, code: RustSharedMemoryIpcErrorCode = "service_error") {
    super(message);
    this.name = "RustSharedMemoryIpcError";
    this.code = code;
  }
}

export interface RustSharedMemoryIpcClientOptions {
  serviceName: string;
  filePath: string;
  sizeBytes: number;
  internalToken: string;
  timeoutMs: number;
}

export interface RustSharedMemoryIpcRequest {
  method: string;
  path: string;
  body?: unknown;
}

type MmapBinding = {
  map: (
    size: number,
    protection: number,
    flags: number,
    fd: number,
    offset?: number,
    advise?: number,
    name?: Buffer,
  ) => Buffer;
  sync?: (buffer: Buffer, blockingSync?: boolean, invalidatePages?: boolean) => void;
  PROT_READ: number;
  PROT_WRITE: number;
  MAP_SHARED: number;
  MADV_RANDOM?: number;
};

const IPC_MAGIC = 0x43504953; // "SIPC" in little-endian order.
const IPC_VERSION = 1;
const HEADER_BYTES = 64;
const OFFSET_MAGIC = 0;
const OFFSET_VERSION = 4;
const OFFSET_STATE = 8;
const OFFSET_REQUEST_ID = 12;
const OFFSET_REQUEST_LEN = 16;
const OFFSET_RESPONSE_LEN = 20;
const OFFSET_REQUEST_CAPACITY = 24;
const OFFSET_RESPONSE_CAPACITY = 28;
const STATE_IDLE = 0;
const STATE_REQUEST_READY = 1;
const STATE_RESPONSE_READY = 2;
const STATE_PROCESSING = 3;
const MIN_CHANNEL_BYTES = 1024 * 1024;

let mmapBinding: MmapBinding | null = null;
let mmapBindingLoadAttempted = false;
let mmapBindingLoadError: string | null = null;

function formatMmapBindingLoadError(error: unknown): string {
  return `@cathodique/mmap-io is required for Rust shared-memory IPC: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function loadMmapBinding(): MmapBinding {
  if (mmapBinding) {
    return mmapBinding;
  }

  if (mmapBindingLoadAttempted && mmapBindingLoadError) {
    throw new RustSharedMemoryIpcError(mmapBindingLoadError, "network_error");
  }

  mmapBindingLoadAttempted = true;

  try {
    // Loaded lazily so the app can still boot in HTTP-fallback environments.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("@cathodique/mmap-io");
    const binding = (loaded.default || loaded) as MmapBinding;
    mmapBinding = binding;
    mmapBindingLoadError = null;
    return binding;
  } catch (error) {
    mmapBindingLoadError = formatMmapBindingLoadError(error);
    throw new RustSharedMemoryIpcError(mmapBindingLoadError, "network_error");
  }
}

export function getRustSharedMemoryIpcUnavailableReason(): string | null {
  if (mmapBinding) {
    return null;
  }

  try {
    loadMmapBinding();
    return null;
  } catch (error) {
    if (error instanceof RustSharedMemoryIpcError) {
      return error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }
}

export function isRustSharedMemoryIpcAvailable(): boolean {
  return getRustSharedMemoryIpcUnavailableReason() === null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeChannelSize(sizeBytes: number): number {
  if (!Number.isFinite(sizeBytes) || sizeBytes < MIN_CHANNEL_BYTES) {
    return MIN_CHANNEL_BYTES;
  }
  return Math.floor(sizeBytes);
}

export function buildRustIpcPath(ipcDir: string, serviceName: string): string {
  return path.join(ipcDir, `${serviceName}.shm`);
}

export class RustSharedMemoryIpcClient {
  private readonly serviceName: string;
  private readonly filePath: string;
  private readonly sizeBytes: number;
  private readonly internalToken: string;
  private readonly timeoutMs: number;
  private fd?: number;
  private buffer?: Buffer;
  private nextRequestId = 1;
  private queue: Promise<void> = Promise.resolve();

  public constructor(options: RustSharedMemoryIpcClientOptions) {
    this.serviceName = options.serviceName;
    this.filePath = options.filePath;
    this.sizeBytes = normalizeChannelSize(options.sizeBytes);
    this.internalToken = options.internalToken;
    this.timeoutMs = options.timeoutMs;
  }

  public async request<TResponse>(request: RustSharedMemoryIpcRequest): Promise<TResponse> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      return await this.performRequest<TResponse>(request);
    } finally {
      release();
    }
  }

  public close(): void {
    if (this.buffer) {
      this.buffer = undefined;
    }
    if (typeof this.fd === "number") {
      fs.closeSync(this.fd);
      this.fd = undefined;
    }
  }

  private async performRequest<TResponse>(request: RustSharedMemoryIpcRequest): Promise<TResponse> {
    const buffer = this.ensureMapped();
    const deadline = Date.now() + this.timeoutMs;
    await this.waitForReady(buffer, deadline);
    await this.waitForIdle(buffer, deadline);

    const requestCapacity = buffer.readUInt32LE(OFFSET_REQUEST_CAPACITY);
    const payloadBuffer = Buffer.from(
      JSON.stringify({
        method: request.method,
        path: request.path,
        token: this.internalToken,
        body: request.body ?? null,
      }),
      "utf8",
    );

    if (payloadBuffer.length > requestCapacity) {
      throw new RustSharedMemoryIpcError(
        `${this.serviceName} shared-memory request exceeds ${requestCapacity} bytes`,
        "bad_request",
      );
    }

    const requestId = this.nextRequestId++ >>> 0;
    if (this.nextRequestId === 0) {
      this.nextRequestId = 1;
    }

    const requestOffset = HEADER_BYTES;
    payloadBuffer.copy(buffer, requestOffset);
    buffer.writeUInt32LE(requestId, OFFSET_REQUEST_ID);
    buffer.writeUInt32LE(payloadBuffer.length, OFFSET_REQUEST_LEN);
    buffer.writeUInt32LE(0, OFFSET_RESPONSE_LEN);
    buffer.writeUInt32LE(STATE_REQUEST_READY, OFFSET_STATE);

    return this.waitForResponse<TResponse>(buffer, requestId, deadline);
  }

  private ensureMapped(): Buffer {
    if (this.buffer) {
      return this.buffer;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.fd = openReadWrite(this.filePath);
    const stat = fs.fstatSync(this.fd);
    if (stat.size < this.sizeBytes) {
      fs.ftruncateSync(this.fd, this.sizeBytes);
    }

    const mmap = loadMmapBinding();
    const mapped = mmap.map(
      this.sizeBytes,
      mmap.PROT_READ | mmap.PROT_WRITE,
      mmap.MAP_SHARED,
      this.fd,
      0,
      mmap.MADV_RANDOM,
    );

    if (!Buffer.isBuffer(mapped)) {
      throw new RustSharedMemoryIpcError(`${this.serviceName} mmap did not return a Buffer`, "network_error");
    }

    this.buffer = mapped;
    return mapped;
  }

  private async waitForReady(buffer: Buffer, deadline: number): Promise<void> {
    while (Date.now() <= deadline) {
      if (buffer.readUInt32LE(OFFSET_MAGIC) === IPC_MAGIC && buffer.readUInt32LE(OFFSET_VERSION) === IPC_VERSION) {
        const requestCapacity = buffer.readUInt32LE(OFFSET_REQUEST_CAPACITY);
        const responseCapacity = buffer.readUInt32LE(OFFSET_RESPONSE_CAPACITY);
        if (requestCapacity > 0 && responseCapacity > 0) {
          return;
        }
      }
      await sleep(10);
    }

    throw new RustSharedMemoryIpcError(`${this.serviceName} shared-memory channel was not initialized`, "timeout");
  }

  private async waitForIdle(buffer: Buffer, deadline: number): Promise<void> {
    while (Date.now() <= deadline) {
      const state = buffer.readUInt32LE(OFFSET_STATE);
      if (state === STATE_IDLE) {
        return;
      }
      if (state === STATE_RESPONSE_READY) {
        buffer.writeUInt32LE(0, OFFSET_RESPONSE_LEN);
        buffer.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
        return;
      }
      await sleep(state === STATE_PROCESSING || state === STATE_REQUEST_READY ? 1 : 5);
    }

    throw new RustSharedMemoryIpcError(`${this.serviceName} shared-memory channel is busy`, "timeout");
  }

  private async waitForResponse<TResponse>(buffer: Buffer, requestId: number, deadline: number): Promise<TResponse> {
    while (Date.now() <= deadline) {
      const state = buffer.readUInt32LE(OFFSET_STATE);
      if (state === STATE_RESPONSE_READY) {
        const responseRequestId = buffer.readUInt32LE(OFFSET_REQUEST_ID);
        const responseLen = buffer.readUInt32LE(OFFSET_RESPONSE_LEN);
        const responseCapacity = buffer.readUInt32LE(OFFSET_RESPONSE_CAPACITY);
        if (responseRequestId !== requestId) {
          buffer.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
          throw new RustSharedMemoryIpcError(`${this.serviceName} returned a mismatched IPC request id`, "service_error");
        }
        if (responseLen === 0 || responseLen > responseCapacity) {
          buffer.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
          throw new RustSharedMemoryIpcError(`${this.serviceName} returned an invalid IPC response length`, "service_error");
        }

        const responseOffset = HEADER_BYTES + buffer.readUInt32LE(OFFSET_REQUEST_CAPACITY);
        const responseText = buffer.toString("utf8", responseOffset, responseOffset + responseLen);
        buffer.writeUInt32LE(0, OFFSET_RESPONSE_LEN);
        buffer.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
        return JSON.parse(responseText) as TResponse;
      }

      if (state === STATE_IDLE) {
        throw new RustSharedMemoryIpcError(`${this.serviceName} IPC request was dropped before response`, "network_error");
      }

      await sleep(1);
    }

    throw new RustSharedMemoryIpcError(`${this.serviceName} shared-memory request timed out`, "timeout");
  }
}

function openReadWrite(filePath: string): number {
  try {
    return fs.openSync(filePath, "r+");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return fs.openSync(filePath, "w+");
  }
}
