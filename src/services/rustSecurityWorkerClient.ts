import { config } from "../config/config";
import {
  InternalServiceClient,
  InternalServiceClientError,
  type InternalServiceEnvelope,
} from "./internalServiceClient";

const RUST_SECURITY_WORKER_SOURCE = "rust-security-worker";

export interface RustSecurityWorkerClientOptions {
  internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;
}

export interface RustPowVerifyResult {
  valid: boolean;
  hash: string;
  difficultyBits: number;
  source: typeof RUST_SECURITY_WORKER_SOURCE;
}

export interface RustHmacVerifyResult {
  valid: boolean;
  algorithm: "sha256" | "sha512";
  source: typeof RUST_SECURITY_WORKER_SOURCE;
}

export interface RustEnvelopeDecryptResult {
  plaintextBase64: string;
  plaintextBuffer: Buffer;
  algorithm: string;
  source: typeof RUST_SECURITY_WORKER_SOURCE;
}

export interface RustRiskScoreResult {
  score: number;
  reasons: string[];
  source: typeof RUST_SECURITY_WORKER_SOURCE;
}

export interface RustContentRule {
  id: string;
  pattern: string;
  severity?: number;
}

export interface RustContentRuleMatch {
  ruleId: string;
  pattern: string;
  severity: number;
  count: number;
}

export interface RustContentScanResult {
  matched: boolean;
  matches: RustContentRuleMatch[];
  source: typeof RUST_SECURITY_WORKER_SOURCE;
}

export class RustSecurityWorkerClient {
  private readonly internalClient: Pick<InternalServiceClient, "getHealth" | "postJson">;

  public constructor(options: RustSecurityWorkerClientOptions) {
    this.internalClient = options.internalClient;
  }

  public static fromConfig(): RustSecurityWorkerClient {
    return new RustSecurityWorkerClient({
      internalClient: new InternalServiceClient({
        baseUrl: config.rustServices.securityWorker.url,
        internalToken: config.rustServices.internalToken,
        timeoutMs: config.rustServices.securityWorker.timeoutMs,
        serviceName: RUST_SECURITY_WORKER_SOURCE,
      }),
    });
  }

  public async getHealth() {
    return this.internalClient.getHealth();
  }

  public async verifyPow(input: {
    challenge: string;
    nonce: string;
    difficultyBits: number;
  }): Promise<RustPowVerifyResult> {
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustPowVerifyResult>>(
      "/v1/security/pow/verify",
      {
        challenge: input.challenge,
        nonce: input.nonce,
        difficultyBits: input.difficultyBits,
      },
    );

    return this.unwrap(response, "rust-security-worker returned an unsuccessful PoW response");
  }

  public async verifyHmac(input: {
    algorithm?: "sha256" | "sha512";
    keyBase64: string;
    messageBase64: string;
    signatureHex: string;
  }): Promise<RustHmacVerifyResult> {
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustHmacVerifyResult>>(
      "/v1/security/hmac/verify",
      {
        algorithm: input.algorithm,
        keyBase64: input.keyBase64,
        messageBase64: input.messageBase64,
        signatureHex: input.signatureHex,
      },
    );

    return this.unwrap(response, "rust-security-worker returned an unsuccessful HMAC response");
  }

  public async decryptEnvelope(input: {
    algorithm?: "aes-256-gcm";
    keyBase64: string;
    nonceBase64: string;
    ciphertextBase64: string;
    aadBase64?: string;
  }): Promise<RustEnvelopeDecryptResult> {
    const response = await this.internalClient.postJson<
      InternalServiceEnvelope<{
        plaintextBase64: string;
        algorithm: string;
        source: typeof RUST_SECURITY_WORKER_SOURCE;
      }>
    >("/v1/security/envelope/decrypt", {
      algorithm: input.algorithm,
      keyBase64: input.keyBase64,
      nonceBase64: input.nonceBase64,
      ciphertextBase64: input.ciphertextBase64,
      aadBase64: input.aadBase64,
    });
    const data = this.unwrap(response, "rust-security-worker returned an unsuccessful envelope response");

    return {
      ...data,
      plaintextBuffer: Buffer.from(data.plaintextBase64, "base64"),
    };
  }

  public async scoreRisk(signals: Record<string, unknown>): Promise<RustRiskScoreResult> {
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustRiskScoreResult>>(
      "/v1/security/risk/score",
      { signals },
    );

    return this.unwrap(response, "rust-security-worker returned an unsuccessful risk score response");
  }

  public async scanContent(input: {
    text: string;
    rules: RustContentRule[];
    caseSensitive?: boolean;
  }): Promise<RustContentScanResult> {
    const response = await this.internalClient.postJson<InternalServiceEnvelope<RustContentScanResult>>(
      "/v1/security/content/scan",
      {
        text: input.text,
        rules: input.rules,
        caseSensitive: input.caseSensitive,
      },
    );

    return this.unwrap(response, "rust-security-worker returned an unsuccessful content scan response");
  }

  private unwrap<T>(response: InternalServiceEnvelope<T>, fallbackMessage: string): T {
    if (!response.success || !response.data) {
      throw new InternalServiceClientError(response.error || fallbackMessage, {
        code: "service_error",
        serviceName: RUST_SECURITY_WORKER_SOURCE,
      });
    }

    return response.data;
  }
}

export const rustSecurityWorkerClient = RustSecurityWorkerClient.fromConfig();
