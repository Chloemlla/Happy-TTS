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

  it("should block private IP targets before calling Rust when enabled", async () => {
    const { client, internalClient } = createClient();

    await expect(client.tcpPing("127.0.0.1", 80)).rejects.toMatchObject({
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

