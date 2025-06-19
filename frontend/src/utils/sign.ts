import CryptoJS from 'crypto-js';

const SECRET_KEY = 'w=NKYzE?jZHbqmG1k4m6B!.Yp9t5)HY@LsMnN~UK9i'; // 生产环境不要暴露密钥

export function signContent(content: string): string {
  return CryptoJS.HmacSHA256(content, SECRET_KEY).toString();
}

export function verifyContent(content: string, signature: string): boolean {
  const expected = signContent(content);
  return expected === signature;
} 