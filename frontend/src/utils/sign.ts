import CryptoJS from 'crypto-js';

/**
 * G9-13：注意——这是无密钥的 SHA256 校验和，不是密码学签名。
 * 攻击者修改内容后可重新计算相同校验和，因此它只能作为"内容未被意外损坏"的
 * 完整性检查，不能作为防篡改/防重放的安全边界。真正的防篡改需要服务端密钥
 * 下发的 HMAC（见 G9-13 跨组依赖，由后端配合落实）。
 */

export function signContent(content: string): string {
  return CryptoJS.SHA256(content).toString();
}

export function verifyContent(content: string, signature: string): boolean {
  const expected = signContent(content);
  return expected === signature;
}
