import { isIP } from "node:net";
import { config } from "../config/config";
import type { NetworkTestResponse } from "./networkService";
import {
  InternalServiceClient,
  InternalServiceClientError,
  type InternalServiceEnvelope,
} from "./internalServiceClient";
import { buildRustIpcPath } from "./rustSharedMemoryIpcClient";

const DEFAULT_PORT_SCAN_PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 5432, 6379, 8080, 8443];
const RUST_SOURCE = "rust-network-tools";

interface RustNetworkToolsClientOptions {
  internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  timeoutMs: number;
  maxResponseBytes?: number;
  defaultPortScanPorts?: number[];
  concurrency?: number;
  blockPrivateTargets?: boolean;
}

interface RustTcpingData {
  address: string;
  port: number;
  reachable: boolean;
  latencyMs?: number;
  source: typeof RUST_SOURCE;
}

interface RustPortScanData {
  address: string;
  scannedPorts: number[];
  openPorts: number[];
  results: Array<{
    port: number;
    open: boolean;
    latencyMs?: number;
  }>;
  source: typeof RUST_SOURCE;
}

interface RustPingData {
  target: string;
  reachable: boolean;
  method: string;
  port?: number;
  latencyMs?: number;
  error?: string;
  source: typeof RUST_SOURCE;
}

interface RustSpeedData {
  url: string;
  statusCode?: number;
  bytesRead: number;
  totalMs: number;
  ttfbMs?: number;
  throughputBytesPerSec?: number;
  truncated: boolean;
  source: typeof RUST_SOURCE;
}

interface RustDnsData {
  address: string;
  records: Array<{
    recordType: string;
    value: string;
  }>;
  source: typeof RUST_SOURCE;
}

interface RustHttpTimingData {
  url: string;
  statusCode?: number;
  dnsMs: number;
  connectMs: number;
  tlsMs?: number;
  ttfbMs?: number;
  totalMs: number;
  bytesRead: number;
  truncated: boolean;
  source: typeof RUST_SOURCE;
}

interface RustTlsTimingData {
  address: string;
  port: number;
  dnsMs: number;
  connectMs: number;
  tlsHandshakeMs: number;
  certificateCount: number;
  certificate?: {
    subject?: string;
    issuer?: string;
    notAfter?: string;
  };
  source: typeof RUST_SOURCE;
}

export class RustNetworkToolsClient {
  private readonly internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly defaultPortScanPorts: number[];
  private readonly concurrency: number;
  private readonly blockPrivateTargets: boolean;

  public constructor(options: RustNetworkToolsClientOptions) {
    this.internalClient = options.internalClient;
    this.timeoutMs = options.timeoutMs;
    this.maxResponseBytes = options.maxResponseBytes || 1024 * 1024;
    this.defaultPortScanPorts = options.defaultPortScanPorts || DEFAULT_PORT_SCAN_PORTS;
    this.concurrency = options.concurrency || 32;
    this.blockPrivateTargets = options.blockPrivateTargets ?? true;
  }

  public static fromConfig(): RustNetworkToolsClient {
    return new RustNetworkToolsClient({
      internalClient: new InternalServiceClient({
        baseUrl: config.rustServices.networkTools.url,
        internalToken: config.rustServices.internalToken,
        timeoutMs: config.rustServices.networkTools.timeoutMs,
        serviceName: RUST_SOURCE,
        ipc: {
          enabled: config.rustServices.ipc.enabled,
          serviceName: RUST_SOURCE,
          filePath: buildRustIpcPath(config.rustServices.ipc.dir, "network-tools"),
          sizeBytes: config.rustServices.ipc.channelBytes,
        },
      }),
      timeoutMs: config.rustServices.networkTools.timeoutMs,
      maxResponseBytes: config.rustServices.networkTools.maxResponseBytes,
      blockPrivateTargets: config.rustServices.networkTools.blockPrivateTargets,
    });
  }

  public async getHealth() {
    return this.internalClient.getHealth();
  }

  public async tcpPing(address: string, port: number): Promise<NetworkTestResponse> {
    this.assertAllowedTarget(address);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustTcpingData>>("/v1/network/tcping", {
      address,
      port,
      timeoutMs: this.timeoutMs,
    });

    return this.toNetworkResponse(response, "TCP连接检测失败");
  }

  public async portScan(address: string, ports: number[] = this.defaultPortScanPorts): Promise<NetworkTestResponse> {
    this.assertAllowedTarget(address);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustPortScanData>>("/v1/network/portscan", {
      address,
      ports,
      timeoutMs: this.timeoutMs,
      concurrency: Math.min(this.concurrency, ports.length || this.concurrency),
    });

    return this.toNetworkResponse(response, "端口扫描失败");
  }

