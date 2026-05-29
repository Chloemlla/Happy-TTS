// 用于开发环境下主 API 失败时自动降级到 localhost:3000
import { canonicalizeBackendApiUrl } from './apiPath';

export async function fetchWithFallback(input: string, init?: RequestInit) {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const canonicalInput = canonicalizeBackendApiUrl(input);
  let url = canonicalInput.startsWith('http') ? canonicalInput : apiUrl.replace(/\/$/, '') + (canonicalInput.startsWith('/') ? canonicalInput : '/' + canonicalInput);
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error('Primary API failed');
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error('API 响应不是 JSON，实际返回：' + text.slice(0, 100));
    }
    return res;
  } catch (e) {
    // 仅开发环境降级
    if (import.meta.env.DEV && apiUrl && !url.startsWith('http://localhost:3000')) {
      try {
        const fallbackUrl = canonicalInput.startsWith('http') ? canonicalInput : 'http://localhost:3000' + canonicalInput;
        const res2 = await fetch(fallbackUrl, init);
        return res2;
      } catch (e2) {
        throw e2;
      }
    }
    throw e;
  }
} 
