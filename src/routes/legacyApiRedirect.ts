import type { Request, RequestHandler, Response } from "express";

const exactReplacements = new Map<string, string>([
  ["/api-docs.json", "/api/openapi.json"],
  ["/openapi.json", "/api/openapi.json"],
  ["/server_status", "/api/server_status"],
  ["/status", "/api/status"],
  ["/ip", "/api/ip"],
  ["/report-ip", "/api/report-ip"],
  ["/ip-location", "/api/ip-location"],
  ["/proxy-test", "/api/proxy-test"],
  ["/timing-test", "/api/timing-test"],
  ["/report-docs-timeout", "/api/report-docs-timeout"],
  ["/lc", "/api/lc"],
  ["/librechat-image", "/api/librechat-image"],
]);

const prefixReplacements: Array<{ from: string; to: string }> = [
  { from: "/auth", to: "/api/auth" },
  { from: "/tts", to: "/api/tts" },
  { from: "/totp", to: "/api/totp" },
  { from: "/passkey", to: "/api/passkey" },
  { from: "/admin", to: "/api/admin" },
  { from: "/command", to: "/api/command" },
  { from: "/data-collection", to: "/api/data-collection" },
  { from: "/data", to: "/api/data" },
  { from: "/deeplx", to: "/api/deeplx" },
  { from: "/media", to: "/api/media" },
  { from: "/social", to: "/api/social" },
  { from: "/life", to: "/api/life" },
  { from: "/network", to: "/api/network" },
  { from: "/ipfs", to: "/api/ipfs" },
  { from: "/librechat", to: "/api/librechat" },
  { from: "/libre-chat", to: "/api/libre-chat" },
  { from: "/turnstile", to: "/api/turnstile" },
  { from: "/human-check", to: "/api/human-check" },
  { from: "/shorturl", to: "/api/shorturl" },
  { from: "/cdks", to: "/api/cdks" },
  { from: "/lottery", to: "/api/lottery" },
  { from: "/resources", to: "/api/resources" },
  { from: "/categories", to: "/api/categories" },
  { from: "/sharelog", to: "/api/sharelog" },
  { from: "/logs", to: "/api/logs" },
  { from: "/tickets", to: "/api/tickets" },
  { from: "/webhook-events", to: "/api/webhook-events" },
  { from: "/webhooks", to: "/api/webhooks" },
  { from: "/github-billing", to: "/api/github-billing" },
  { from: "/apikeys", to: "/api/apikeys" },
  { from: "/email", to: "/api/email" },
  { from: "/outemail", to: "/api/outemail" },
  { from: "/frontend-config", to: "/api/frontend-config" },
  { from: "/policy", to: "/api/policy" },
  { from: "/tamper", to: "/api/tamper" },
  { from: "/miniapi", to: "/api/miniapi" },
  { from: "/anta", to: "/api/anta" },
  { from: "/modlist", to: "/api/modlist" },
  { from: "/image-data", to: "/api/image-data" },
  { from: "/fbi-wanted", to: "/api/fbi-wanted" },
];

const frontendRoutesWithLegacyApiCollision = new Set<string>([
  "/admin",
  "/admin/lottery",
  "/admin/rust-benchmark",
  "/admin/store",
  "/admin/store/cdks",
  "/admin/store/resources",
  "/admin/users",
  "/fbi-wanted",
  "/github-billing",
  "/librechat",
  "/modlist",
  "/outemail",
  "/policy",
]);

const legacyApiChoiceCookieName = "legacyApiNavigationChoice";
const legacyApiFrontendBypassCookieName = "legacyApiFrontendBypass";
const legacyApiChoiceQueryParam = "__legacy_api_choice";
const legacyApiRememberQueryParam = "__legacy_api_remember";
const persistentChoiceMaxAgeSeconds = 60 * 60 * 24 * 180;
const transientFrontendBypassMaxAgeSeconds = 30;

type LegacyApiNavigationChoice = "api" | "frontend";

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function resolveLegacyShortUrlApiPath(pathname: string): string | null {
  if (hasPathPrefix(pathname, "/s/admin")) {
    return `/api/shorturl${pathname.slice("/s".length)}`;
  }

  if (hasPathPrefix(pathname, "/s/shorturls")) {
    return `/api/shorturl${pathname.slice("/s".length)}`;
  }

  if (hasPathPrefix(pathname, "/s/public")) {
    return `/api/shorturl${pathname.slice("/s".length)}`;
  }

  return null;
}

