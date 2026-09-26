import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import axios from "axios";
import {
  InternalServiceClient,
  InternalServiceClientError,
  isInternalServiceClientError,
} from "../services/internalServiceClient";
import type { InternalServiceClientOptions } from "../services/internalServiceClient";

jest.mock("axios", () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
    // 真 axios 用 isAxiosError 标记判别，这里保持同样的语义
    isAxiosError: (error: unknown) => !!error && (error as { isAxiosError?: boolean }).isAxiosError === true,
  },
}));

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const mockRequest = axios.request as jest.Mock;

const BASE: InternalServiceClientOptions = {
  baseUrl: "http://127.0.0.1:8081/api",
  internalToken: "s3cret-token",
  timeoutMs: 1234,
  serviceName: "nexai",
};

function client(over: Partial<InternalServiceClientOptions> = {}) {
  return new InternalServiceClient({ ...BASE, ...over });
}

function axiosError(over: Record<string, unknown> = {}) {
  return { isAxiosError: true, message: "Request failed", ...over };
}

function lastConfig() {
  return mockRequest.mock.calls[mockRequest.mock.calls.length - 1][0] as Record<string, any>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("InternalServiceClient baseUrl 校验（G5-24）", () => {
  it("拒绝无法解析的 baseUrl", () => {
    expect(() => client({ baseUrl: "not a url" })).toThrow(/baseUrl 无效/);
  });

  it("拒绝 http/https 之外的协议", () => {
    expect(() => client({ baseUrl: "ftp://127.0.0.1:21" })).toThrow(/仅支持 http\/https/);
    expect(() => client({ baseUrl: "file:///etc/passwd" })).toThrow(/仅支持 http\/https/);
  });

  it("拒绝内嵌用户名/密码，避免令牌随重定向外泄", () => {
    expect(() => client({ baseUrl: "http://user:pass@127.0.0.1:8081" })).toThrow(/不允许携带用户名\/密码/);
  });

  it("拒绝没有主机名的 URL", () => {
    expect(() => client({ baseUrl: "http://" })).toThrow(/缺少主机名/);
  });

  it("尾部斜杠在拼接时被规范化", async () => {
    mockRequest.mockResolvedValue({ data: { ok: true } });
    const c = new InternalServiceClient({
      baseUrl: "http://127.0.0.1:8081//",
      internalToken: "t",
      timeoutMs: 10,
    });
    await c.postJson("/ping", {});
    expect(lastConfig().url).toBe("http://127.0.0.1:8081/ping");
  });
});

describe("InternalServiceClient.request", () => {
  it("postJson 带上内部令牌、超时与硬约束配置", async () => {
    mockRequest.mockResolvedValue({ data: { result: "ok" } });

    await expect(client().postJson("/v1/sync", { a: 1 })).resolves.toEqual({ result: "ok" });

    const config = lastConfig();
    expect(config).toMatchObject({
      method: "POST",
      url: "http://127.0.0.1:8081/api/v1/sync",
      timeout: 1234,
      data: { a: 1 },
      maxRedirects: 0,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
    });
    expect(config.headers).toMatchObject({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Internal-Token": "s3cret-token",
    });
  });

  it("path 前导斜杠不会拼出双斜杠", async () => {
    mockRequest.mockResolvedValue({ data: {} });
    await client().postJson("///deep/path", {});
    expect(lastConfig().url).toBe("http://127.0.0.1:8081/api/deep/path");
  });
});

describe("InternalServiceClient.getHealth", () => {
  it("success 为 true 时判健康并透传 data", async () => {
    mockRequest.mockResolvedValue({ data: { success: true, data: { queue: 0 } } });
    await expect(client().getHealth()).resolves.toEqual({ healthy: true, data: { queue: 0 }, error: undefined });
    expect(lastConfig()).toMatchObject({ method: "GET", url: "http://127.0.0.1:8081/api/healthz" });
  });

  it("信封缺 success 字段按健康处理（只在显式 false 时判不健康）", async () => {
    mockRequest.mockResolvedValue({ data: { data: { up: true } } });
    await expect(client().getHealth()).resolves.toMatchObject({ healthy: true });
  });

  it("success=false 时透出 error", async () => {
    mockRequest.mockResolvedValue({ data: { success: false, error: "db unreachable" } });
    await expect(client().getHealth()).resolves.toMatchObject({ healthy: false, error: "db unreachable" });
  });

  it("首次失败后带抖动重试一次，成功即恢复", async () => {
    mockRequest
      .mockRejectedValueOnce(axiosError({ code: "ECONNABORTED" }))
      .mockResolvedValueOnce({ data: { success: true } });

    const started = Date.now();
    await expect(client().getHealth()).resolves.toMatchObject({ healthy: true });
    // 重试前有 100~300ms 抖动
    expect(Date.now() - started).toBeGreaterThanOrEqual(95);
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it("两次都失败时返回 unhealthy 而不是抛错", async () => {
    mockRequest.mockRejectedValue(axiosError({ response: { status: 503 } }));
    const result = await client().getHealth();
    expect(result.healthy).toBe(false);
    expect(result.error).toContain("nexai returned HTTP 503");
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });
});

describe("InternalServiceClient 错误映射", () => {
  it.each([
    [400, "bad_request"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "service_error"],
    [409, "service_error"],
    [429, "rate_limited"],
    [500, "upstream_error"],
    [503, "upstream_error"],
  ])("HTTP %i → %s", async (status, code) => {
    mockRequest.mockRejectedValue(axiosError({ response: { status, data: {} } }));
    await expect(client().postJson("/x", {})).rejects.toMatchObject({
      name: "InternalServiceClientError",
      code,
      statusCode: status,
      serviceName: "nexai",
      message: `nexai returned HTTP ${status}`,
    });
  });

  it("上游回传 error/message 时拼进错误信息", async () => {
    mockRequest.mockRejectedValue(axiosError({ response: { status: 400, data: { error: "bad scope" } } }));
    await expect(client().postJson("/x", {})).rejects.toThrow("nexai returned HTTP 400: bad scope");

    mockRequest.mockRejectedValue(axiosError({ response: { status: 400, data: { message: "字段缺失" } } }));
    await expect(client().postJson("/x", {})).rejects.toThrow("nexai returned HTTP 400: 字段缺失");

    mockRequest.mockRejectedValue(axiosError({ response: { status: 400, data: "plain-text" } }));
    await expect(client().postJson("/x", {})).rejects.toThrow("nexai returned HTTP 400");
  });

  it.each([["ECONNABORTED"], ["ERR_CANCELED"]])("%s 判为 timeout 并带上超时毫秒", async (code) => {
    mockRequest.mockRejectedValue(axiosError({ code }));
    await expect(client().postJson("/x", {})).rejects.toMatchObject({
      code: "timeout",
      message: "nexai timed out after 1234ms",
    });
  });

  it("无响应体的 axios 错误判为 network_error", async () => {
    mockRequest.mockRejectedValue(axiosError({ code: "ECONNREFUSED" }));
    await expect(client().postJson("/x", {})).rejects.toMatchObject({
      code: "network_error",
      message: "nexai network request failed",
    });
  });

  it("非 axios 异常判为 service_error 并保留原始信息", async () => {
    mockRequest.mockRejectedValue(new Error("boom"));
    await expect(client().postJson("/x", {})).rejects.toMatchObject({ code: "service_error", message: "boom" });
  });

  it("抛出非 Error 值时使用兜底文案", async () => {
    mockRequest.mockRejectedValue("string failure");
    await expect(client().postJson("/x", {})).rejects.toMatchObject({
      code: "service_error",
      message: "nexai request failed",
    });
  });
});

describe("isInternalServiceClientError", () => {
  it("只认自家错误类型", () => {
    const own = new InternalServiceClientError("x", { code: "timeout", serviceName: "svc", statusCode: 504 });
    expect(isInternalServiceClientError(own)).toBe(true);
    expect(own).toBeInstanceOf(Error);
    expect(own.code).toBe("timeout");
    expect(own.statusCode).toBe(504);
    expect(isInternalServiceClientError(new Error("x"))).toBe(false);
    expect(isInternalServiceClientError(undefined)).toBe(false);
  });
});
