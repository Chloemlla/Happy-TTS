import axios, { type AxiosRequestConfig, type Method } from "axios";
import {
  RustSharedMemoryIpcClient,
  RustSharedMemoryIpcError,
  type RustSharedMemoryIpcClientOptions,
} from "./rustSharedMemoryIpcClient";

export type InternalServiceErrorCode =
  | "bad_request"
  | "forbidden"
  | "network_error"
  | "rate_limited"
  | "service_error"
  | "timeout"
  | "unauthorized"
  | "upstream_error";

export interface InternalServiceClientOptions {
  baseUrl: string;
  internalToken: string;
  timeoutMs: number;
  serviceName?: string;
  ipc?: Omit<RustSharedMemoryIpcClientOptions, "internalToken" | "timeoutMs"> & {
    enabled: boolean;
    timeoutMs?: number;
  };
}

export interface InternalServiceHealthResult {
  healthy: boolean;
  data?: unknown;
  error?: string;
}

export interface InternalServiceEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class InternalServiceClientError extends Error {
  public readonly code: InternalServiceErrorCode;
  public readonly serviceName: string;
  public readonly statusCode?: number;

  public constructor(
    message: string,
    options: { code: InternalServiceErrorCode; serviceName: string; statusCode?: number },
  ) {
    super(message);
    this.name = "InternalServiceClientError";
    this.code = options.code;
    this.serviceName = options.serviceName;
    this.statusCode = options.statusCode;
  }
}

export function isInternalServiceClientError(error: unknown): error is InternalServiceClientError {
  return error instanceof InternalServiceClientError;
}

export class InternalServiceClient {
  private readonly baseUrl: string;
  private readonly internalToken: string;
  private readonly serviceName: string;
  private readonly timeoutMs: number;
  private readonly ipcClient?: RustSharedMemoryIpcClient;

  public constructor(options: InternalServiceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.internalToken = options.internalToken;
    this.timeoutMs = options.timeoutMs;
    this.serviceName = options.serviceName || "internal-service";
    if (options.ipc?.enabled) {
      this.ipcClient = new RustSharedMemoryIpcClient({
        serviceName: options.ipc.serviceName,
        filePath: options.ipc.filePath,
        sizeBytes: options.ipc.sizeBytes,
        internalToken: options.internalToken,
        timeoutMs: options.ipc.timeoutMs || options.timeoutMs,
      });
    }
  }

  public async getHealth(): Promise<InternalServiceHealthResult> {
    try {
      const response = await this.request<InternalServiceEnvelope<unknown>>("GET", "/healthz");
      return {
        healthy: response.success !== false,
        data: response.data,
        error: response.error,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Internal service health check failed",
      };
    }
  }

  public async postJson<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse> {
    return this.request<TResponse>("POST", path, body);
  }

  private async request<TResponse>(method: Method, path: string, body?: unknown): Promise<TResponse> {
    if (this.ipcClient) {
      try {
        return await this.ipcClient.request<TResponse>({
          method,
          path,
          body,
        });
      } catch (error) {
        throw this.mapIpcError(error);
      }
    }

    const requestConfig: AxiosRequestConfig = {
      method,
      url: this.buildUrl(path),
      timeout: this.timeoutMs,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Internal-Token": this.internalToken,
      },
      data: body,
    };

    try {
      const response = await axios.request<TResponse>(requestConfig);
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
  }

  private mapError(error: unknown): InternalServiceClientError {
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.code === "ERR_CANCELED") {
        return new InternalServiceClientError(`${this.serviceName} timed out after ${this.timeoutMs}ms`, {
          code: "timeout",
          serviceName: this.serviceName,
        });
      }

      const statusCode = error.response?.status;
      if (statusCode) {
        return new InternalServiceClientError(this.messageForStatus(statusCode, error.response?.data), {
          code: this.codeForStatus(statusCode),
          serviceName: this.serviceName,
          statusCode,
        });
      }

      return new InternalServiceClientError(`${this.serviceName} network request failed`, {
        code: "network_error",
        serviceName: this.serviceName,
      });
    }

    return new InternalServiceClientError(error instanceof Error ? error.message : `${this.serviceName} request failed`, {
      code: "service_error",
      serviceName: this.serviceName,
    });
  }

  private mapIpcError(error: unknown): InternalServiceClientError {
    if (error instanceof RustSharedMemoryIpcError) {
      return new InternalServiceClientError(error.message, {
        code: error.code,
        serviceName: this.serviceName,
      });
    }

    return new InternalServiceClientError(error instanceof Error ? error.message : `${this.serviceName} IPC request failed`, {
      code: "service_error",
      serviceName: this.serviceName,
    });
  }

  private codeForStatus(statusCode: number): InternalServiceErrorCode {
    if (statusCode === 400) return "bad_request";
    if (statusCode === 401) return "unauthorized";
    if (statusCode === 403) return "forbidden";
    if (statusCode === 429) return "rate_limited";
    if (statusCode >= 500) return "upstream_error";
    return "service_error";
  }

  private messageForStatus(statusCode: number, responseData: unknown): string {
    const responseMessage =
      responseData && typeof responseData === "object"
        ? String((responseData as { error?: unknown; message?: unknown }).error || (responseData as { message?: unknown }).message || "")
        : "";
    const suffix = responseMessage ? `: ${responseMessage}` : "";
    return `${this.serviceName} returned HTTP ${statusCode}${suffix}`;
  }
}
