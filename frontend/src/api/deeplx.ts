import getApiBaseUrl from '../api';

export interface DeepLXConfigResponse {
  enabled: boolean;
  requiresApiKey: boolean;
  baseUrl: string;
  endpointPath: string;
}

export interface DeepLXTranslatePayload {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface DeepLXTranslateResponse {
  success: boolean;
  translatedText: string;
  alternatives: string[];
  sourceLang: string;
  targetLang: string;
}

async function parseJsonOrError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((data && data.error) || fallback);
  }
  return data;
}

export async function fetchDeepLXConfig(): Promise<DeepLXConfigResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/deeplx/config`, {
    credentials: 'include',
  });

  return parseJsonOrError(response, '获取 DeepLX 配置失败') as Promise<DeepLXConfigResponse>;
}

export async function translateWithDeepLX(
  payload: DeepLXTranslatePayload,
  signal?: AbortSignal,
): Promise<DeepLXTranslateResponse> {
  const response = await fetch(`${getApiBaseUrl()}/api/deeplx/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    signal,
    body: JSON.stringify(payload),
  });

  return parseJsonOrError(response, 'DeepLX 翻译失败') as Promise<DeepLXTranslateResponse>;
}
