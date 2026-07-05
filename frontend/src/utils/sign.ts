import CryptoJS from 'crypto-js';

export function signContent(content: string): string {
  return CryptoJS.SHA256(content).toString();
}

export function verifyContent(content: string, signature: string): boolean {
  const expected = signContent(content);
  return expected === signature;
}
