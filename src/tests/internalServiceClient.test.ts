import axios from "axios";
import { InternalServiceClient, isInternalServiceClientError } from "../services/internalServiceClient";

jest.mock("axios");

const mockedAxios = axios as jest.Mocked<typeof axios>;

const createAxiosError = (config: any) => {
  const error = new Error(config.message || "Axios Error") as any;
  error.isAxiosError = true;
  error.code = config.code;
  error.response = config.response;
  error.request = config.request;
  return error;
};

describe("InternalServiceClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (axios.isAxiosError as any) = jest.fn((error) => error?.isAxiosError === true);
  });

  it("should send internal token, JSON headers, and timeout for POST requests", async () => {
    mockedAxios.request.mockResolvedValueOnce({
      data: { success: true, data: { ok: true } },
    } as any);

    const client = new InternalServiceClient({
      baseUrl: "http://127.0.0.1:4010/",
      internalToken: "test-token",
      timeoutMs: 5000,
      serviceName: "rust-network-tools",
    });

    const result = await client.postJson("/v1/network/tcping", { address: "example.com", port: 443 });

    expect(result).toEqual({ success: true, data: { ok: true } });
    expect(mockedAxios.request).toHaveBeenCalledWith({
      method: "POST",
      url: "http://127.0.0.1:4010/v1/network/tcping",
      timeout: 5000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Internal-Token": "test-token",
      },
      data: { address: "example.com", port: 443 },
    });
  });

  it("should return a healthy result from health checks", async () => {
    mockedAxios.request.mockResolvedValueOnce({
      data: { success: true, data: { status: "ok" } },
    } as any);

    const client = new InternalServiceClient({
      baseUrl: "http://127.0.0.1:4010",
      internalToken: "test-token",
      timeoutMs: 5000,
      serviceName: "rust-network-tools",
    });

    await expect(client.getHealth()).resolves.toEqual({
      healthy: true,
      data: { status: "ok" },
      error: undefined,
    });
  });

  it("should map unauthorized responses to internal service errors", async () => {
    mockedAxios.request.mockRejectedValueOnce(
      createAxiosError({
        response: {
          status: 401,
          data: { error: "missing internal token" },
        },
      }),
    );

    const client = new InternalServiceClient({
      baseUrl: "http://127.0.0.1:4010",
      internalToken: "test-token",
      timeoutMs: 5000,
      serviceName: "rust-network-tools",
    });

    await expect(client.postJson("/v1/network/tcping", {})).rejects.toMatchObject({
      code: "unauthorized",
      serviceName: "rust-network-tools",
      statusCode: 401,
      message: "rust-network-tools returned HTTP 401: missing internal token",
    });
  });

  it("should map timeouts", async () => {
    mockedAxios.request.mockRejectedValueOnce(createAxiosError({ code: "ECONNABORTED" }));

    const client = new InternalServiceClient({
      baseUrl: "http://127.0.0.1:4010",
      internalToken: "test-token",
      timeoutMs: 1234,
      serviceName: "rust-network-tools",
    });

    try {
      await client.postJson("/v1/network/tcping", {});
      throw new Error("Expected timeout");
    } catch (error) {
      expect(isInternalServiceClientError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "timeout",
        message: "rust-network-tools timed out after 1234ms",
      });
    }
  });
});

