import { isIP } from "node:net";
import { config } from "../config/config";
import type { NetworkTestResponse } from "./networkService";
import {
  InternalServiceClient,
  InternalServiceClientError,
  type InternalServiceEnvelope,
} from "./internalServiceClient";

const DEFAULT_PORT_SCAN_PORTS = [21, 22, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 5432, 6379, 8080, 8443];
const RUST_SOURCE = "rust-network-tools";

interface RustNetworkToolsClientOptions {
  internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  timeoutMs: number;
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

export class RustNetworkToolsClient {
  private readonly internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
  private readonly timeoutMs: number;
  private readonly defaultPortScanPorts: number[];
  private readonly concurrency: number;
  private readonly blockPrivateTargets: boolean;

  public constructor(options: RustNetworkToolsClientOptions) {
    this.internalClient = options.internalClient;
    this.timeoutMs = options.timeoutMs;
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
      }),
      timeoutMs: config.rustServices.networkTools.timeoutMs,
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
    const normalized = address.trim().toLowerCase();
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

export const rustNetworkToolsClient = RustNetworkToolsClient.fromConfig();

