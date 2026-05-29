const exactReplacements = new Map<string, string>([
  ['/api-docs.json', '/api/openapi.json'],
  ['/openapi.json', '/api/openapi.json'],
  ['/health', '/api/health'],
  ['/server_status', '/api/server_status'],
  ['/status', '/api/status'],
  ['/ip', '/api/ip'],
  ['/report-ip', '/api/report-ip'],
  ['/ip-location', '/api/ip-location'],
  ['/proxy-test', '/api/proxy-test'],
  ['/timing-test', '/api/timing-test'],
  ['/report-docs-timeout', '/api/report-docs-timeout'],
  ['/lc', '/api/lc'],
  ['/librechat-image', '/api/librechat-image'],
]);

const prefixReplacements: Array<{ from: string; to: string }> = [
  { from: '/auth', to: '/api/auth' },
  { from: '/tts', to: '/api/tts' },
  { from: '/totp', to: '/api/totp' },
  { from: '/passkey', to: '/api/passkey' },
  { from: '/admin', to: '/api/admin' },
  { from: '/command', to: '/api/command' },
  { from: '/data-collection', to: '/api/data-collection' },
  { from: '/data', to: '/api/data' },
  { from: '/deeplx', to: '/api/deeplx' },
  { from: '/media', to: '/api/media' },
  { from: '/social', to: '/api/social' },
  { from: '/life', to: '/api/life' },
  { from: '/network', to: '/api/network' },
  { from: '/ipfs', to: '/api/ipfs' },
  { from: '/librechat', to: '/api/librechat' },
  { from: '/libre-chat', to: '/api/libre-chat' },
  { from: '/turnstile', to: '/api/turnstile' },
  { from: '/human-check', to: '/api/human-check' },
  { from: '/shorturl', to: '/api/shorturl' },
  { from: '/cdks', to: '/api/cdks' },
  { from: '/lottery', to: '/api/lottery' },
  { from: '/resources', to: '/api/resources' },
  { from: '/categories', to: '/api/categories' },
  { from: '/sharelog', to: '/api/sharelog' },
  { from: '/logs', to: '/api/logs' },
  { from: '/tickets', to: '/api/tickets' },
  { from: '/webhook-events', to: '/api/webhook-events' },
  { from: '/webhooks', to: '/api/webhooks' },
  { from: '/github-billing', to: '/api/github-billing' },
  { from: '/nexai', to: '/api/nexai' },
  { from: '/apikeys', to: '/api/apikeys' },
  { from: '/email', to: '/api/email' },
  { from: '/outemail', to: '/api/outemail' },
  { from: '/frontend-config', to: '/api/frontend-config' },
  { from: '/policy', to: '/api/policy' },
  { from: '/tamper', to: '/api/tamper' },
  { from: '/miniapi', to: '/api/miniapi' },
  { from: '/anta', to: '/api/anta' },
  { from: '/modlist', to: '/api/modlist' },
  { from: '/image-data', to: '/api/image-data' },
  { from: '/fbi-wanted', to: '/api/fbi-wanted' },
];

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function resolveLegacyShortUrlApiPath(pathname: string): string | null {
  if (hasPathPrefix(pathname, '/s/admin')) {
    return `/api/shorturl${pathname.slice('/s'.length)}`;
  }

  if (hasPathPrefix(pathname, '/s/shorturls')) {
    return `/api/shorturl${pathname.slice('/s'.length)}`;
  }

  if (hasPathPrefix(pathname, '/s/public')) {
    return `/api/shorturl${pathname.slice('/s'.length)}`;
  }

  return null;
}

export function canonicalizeBackendApiPath(pathname: string): string {
  if (!pathname || pathname.startsWith('/api/') || pathname === '/api') {
    return pathname;
  }

  const shortUrlApiPath = resolveLegacyShortUrlApiPath(pathname);
  if (shortUrlApiPath) {
    return shortUrlApiPath;
  }

  const exactReplacement = exactReplacements.get(pathname);
  if (exactReplacement) {
    return exactReplacement;
  }

  for (const replacement of prefixReplacements) {
    if (hasPathPrefix(pathname, replacement.from)) {
      return `${replacement.to}${pathname.slice(replacement.from.length)}`;
    }
  }

  return pathname;
}

export function canonicalizeBackendApiUrlObject(url: URL): URL {
  const nextUrl = new URL(url.toString());
  nextUrl.pathname = canonicalizeBackendApiPath(nextUrl.pathname);
  return nextUrl;
}

export function canonicalizeBackendApiUrl(rawUrl: string): string {
  if (!rawUrl || rawUrl.startsWith('//')) {
    return rawUrl;
  }

  const isAbsolute = /^[a-z][a-z\d+\-.]*:/i.test(rawUrl);
  try {
    const url = new URL(rawUrl, 'http://local.invalid');
    const canonicalPath = canonicalizeBackendApiPath(url.pathname);
    if (canonicalPath === url.pathname) {
      return rawUrl;
    }
    url.pathname = canonicalPath;

    if (isAbsolute) {
      return url.toString();
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawUrl;
  }
}
