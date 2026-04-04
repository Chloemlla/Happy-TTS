import { api } from './api';

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

export async function fetchDeepLXConfig(): Promise<DeepLXConfigResponse> {
  const response = await api.get<DeepLXConfigResponse>('/api/deeplx/config');
  return response.data;
}

export async function translateWithDeepLX(
  payload: DeepLXTranslatePayload,
  signal?: AbortSignal,
): Promise<DeepLXTranslateResponse> {
  const response = await api.post<DeepLXTranslateResponse>('/api/deeplx/translate', payload, {
    signal,
  });
  return response.data;
}
