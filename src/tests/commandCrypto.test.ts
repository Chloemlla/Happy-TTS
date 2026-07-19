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
    const flipped = (parseInt(encrypted.data.slice(0, 2), 16) ^ 0xff)
      .toString(16)
      .padStart(2, "0");
    const tampered = { ...encrypted, data: flipped + encrypted.data.slice(2) };
    expect(() => decryptCommandPayload(tampered, token)).toThrow();
  });
});