export function resolveLegacyApiPath(
  pathname: string,
  opts: { skipPrefixReplacements?: boolean } = {},
): string | null {
  if (pathname.startsWith("/api/") || pathname === "/api") {
    return null;
  }

  const shortUrlApiPath = resolveLegacyShortUrlApiPath(pathname);
  if (shortUrlApiPath) {
    return shortUrlApiPath;
  }

  const exactReplacement = exactReplacements.get(pathname);
  if (exactReplacement) {
    return exactReplacement;
  }

  if (opts.skipPrefixReplacements) {
    return null;
  }

  for (const replacement of prefixReplacements) {
    if (hasPathPrefix(pathname, replacement.from)) {
      return `${replacement.to}${pathname.slice(replacement.from.length)}`;
    }
  }

  return null;
}

function getHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(",") : value || "";
}

function isBrowserDocumentNavigation(req: Request): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const accept = getHeaderValue(req.headers.accept).toLowerCase();
  const fetchMode = getHeaderValue(req.headers["sec-fetch-mode"]).toLowerCase();
  const fetchDest = getHeaderValue(req.headers["sec-fetch-dest"]).toLowerCase();

  return accept.includes("text/html") || fetchMode === "navigate" || fetchDest === "document";
}

function getFirstQueryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
}

function parseLegacyApiNavigationChoice(value: unknown): LegacyApiNavigationChoice | null {
  const candidate = getFirstQueryValue(value);
  return candidate === "api" || candidate === "frontend" ? candidate : null;
}

function parseCookieHeader(cookieHeader: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!name) {
      continue;
    }

    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }

  return cookies;
}

function getRememberedLegacyApiNavigationChoice(req: Request): LegacyApiNavigationChoice | null {
  return parseLegacyApiNavigationChoice(parseCookieHeader(req.headers.cookie).get(legacyApiChoiceCookieName));
}

function hasTransientFrontendBypass(req: Request): boolean {
  return parseCookieHeader(req.headers.cookie).get(legacyApiFrontendBypassCookieName) === "1";
}

function appendCookie(res: Response, name: string, value: string, maxAgeSeconds: number): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  res.append("Set-Cookie", parts.join("; "));
}

function setLegacyApiNavigationChoiceCookie(res: Response, choice: LegacyApiNavigationChoice): void {
  appendCookie(res, legacyApiChoiceCookieName, choice, persistentChoiceMaxAgeSeconds);
}

function setTransientFrontendBypassCookie(res: Response): void {
  appendCookie(res, legacyApiFrontendBypassCookieName, "1", transientFrontendBypassMaxAgeSeconds);
}

function clearTransientFrontendBypassCookie(res: Response): void {
  appendCookie(res, legacyApiFrontendBypassCookieName, "", 0);
}

function getCleanOriginalUrl(req: Request): string {
  const url = new URL(req.originalUrl, "http://local.invalid");
  url.searchParams.delete(legacyApiChoiceQueryParam);
  url.searchParams.delete(legacyApiRememberQueryParam);
  return `${url.pathname}${url.search}`;
}

