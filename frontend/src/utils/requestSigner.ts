/**
 * 请求防重放签名工具
 *
 * 为关键 API 请求自动附加 x-timestamp / x-nonce / x-signature 头，
 * 服务端通过 replayProtection 中间件校验。
 *
 * 用法：
 *   import { signedFetch, getSignHeaders } from '@/utils/requestSigner';
 *
 *   // 方式一：直接使用 signedFetch（包装 fetch）
 *   await signedFetch('/api/cdk/redeem', { method: 'POST', body: JSON.stringify(data) });
 *
 *   // 方式二：获取签名头，手动附加到 axios / fetch
 *   const headers = await getSignHeaders(bodyString);
 *   api.post(url, data, { headers });
 */

const SIGN_SECRET = import.meta.env.VITE_SIGN_SECRET_KEY || 'w=NKYzE?jZHbqmG1k4m6B!.Yp9t5)HY@LsMnN~UK9i';

/**
 * 生成 16 字节随机 hex nonce（32 字符）
 */
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * HMAC-SHA256 签名（Web Crypto API）
 */
async function hmacSha256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 生成防重放签名头
 * @param body 请求体字符串（JSON.stringify 后的结果，GET 请求传空字符串）
 */
export async function getSignHeaders(body: string = ''): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const nonce = generateNonce();
  const payload = `${timestamp}${nonce}${body}`;
  const signature = await hmacSha256(SIGN_SECRET, payload);

  return {
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-signature': signature,
  };
}

/**
 * 带签名的 fetch 包装
 */
export async function signedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const bodyStr = typeof init.body === 'string' ? init.body : '';
  const signHeaders = await getSignHeaders(bodyStr);

  const headers = new Headers(init.headers);
  Object.entries(signHeaders).forEach(([k, v]) => headers.set(k, v));

  return fetch(input, { ...init, headers });
}
