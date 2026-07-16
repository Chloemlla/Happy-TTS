/**
 * Frontend Command Manager payload decrypt helper.
 * Supports versioned AES-GCM responses and legacy AES-CBC payloads.
 */
import CryptoJS from 'crypto-js';

export type CommandEncryptedEnvelope = {
  version?: number;
  algorithm?: string;
  data: string;
  iv: string;
  tag?: string;
  success?: boolean;
};

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

async function decryptAesGcm(dataHex: string, ivHex: string, tagHex: string, token: string): Promise<string> {
  const keyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const key = await crypto.subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, ['decrypt']);
  const data = hexToBytes(dataHex);
  const tag = hexToBytes(tagHex);
  const iv = hexToBytes(ivHex);
  const cipherBytes = new Uint8Array(data.length + tag.length);
  cipherBytes.set(data, 0);
  cipherBytes.set(tag, data.length);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipherBytes as BufferSource,
  );
  return new TextDecoder().decode(plainBuf);
}

function decryptAesCbcLegacy(dataHex: string, ivHex: string, token: string): string {
  const keyBytes = CryptoJS.SHA256(token);
  const ivBytes = CryptoJS.enc.Hex.parse(ivHex);
  const encryptedBytes = CryptoJS.enc.Hex.parse(dataHex);
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: encryptedBytes } as unknown as Parameters<typeof CryptoJS.AES.decrypt>[0],
    keyBytes,
    {
      iv: ivBytes,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    },
  );
  const result = decrypted.toString(CryptoJS.enc.Utf8);
  if (!result) {
    throw new Error('解密失败');
  }
  return result;
}

export async function decryptCommandEnvelope(
  envelope: CommandEncryptedEnvelope,
  token: string,
): Promise<unknown> {
  if (!envelope?.data || !envelope?.iv) {
    throw new Error('无效的加密载荷');
  }

  if (envelope.version === 2 || envelope.algorithm === 'aes-256-gcm' || envelope.tag) {
    if (!envelope.tag) {
      throw new Error('缺少 GCM 校验标签');
    }
    const json = await decryptAesGcm(envelope.data, envelope.iv, envelope.tag, token);
    return JSON.parse(json);
  }

  const json = decryptAesCbcLegacy(envelope.data, envelope.iv, token);
  return JSON.parse(json);
}

// Keep helper exported for diagnostics without logging secrets.
export function summarizeEnvelope(envelope: CommandEncryptedEnvelope): string {
  return `v${envelope.version ?? 1}/${envelope.algorithm ?? 'aes-256-cbc'}/data=${envelope.data?.length ?? 0}`;
}

// Silence unused helper warnings in some bundlers.
void bytesToBase64;
