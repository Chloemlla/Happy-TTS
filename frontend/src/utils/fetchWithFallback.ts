// 使用统一 API base URL 发起请求
import { getApiBaseUrl } from '../api/api';
import { canonicalizeBackendApiUrl } from './apiPath';
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * G9-31：本函数没有任何"回退"数据源——它只是把输入路径规范化后打到统一 API base URL，
 * 并校验响应为 JSON 的普通 fetch 包装。为避免误导调用方，已从 fetchWithFallback 改名。
 * 如需真正的降级（CDN 镜像/本地缓存），应由业务层显式实现。
 */
export async function fetchCanonicalJson(input: string, init?: RequestInit) {
  const apiUrl = getApiBaseUrl();
  const canonicalInput = canonicalizeBackendApiUrl(input);
  const url = canonicalInput.startsWith('http')
    ? canonicalInput
    : apiUrl.replace(/\/$/, '') + (canonicalInput.startsWith('/') ? canonicalInput : '/' + canonicalInput);
  const res = await fetchWithTimeout(url, { ...init, credentials: 'include' });
  if (!res.ok) throw new Error('Primary API failed');
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error('API 响应不是 JSON，实际返回：' + text.slice(0, 100));
  }
  return res;
}
