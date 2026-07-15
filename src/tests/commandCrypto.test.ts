import { decryptCommandPayload, encryptCommandPayload } from "../utils/commandCrypto";

describe("commandCrypto", () => {
  const token = "test-admin-token";

  it("round-trips AES-GCM payloads", () => {
    const payload = { command: "echo hi", ok: true };
    const encrypted = encryptCommandPayload(payload, token);
    expect(encrypted.version).toBe(2);
    expect(encrypted.algorithm).toBe("aes-256-gcm");
    expect(encrypted.tag).toBeTruthy();
    expect(decryptCommandPayload(encrypted, token)).toEqual(payload);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptCommandPayload({ a: 1 }, token);
    const tampered = { ...encrypted, data: encrypted.data.replace(/0/g, "1").replace(/1/g, "0") };
    expect(() => decryptCommandPayload(tampered, token)).toThrow();
  });
});
