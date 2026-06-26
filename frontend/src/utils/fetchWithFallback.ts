// 使用统一 API base URL 发起请求
import { getApiBaseUrl } from '../api/api';
import { canonicalizeBackendApiUrl } from './apiPath';

export async function fetchWithFallback(input: string, init?: RequestInit) {
  const apiUrl = getApiBaseUrl();
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
    throw e;
  }
} 