function getCanonicalLocation(req: Request, canonicalPath: string): string {
  const url = new URL(req.originalUrl, "http://local.invalid");
  url.pathname = canonicalPath;
  url.searchParams.delete(legacyApiChoiceQueryParam);
  url.searchParams.delete(legacyApiRememberQueryParam);
  return `${url.pathname}${url.search}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHiddenQueryInputs(req: Request): string {
  const url = new URL(req.originalUrl, "http://local.invalid");
  url.searchParams.delete(legacyApiChoiceQueryParam);
  url.searchParams.delete(legacyApiRememberQueryParam);

  return Array.from(url.searchParams.entries())
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");
}

function isFrontendRouteWithLegacyApiCollision(pathname: string): boolean {
  return frontendRoutesWithLegacyApiCollision.has(pathname);
}

function sendLegacyApiChoicePage(req: Request, res: Response, canonicalPath: string): void {
  const frontendPath = getCleanOriginalUrl(req);
  const canonicalLocation = getCanonicalLocation(req, canonicalPath);

  res.status(300);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Canonical-API-Path", canonicalPath);
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Choose destination</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background: #f6f7f9;
      color: #17202a;
    }
    main {
      width: min(560px, calc(100vw - 32px));
      padding: 28px;
      border: 1px solid #d7dde5;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 18px 50px rgba(23, 32, 42, 0.12);
    }
    h1 {
      margin: 0 0 12px;
      font-size: 24px;
      line-height: 1.25;
    }
    p {
      margin: 0 0 18px;
      line-height: 1.55;
      color: #4a5565;
    }
    code {
      display: block;
      padding: 10px 12px;
      margin: 8px 0;
      overflow-wrap: anywhere;
      border-radius: 6px;
      background: #eef2f7;
      color: #17202a;
      font-size: 13px;
    }
    .remember {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 20px 0;
      color: #344054;
      font-size: 14px;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    button {
      min-height: 44px;
      border: 1px solid #b8c2cc;
      border-radius: 6px;
      background: #fff;
      color: #17202a;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    button[value="api"] {
      border-color: #0f766e;
      background: #0f766e;
      color: #fff;
    }
    @media (max-width: 520px) {
      main {
        padding: 22px;
      }
      .actions {
        grid-template-columns: 1fr;
      }
    }
    @media (prefers-color-scheme: dark) {
      body {
        background: #111827;
        color: #f8fafc;
      }
      main {
        border-color: #334155;
        background: #182235;
        box-shadow: none;
      }
      p,
      .remember {
        color: #cbd5e1;
      }
      code {
        background: #0f172a;
        color: #e2e8f0;
      }
      button {
        border-color: #64748b;
        background: #1e293b;
        color: #f8fafc;
      }
      button[value="api"] {
        border-color: #14b8a6;
        background: #0f766e;
      }
    }
  </style>
</head>
<body>
  <main>
    <h1>This address has two destinations</h1>
    <p>The path can open a frontend page or the legacy API endpoint. Choose where to go.</p>
    <p>Frontend page:<code>${escapeHtml(frontendPath)}</code></p>
    <p>API endpoint:<code>${escapeHtml(canonicalLocation)}</code></p>
    <form method="get" action="${escapeHtml(req.path)}">
      ${renderHiddenQueryInputs(req)}
      <label class="remember">
        <input type="checkbox" name="${legacyApiRememberQueryParam}" value="1">
        Remember this choice for similar addresses
      </label>
      <div class="actions">
        <button type="submit" name="${legacyApiChoiceQueryParam}" value="frontend">Open frontend page</button>
        <button type="submit" name="${legacyApiChoiceQueryParam}" value="api">Open API endpoint</button>
      </div>
    </form>
  </main>
</body>
</html>`);
}

export const legacyApiRedirectMiddleware: RequestHandler = (req, res, next) => {
  const canonicalPath = resolveLegacyApiPath(req.path);
  if (!canonicalPath) {
    return next();
  }

  if (isBrowserDocumentNavigation(req) && isFrontendRouteWithLegacyApiCollision(req.path)) {
    if (hasTransientFrontendBypass(req)) {
      clearTransientFrontendBypassCookie(res);
      return next();
    }

    const requestedChoice = parseLegacyApiNavigationChoice(req.query[legacyApiChoiceQueryParam]);
    const rememberedChoice = getRememberedLegacyApiNavigationChoice(req);
    const choice = requestedChoice || rememberedChoice;
    const rememberChoice = getFirstQueryValue(req.query[legacyApiRememberQueryParam]) === "1";

    if (choice === "frontend") {
      if (requestedChoice === "frontend") {
        if (rememberChoice) {
          setLegacyApiNavigationChoiceCookie(res, "frontend");
        } else {
          setTransientFrontendBypassCookie(res);
        }
        return res.redirect(302, getCleanOriginalUrl(req));
      }

      return next();
    }

    if (choice === "api") {
      if (rememberChoice || rememberedChoice === "api") {
        setLegacyApiNavigationChoiceCookie(res, "api");
      }
      const location = getCanonicalLocation(req, canonicalPath);
      res.setHeader("Deprecation", "true");
      res.setHeader("X-Canonical-API-Path", canonicalPath);
      res.setHeader("Link", `<${canonicalPath}>; rel="successor-version"`);
      return res.redirect(308, location);
    }

    return sendLegacyApiChoicePage(req, res, canonicalPath);
  }

  const location = getCanonicalLocation(req, canonicalPath);

  res.setHeader("Deprecation", "true");
  res.setHeader("X-Canonical-API-Path", canonicalPath);
  res.setHeader("Link", `<${canonicalPath}>; rel="successor-version"`);
  return res.redirect(308, location);
};
