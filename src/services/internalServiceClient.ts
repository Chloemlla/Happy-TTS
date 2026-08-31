import axios, { type AxiosRequestConfig, type Method } from "axios";
import logger from "../utils/logger";

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

  public constructor(options: InternalServiceClientOptions) {
    // G5-24: 校验 baseUrl 协议与主机，拒绝携带用户名密码的 URL，避免内部令牌被重定向带到第三方。
    let parsed: URL;
    try {
      parsed = new URL(options.baseUrl);
    } catch {
      throw new Error(`InternalServiceClient: baseUrl 无效: ${options.baseUrl}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`InternalServiceClient: baseUrl 仅支持 http/https: ${options.baseUrl}`);
    }
    if (parsed.username || parsed.password) {
      throw new Error("InternalServiceClient: baseUrl 不允许携带用户名/密码");
    }
    if (!parsed.hostname) {
      throw new Error("InternalServiceClient: baseUrl 缺少主机名");
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.internalToken = options.internalToken;
    this.timeoutMs = options.timeoutMs;
    this.serviceName = options.serviceName || "internal-service";
  }

  public async getHealth(): Promise<InternalServiceHealthResult> {
    // G5-24: 带一次抖动重试，避免上游瞬时抖动被直接判为 unhealthy。
    try {
      const response = await this.request<InternalServiceEnvelope<unknown>>("GET", "/healthz");
      return {
        healthy: response.success !== false,
        data: response.data,
        error: response.error,
      };
    } catch (firstError) {
      const jitterMs = Math.floor(100 + Math.random() * 200);
      await new Promise((resolve) => setTimeout(resolve, jitterMs));
      try {
        const response = await this.request<InternalServiceEnvelope<unknown>>("GET", "/healthz");
        return {
          healthy: response.success !== false,
          data: response.data,
          error: response.error,
        };
      } catch (secondError) {
        return {
          healthy: false,
          error:
            secondError instanceof Error ? secondError.message : "Internal service health check failed",
        };
      }
    }
  }

  public async postJson<TResponse, TBody = unknown>(path: string, body: TBody): Promise<TResponse> {
    return this.request<TResponse>("POST", path, body);
  }

  private async request<TResponse>(method: Method, path: string, body?: unknown): Promise<TResponse> {
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
      // G5-24: 内部服务调用不应跟随重定向（跨主机 302 会把 X-Internal-Token 带给第三方）；
      // 响应体设大小上限，防恶意/异常上游用超大响应打满内存。
      maxRedirects: 0,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
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