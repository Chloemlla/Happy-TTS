import { buildWebSocketUrl, normalizeWebSocketUrl } from './webSocketUrl';

describe('WebSocket URL authentication', () => {
  it('uses the WebSocket protocol without placing credentials in the URL', () => {
    const normalized = new URL(
      normalizeWebSocketUrl(
        'https://example.com/ws?channel=status&token=secret-jwt&access_token=another-secret',
        'https://app.example.com',
      ),
    );

    expect(normalized.protocol).toBe('wss:');
    expect(normalized.pathname).toBe('/ws');
    expect(normalized.searchParams.get('channel')).toBe('status');
    expect(normalized.searchParams.has('token')).toBe(false);
    expect(normalized.searchParams.has('access_token')).toBe(false);
    expect(normalized.toString()).not.toContain('secret-jwt');
  });

  it('builds the default URL from the API origin without a credential query', () => {
    const url = new URL(
      buildWebSocketUrl({
        apiBaseUrl: 'https://api.example.com',
        browserOrigin: 'https://app.example.com',
      }),
    );

    expect(url.toString()).toBe('wss://api.example.com/ws');
    expect(url.search).toBe('');
  });
});
