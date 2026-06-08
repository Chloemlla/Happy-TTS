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
  ) => Buffer | number;
  unmap?: (bufferId: number) => void;
  sync?: (buffer: Buffer, blockingSync?: boolean, invalidatePages?: boolean) => void;
  PROT_READ: number;
  PROT_WRITE: number;
  MAP_SHARED: number;
  MADV_RANDOM?: number;
};

type IpcChannel = {
  readUInt32LE: (offset: number) => number;
  writeUInt32LE: (value: number, offset: number) => void;
  writeBuffer: (buffer: Buffer, offset: number) => void;
  toString: (encoding: BufferEncoding, start: number, end: number) => string;
  close: () => void;
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
const ipcPathLocks = new Map<string, Promise<void>>();

function formatMmapBindingLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const conciseMessage = message.split("\nRequire stack:")[0];
  return `@cathodique/mmap-io native binding is unavailable: ${conciseMessage}`;
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
  // Native mmap is optional because the same IPC file can be driven through synchronous file I/O.
  return null;
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

function normalizeIpcLockKey(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

async function withIpcPathLock<T>(lockKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = ipcPathLocks.get(lockKey) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(() => current, () => current);
  ipcPathLocks.set(lockKey, next);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (ipcPathLocks.get(lockKey) === next) {
      ipcPathLocks.delete(lockKey);
    }
  }
}

export class RustSharedMemoryIpcClient {
  private readonly serviceName: string;
  private readonly filePath: string;
  private readonly lockKey: string;
  private readonly sizeBytes: number;
  private readonly internalToken: string;
  private readonly timeoutMs: number;
  private fd?: number;
  private channel?: IpcChannel;
  private nextRequestId = 1;

  public constructor(options: RustSharedMemoryIpcClientOptions) {
    this.serviceName = options.serviceName;
    this.filePath = options.filePath;
    this.lockKey = normalizeIpcLockKey(options.filePath);
    this.sizeBytes = normalizeChannelSize(options.sizeBytes);
    this.internalToken = options.internalToken;
    this.timeoutMs = options.timeoutMs;
  }

  public async request<TResponse>(request: RustSharedMemoryIpcRequest): Promise<TResponse> {
    return withIpcPathLock(this.lockKey, () => this.performRequest<TResponse>(request));
  }

  public close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = undefined;
    }
    if (typeof this.fd === "number") {
      fs.closeSync(this.fd);
      this.fd = undefined;
    }
  }

  private async performRequest<TResponse>(request: RustSharedMemoryIpcRequest): Promise<TResponse> {
    const channel = this.ensureChannel();
    const deadline = Date.now() + this.timeoutMs;
    await this.waitForReady(channel, deadline);
    await this.waitForIdle(channel, deadline);

    const requestCapacity = channel.readUInt32LE(OFFSET_REQUEST_CAPACITY);
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
    channel.writeBuffer(payloadBuffer, requestOffset);
    channel.writeUInt32LE(requestId, OFFSET_REQUEST_ID);
    channel.writeUInt32LE(payloadBuffer.length, OFFSET_REQUEST_LEN);
    channel.writeUInt32LE(0, OFFSET_RESPONSE_LEN);
    channel.writeUInt32LE(STATE_REQUEST_READY, OFFSET_STATE);

    return this.waitForResponse<TResponse>(channel, requestId, deadline);
  }

  private ensureChannel(): IpcChannel {
    if (this.channel) {
      return this.channel;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.fd = openReadWrite(this.filePath);
    const stat = fs.fstatSync(this.fd);
    if (stat.size < this.sizeBytes) {
      fs.ftruncateSync(this.fd, this.sizeBytes);
    }

    this.channel = this.tryCreateMmapChannel() || new FileBackedIpcChannel(this.fd);
    return this.channel;
  }

  private tryCreateMmapChannel(): IpcChannel | null {
    let mmap: MmapBinding;
    try {
      mmap = loadMmapBinding();
    } catch (_error) {
      return null;
    }

    try {
      const mapped = mmap.map(
        this.sizeBytes,
        mmap.PROT_READ | mmap.PROT_WRITE,
        mmap.MAP_SHARED,
        this.fd!,
        0,
        mmap.MADV_RANDOM,
      );

      if (Buffer.isBuffer(mapped)) {
        return new BufferIpcChannel(mapped);
      }

      if (typeof mapped === "number") {
        mmap.unmap?.(mapped);
      }
      return null;
    } catch (_error) {
      return null;
    }
  }

  private async waitForReady(channel: IpcChannel, deadline: number): Promise<void> {
    while (Date.now() <= deadline) {
      if (channel.readUInt32LE(OFFSET_MAGIC) === IPC_MAGIC && channel.readUInt32LE(OFFSET_VERSION) === IPC_VERSION) {
        const requestCapacity = channel.readUInt32LE(OFFSET_REQUEST_CAPACITY);
        const responseCapacity = channel.readUInt32LE(OFFSET_RESPONSE_CAPACITY);
        if (requestCapacity > 0 && responseCapacity > 0) {
          return;
        }
      }
      await sleep(10);
    }

    throw new RustSharedMemoryIpcError(`${this.serviceName} shared-memory channel was not initialized`, "timeout");
  }

  private async waitForIdle(channel: IpcChannel, deadline: number): Promise<void> {
    while (Date.now() <= deadline) {
      const state = channel.readUInt32LE(OFFSET_STATE);
      if (state === STATE_IDLE) {
        return;
      }
      if (state === STATE_RESPONSE_READY) {
        channel.writeUInt32LE(0, OFFSET_RESPONSE_LEN);
        channel.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
        return;
      }
      await sleep(state === STATE_PROCESSING || state === STATE_REQUEST_READY ? 1 : 5);
    }

    throw new RustSharedMemoryIpcError(`${this.serviceName} shared-memory channel is busy`, "timeout");
  }

  private async waitForResponse<TResponse>(channel: IpcChannel, requestId: number, deadline: number): Promise<TResponse> {
    while (Date.now() <= deadline) {
      const state = channel.readUInt32LE(OFFSET_STATE);
      if (state === STATE_RESPONSE_READY) {
        const responseRequestId = channel.readUInt32LE(OFFSET_REQUEST_ID);
        const responseLen = channel.readUInt32LE(OFFSET_RESPONSE_LEN);
        const responseCapacity = channel.readUInt32LE(OFFSET_RESPONSE_CAPACITY);
        if (responseRequestId !== requestId) {
          channel.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
          throw new RustSharedMemoryIpcError(`${this.serviceName} returned a mismatched IPC request id`, "service_error");
        }
        if (responseLen === 0 || responseLen > responseCapacity) {
          channel.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
          throw new RustSharedMemoryIpcError(`${this.serviceName} returned an invalid IPC response length`, "service_error");
        }

        const responseOffset = HEADER_BYTES + channel.readUInt32LE(OFFSET_REQUEST_CAPACITY);
        const responseText = channel.toString("utf8", responseOffset, responseOffset + responseLen);
        channel.writeUInt32LE(0, OFFSET_RESPONSE_LEN);
        channel.writeUInt32LE(STATE_IDLE, OFFSET_STATE);
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

class BufferIpcChannel implements IpcChannel {
  public constructor(private readonly buffer: Buffer) {}

  public readUInt32LE(offset: number): number {
    return this.buffer.readUInt32LE(offset);
  }

  public writeUInt32LE(value: number, offset: number): void {
    this.buffer.writeUInt32LE(value, offset);
  }

  public writeBuffer(buffer: Buffer, offset: number): void {
    buffer.copy(this.buffer, offset);
  }

  public toString(encoding: BufferEncoding, start: number, end: number): string {
    return this.buffer.toString(encoding, start, end);
  }

  public close(): void {
    // mmap-io releases Buffer-backed mappings when the Buffer is garbage collected.
  }
}

class FileBackedIpcChannel implements IpcChannel {
  private readonly wordBuffer = Buffer.allocUnsafe(4);

  public constructor(private readonly fd: number) {}

  public readUInt32LE(offset: number): number {
    this.readFully(this.wordBuffer, 0, this.wordBuffer.length, offset);
    return this.wordBuffer.readUInt32LE(0);
  }

  public writeUInt32LE(value: number, offset: number): void {
    this.wordBuffer.writeUInt32LE(value, 0);
    this.writeFully(this.wordBuffer, 0, this.wordBuffer.length, offset);
  }

  public writeBuffer(buffer: Buffer, offset: number): void {
    this.writeFully(buffer, 0, buffer.length, offset);
  }

  public toString(encoding: BufferEncoding, start: number, end: number): string {
    const buffer = Buffer.allocUnsafe(end - start);
    this.readFully(buffer, 0, buffer.length, start);
    return buffer.toString(encoding);
  }

  public close(): void {
    // The owning RustSharedMemoryIpcClient closes the file descriptor.
  }

  private readFully(buffer: Buffer, start: number, length: number, position: number): void {
    let total = 0;
    while (total < length) {
      const bytesRead = fs.readSync(this.fd, buffer, start + total, length - total, position + total);
      if (bytesRead === 0) {
        throw new Error(`Unexpected EOF while reading shared-memory IPC file at offset ${position + total}`);
      }
      total += bytesRead;
    }
  }

  private writeFully(buffer: Buffer, start: number, length: number, position: number): void {
    let total = 0;
    while (total < length) {
      const bytesWritten = fs.writeSync(this.fd, buffer, start + total, length - total, position + total);
      if (bytesWritten === 0) {
        throw new Error(`Unable to write shared-memory IPC file at offset ${position + total}`);
      }
      total += bytesWritten;
    }
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
