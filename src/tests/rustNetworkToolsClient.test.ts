import { InternalServiceClientError } from "../services/internalServiceClient";
import { RustNetworkToolsClient } from "../services/rustNetworkToolsClient";

describe("RustNetworkToolsClient", () => {
  const createClient = (overrides: Record<string, unknown> = {}) => {
    const internalClient = {
      getHealth: jest.fn(),
      postJson: jest.fn(),
    };

    const client = new RustNetworkToolsClient({
      internalClient,
      timeoutMs: 2500,
      maxResponseBytes: 4096,
      defaultPortScanPorts: [80, 443],
      concurrency: 2,
      blockPrivateTargets: true,
      ...overrides,
    } as any);

    return { client, internalClient };
  };

  it("should call Rust tcping endpoint and map the response", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        address: "example.com",
        port: 443,
        reachable: true,
        latencyMs: 42,
        source: "rust-network-tools",
      },
    });

    const result = await client.tcpPing("example.com", 443);

    expect(result).toEqual({
      success: true,
      data: {
        address: "example.com",
        port: 443,
        reachable: true,
        latencyMs: 42,
        source: "rust-network-tools",
      },
    });
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/network/tcping", {
      address: "example.com",
      port: 443,
      timeoutMs: 2500,
    });
  });

  it("should call Rust portscan endpoint with default ports and concurrency", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        address: "example.com",
        scannedPorts: [80, 443],
        openPorts: [443],
        results: [
          { port: 80, open: false },
          { port: 443, open: true, latencyMs: 10 },
        ],
        source: "rust-network-tools",
      },
    });

    const result = await client.portScan("example.com");

    expect(result.success).toBe(true);
    expect(result.data.openPorts).toEqual([443]);
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/network/portscan", {
      address: "example.com",
      ports: [80, 443],
      timeoutMs: 2500,
      concurrency: 2,
    });
  });

  it("should map unsuccessful Rust envelopes to NetworkTestResponse errors", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: false,
      error: "address could not be resolved",
    });

    await expect(client.tcpPing("example.com", 443)).resolves.toEqual({
      success: false,
      error: "address could not be resolved",
    });
  });

  it("should call Rust ping endpoint and map the response", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        target: "https://example.com/",
        reachable: true,
        method: "http-head",
        port: 443,
        latencyMs: 20,
        source: "rust-network-tools",
      },
    });

    const result = await client.ping("https://example.com");

    expect(result.success).toBe(true);
    expect(result.data.method).toBe("http-head");
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/network/ping", {
      target: "https://example.com",
      timeoutMs: 2500,
    });
  });

  it("should call Rust ping endpoint with bare public IP targets", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        target: "134.209.101.203",
        reachable: true,
        method: "tcp-default",
        port: 22,
        latencyMs: 18,
        source: "rust-network-tools",
      },
    });

    const result = await client.ping("134.209.101.203");

    expect(result.success).toBe(true);
    expect(result.data.method).toBe("tcp-default");
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/network/ping", {
      target: "134.209.101.203",
      timeoutMs: 2500,
    });
  });

  it("should call Rust speed endpoint with maxBytes", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        url: "https://example.com/",
        statusCode: 200,
        bytesRead: 4096,
        totalMs: 100,
        throughputBytesPerSec: 40960,
        truncated: true,
        source: "rust-network-tools",
      },
    });

    const result = await client.speedTest("https://example.com");

    expect(result.success).toBe(true);
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/network/speed", {
      url: "https://example.com",
      timeoutMs: 2500,
      maxBytes: 4096,
    });
  });

  it("should call Rust DNS, HTTP timing, and TLS timing endpoints", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson
      .mockResolvedValueOnce({
        success: true,
        data: {
          address: "example.com",
          records: [{ recordType: "A", value: "93.184.216.34" }],
          source: "rust-network-tools",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          url: "https://example.com/",
          statusCode: 200,
          dnsMs: 1,
          connectMs: 2,
          tlsMs: 3,
          ttfbMs: 4,
          totalMs: 5,
          bytesRead: 6,
          truncated: false,
          source: "rust-network-tools",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          address: "example.com",
          port: 443,
          dnsMs: 1,
          connectMs: 2,
          tlsHandshakeMs: 3,
          certificateCount: 1,
          source: "rust-network-tools",
        },
      });

    await expect(client.dnsResolve("example.com", ["A"])).resolves.toMatchObject({ success: true });
    await expect(client.httpTiming("https://example.com", "HEAD")).resolves.toMatchObject({ success: true });
    await expect(client.tlsTiming("example.com", { port: 443, serverName: "example.com" })).resolves.toMatchObject({
      success: true,
    });

    expect(internalClient.postJson).toHaveBeenNthCalledWith(1, "/v1/network/dns", {
      address: "example.com",
      recordTypes: ["A"],
      timeoutMs: 2500,
    });
    expect(internalClient.postJson).toHaveBeenNthCalledWith(2, "/v1/network/http-timing", {
      url: "https://example.com",
      method: "HEAD",
      timeoutMs: 2500,
      maxBytes: 4096,
    });
    expect(internalClient.postJson).toHaveBeenNthCalledWith(3, "/v1/network/tls-timing", {
      address: "example.com",
      port: 443,
      serverName: "example.com",
      timeoutMs: 2500,
    });
  });

  it("should block private IP targets before calling Rust when enabled", async () => {
    const { client, internalClient } = createClient();

    await expect(client.tcpPing("127.0.0.1", 80)).rejects.toMatchObject({
      code: "bad_request",
      statusCode: 400,
    });
    await expect(client.tcpPing("::ffff:127.0.0.1", 80)).rejects.toMatchObject({
      code: "bad_request",
      statusCode: 400,
    });
    expect(internalClient.postJson).not.toHaveBeenCalled();
  });

  it("should block private URL targets before calling Rust when enabled", async () => {
    const { client, internalClient } = createClient();

    await expect(client.speedTest("http://127.0.0.1/status")).rejects.toMatchObject({
      code: "bad_request",
      statusCode: 400,
    });
    expect(internalClient.postJson).not.toHaveBeenCalled();
  });

  it("should allow private targets when blocking is disabled", async () => {
    const { client, internalClient } = createClient({ blockPrivateTargets: false });
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        address: "127.0.0.1",
        port: 80,
        reachable: false,
        source: "rust-network-tools",
      },
    });

    await expect(client.tcpPing("127.0.0.1", 80)).resolves.toMatchObject({ success: true });
    expect(internalClient.postJson).toHaveBeenCalled();
  });

  it("should propagate operational internal client errors", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockRejectedValueOnce(
      new InternalServiceClientError("rust-network-tools timed out after 2500ms", {
        code: "timeout",
        serviceName: "rust-network-tools",
      }),
    );

    await expect(client.tcpPing("example.com", 443)).rejects.toMatchObject({
      code: "timeout",
    });
  });
});