  public async ping(target: string): Promise<NetworkTestResponse> {
    this.assertAllowedTarget(target);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustPingData>>("/v1/network/ping", {
      target,
      timeoutMs: this.timeoutMs,
    });

    return this.toNetworkResponse(response, "Ping检测失败");
  }

  public async speedTest(url: string): Promise<NetworkTestResponse> {
    this.assertAllowedTarget(url);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustSpeedData>>("/v1/network/speed", {
      url,
      timeoutMs: this.timeoutMs,
      maxBytes: this.maxResponseBytes,
    });

    return this.toNetworkResponse(response, "网站测速失败");
  }

  public async dnsResolve(address: string, recordTypes?: string[]): Promise<NetworkTestResponse> {
    this.assertAllowedTarget(address);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustDnsData>>("/v1/network/dns", {
      address,
      recordTypes,
      timeoutMs: this.timeoutMs,
    });

    return this.toNetworkResponse(response, "DNS解析失败");
  }

  public async httpTiming(url: string, method: "GET" | "HEAD" = "GET"): Promise<NetworkTestResponse> {
    this.assertAllowedTarget(url);
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustHttpTimingData>>(
      "/v1/network/http-timing",
      {
        url,
        method,
        timeoutMs: this.timeoutMs,
        maxBytes: this.maxResponseBytes,
      },
    );

    return this.toNetworkResponse(response, "HTTP timing检测失败");
  }

  public async tlsTiming(address: string, options: { port?: number; serverName?: string } = {}): Promise<NetworkTestResponse> {
    this.assertAllowedTarget(address);
    if (options.serverName) {
      this.assertAllowedTarget(options.serverName);
    }
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustTlsTimingData>>(
      "/v1/network/tls-timing",
      {
        address,
        port: options.port,
        serverName: options.serverName,
        timeoutMs: this.timeoutMs,
      },
    );

    return this.toNetworkResponse(response, "TLS timing检测失败");
  }

  private toNetworkResponse<T>(response: InternalServiceEnvelope<T>, fallbackError: string): NetworkTestResponse {
    if (!response.success || !response.data) {
      return {
        success: false,
        error: response.error || fallbackError,
      };
    }

    return {
      success: true,
      data: response.data,
    };
  }

  private assertAllowedTarget(address: string): void {
    const normalized = extractTargetHost(address.trim().toLowerCase());
    if (!normalized) {
      throw new InternalServiceClientError("rust-network-tools target address is required", {
        code: "bad_request",
        serviceName: RUST_SOURCE,
        statusCode: 400,
      });
    }

    if (!this.blockPrivateTargets) return;

    if (normalized === "localhost" || normalized.endsWith(".localhost")) {
      this.throwBlockedTarget();
    }

    if (isIP(normalized) && isBlockedPrivateIp(normalized)) {
      this.throwBlockedTarget();
    }
  }

  private throwBlockedTarget(): never {
    throw new InternalServiceClientError("rust-network-tools private or reserved target addresses are blocked", {
      code: "bad_request",
      serviceName: RUST_SOURCE,
      statusCode: 400,
    });
  }
}

function isBlockedPrivateIp(address: string): boolean {
  const ipVersion = isIP(address);
  if (ipVersion === 4) {
    const octets = address.split(".").map((part) => Number(part));
    const [first, second, third] = octets;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113)
    );
  }

  if (ipVersion === 6) {
    const mappedIpv4 = extractIpv4MappedIpv6(address);
    if (mappedIpv4) {
      return isBlockedPrivateIp(mappedIpv4);
    }

    return (
      address === "::1" ||
      address === "::" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      address.startsWith("fe80") ||
      address.startsWith("ff") ||
      address.startsWith("2001:db8")
    );
  }

  return false;
}

function extractIpv4MappedIpv6(address: string): string | null {
  const normalized = address.toLowerCase();
  const dottedMatch = normalized.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedMatch && isIP(dottedMatch[1]) === 4) {
    return dottedMatch[1];
  }

  const hexMatch = normalized.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hexMatch) {
    return null;
  }

  const high = Number.parseInt(hexMatch[1], 16);
  const low = Number.parseInt(hexMatch[2], 16);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high > 0xffff || low > 0xffff) {
    return null;
  }

  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

export const rustNetworkToolsClient = RustNetworkToolsClient.fromConfig();

function extractTargetHost(value: string): string {
  if (!value) return "";

  try {
    const candidate = value.includes("://") ? value : `http://${value}`;
    const parsed = new URL(candidate);
    return parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch (_error) {
    return value;
  }
}
