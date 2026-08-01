export interface WebSocketUrlOptions {
  configuredUrl?: string;
  apiBaseUrl?: string;
  browserOrigin: string;
}

export function normalizeWebSocketUrl(rawUrl: string, browserOrigin: string): string {
  const url = new URL(rawUrl, browserOrigin);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.pathname === '/' || !url.pathname) url.pathname = '/ws';
  // Credentials belong in the HttpOnly session Cookie, never in URLs/logs.
  for (const credentialName of ['token', 'jwt', 'access_token', 'accessToken', 'authorization']) {
    url.searchParams.delete(credentialName);
  }
  return url.toString();
}

export function buildWebSocketUrl(options: WebSocketUrlOptions): string {
  const configuredUrl = options.configuredUrl?.trim();
  if (configuredUrl) {
    return normalizeWebSocketUrl(configuredUrl, options.browserOrigin);
  }

  const baseUrl = options.apiBaseUrl || options.browserOrigin;
  const wsBase = baseUrl
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://');

  return normalizeWebSocketUrl(`${wsBase.replace(/\/+$/, '')}/ws`, options.browserOrigin);
}
