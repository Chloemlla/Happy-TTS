import { RustSecurityWorkerClient } from "../services/rustSecurityWorkerClient";

describe("RustSecurityWorkerClient", () => {
  const createClient = () => {
    const internalClient = {
      getHealth: jest.fn(),
      postJson: jest.fn(),
    };
    const client = new RustSecurityWorkerClient({ internalClient });

    return { client, internalClient };
  };

  it("should verify proof-of-work through the Rust security-worker", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        valid: true,
        hash: "00abcdef",
        difficultyBits: 8,
        source: "rust-security-worker",
      },
    });

    const result = await client.verifyPow({
      challenge: "challenge",
      nonce: "42",
      difficultyBits: 8,
    });

    expect(result.valid).toBe(true);
    expect(internalClient.postJson).toHaveBeenCalledWith("/v1/security/pow/verify", {
      challenge: "challenge",
      nonce: "42",
      difficultyBits: 8,
    });
  });

  it("should verify HMAC requests", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        valid: true,
        algorithm: "sha256",
        source: "rust-security-worker",
      },
    });

    await expect(
      client.verifyHmac({
        algorithm: "sha256",
        keyBase64: Buffer.from("key").toString("base64"),
        messageBase64: Buffer.from("message").toString("base64"),
        signatureHex: "abcdef",
      }),
    ).resolves.toMatchObject({ valid: true, algorithm: "sha256" });
  });

  it("should decode decrypted envelope bytes", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: true,
      data: {
        plaintextBase64: Buffer.from("plain").toString("base64"),
        algorithm: "aes-256-gcm",
        source: "rust-security-worker",
      },
    });

    const result = await client.decryptEnvelope({
      keyBase64: Buffer.alloc(32).toString("base64"),
      nonceBase64: Buffer.alloc(12).toString("base64"),
      ciphertextBase64: Buffer.from("ciphertext").toString("base64"),
    });

    expect(result.plaintextBuffer.toString()).toBe("plain");
  });

  it("should score risk and scan content", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson
      .mockResolvedValueOnce({
        success: true,
        data: {
          score: 50,
          reasons: ["vpn=true"],
          source: "rust-security-worker",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          matched: true,
          matches: [{ ruleId: "r1", pattern: "secret", severity: 5, count: 2 }],
          source: "rust-security-worker",
        },
      });

    await expect(client.scoreRisk({ vpn: true })).resolves.toMatchObject({ score: 50 });
    await expect(
      client.scanContent({
        text: "secret secret",
        rules: [{ id: "r1", pattern: "secret", severity: 5 }],
      }),
    ).resolves.toMatchObject({ matched: true });
  });

  it("should reject unsuccessful envelopes", async () => {
    const { client, internalClient } = createClient();
    internalClient.postJson.mockResolvedValueOnce({
      success: false,
      error: "bad request",
    });

    await expect(
      client.verifyPow({
        challenge: "challenge",
        nonce: "42",
        difficultyBits: 8,
      }),
    ).rejects.toMatchObject({
      code: "service_error",
    });
  });
});
