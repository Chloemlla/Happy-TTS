import { createHmac, timingSafeEqual } from "node:crypto";
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

// SPA routes under /auth/* that must never be rewritten to /api/auth/*.
// OAuth providers complete into the SPA, which then exchanges tickets via API.
// Match exact paths and trailing-slash variants so Express/proxy normalization
// differences cannot reintroduce the 308/302 callback loop.
const frontendOnlyAuthPathPrefixes = [
  "/auth/linuxdo/callback",
  "/auth/provider/bind",
] as const;

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
const legacyApiChoicePagePath = "/legacy-api-choice";
const legacyApiChoiceQueryParam = "__legacy_api_choice";
const legacyApiRememberQueryParam = "__legacy_api_remember";
const legacyApiChoiceStateQueryParam = "__legacy_api_state";
const persistentChoiceMaxAgeSeconds = 60 * 60 * 24 * 180;
const transientFrontendBypassMaxAgeSeconds = 30;
const choiceStateTtlMs = 10 * 60 * 1000;

type LegacyApiNavigationChoice = "api" | "frontend";

type LegacyApiChoiceStatePayload = {
  from: string;
  api: string;
  exp: number;
};

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  const collapsed = pathname.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed || "/";
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
  const normalizedPathname = normalizePathname(pathname);

  if (normalizedPathname.startsWith("/api/") || normalizedPathname === "/api") {
    return null;
  }

  // Keep browser OAuth completion pages on the SPA path. Rewriting them to
  // /api/auth/* creates a 308/302 loop with LinuxDoAuthController bounce logic.
  if (frontendOnlyAuthPathPrefixes.some((prefix) => hasPathPrefix(normalizedPathname, prefix))) {
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
  url.searchParams.delete(legacyApiChoiceStateQueryParam);
  return `${url.pathname}${url.search}`;
}

function getCanonicalLocation(req: Request, canonicalPath: string): string {
  const url = new URL(req.originalUrl, "http://local.invalid");
  url.pathname = canonicalPath;
  url.searchParams.delete(legacyApiChoiceQueryParam);
  url.searchParams.delete(legacyApiRememberQueryParam);
  url.searchParams.delete(legacyApiChoiceStateQueryParam);
  return `${url.pathname}${url.search}`;
}

function isFrontendRouteWithLegacyApiCollision(pathname: string): boolean {
  return frontendRoutesWithLegacyApiCollision.has(pathname);
}

function getChoiceStateSecret(): string {
  return process.env.LEGACY_API_CHOICE_SECRET || process.env.JWT_SECRET || "development-legacy-api-choice-secret";
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signChoiceStatePayload(encodedPayload: string): string {
  return createHmac("sha256", getChoiceStateSecret()).update(encodedPayload).digest("base64url");
}

function createLegacyApiChoiceState(from: string, api: string): string {
  const payload: LegacyApiChoiceStatePayload = {
    from,
    api,
    exp: Date.now() + choiceStateTtlMs,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${signChoiceStatePayload(encodedPayload)}`;
}

function verifyLegacyApiChoiceState(req: Request, canonicalPath: string): boolean {
  const state = getFirstQueryValue(req.query[legacyApiChoiceStateQueryParam]);
  const [encodedPayload, signature, extra] = state.split(".");
  if (!encodedPayload || !signature || extra) {
    return false;
  }

  const expectedSignature = signChoiceStatePayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return false;
  }

  let payload: LegacyApiChoiceStatePayload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload)) as LegacyApiChoiceStatePayload;
  } catch {
    return false;
  }

  return (
    typeof payload.from === "string" &&
    typeof payload.api === "string" &&
    typeof payload.exp === "number" &&
    payload.exp >= Date.now() &&
    payload.from === getCleanOriginalUrl(req) &&
    payload.api === getCanonicalLocation(req, canonicalPath)
  );
}

function getLegacyApiChoicePageLocation(req: Request, canonicalPath: string): string {
  const from = getCleanOriginalUrl(req);
  const api = getCanonicalLocation(req, canonicalPath);
  const params = new URLSearchParams({
    from,
    api,
    state: createLegacyApiChoiceState(from, api),
  });

  return `${legacyApiChoicePagePath}?${params.toString()}`;
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
    const hasValidChoiceState = requestedChoice ? verifyLegacyApiChoiceState(req, canonicalPath) : false;
    const rememberedChoice = getRememberedLegacyApiNavigationChoice(req);
    const choice = hasValidChoiceState ? requestedChoice : rememberedChoice;
    const rememberChoice = getFirstQueryValue(req.query[legacyApiRememberQueryParam]) === "1";

    if (choice === "frontend") {
      if (requestedChoice === "frontend" && hasValidChoiceState) {
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
      if ((requestedChoice === "api" && hasValidChoiceState && rememberChoice) || rememberedChoice === "api") {
        setLegacyApiNavigationChoiceCookie(res, "api");
      }
      const location = getCanonicalLocation(req, canonicalPath);
      res.setHeader("Deprecation", "true");
      res.setHeader("X-Canonical-API-Path", canonicalPath);
      res.setHeader("Link", `<${canonicalPath}>; rel="successor-version"`);
      return res.redirect(308, location);
    }

    res.setHeader("X-Canonical-API-Path", canonicalPath);
    return res.redirect(302, getLegacyApiChoicePageLocation(req, canonicalPath));
  }

  const location = getCanonicalLocation(req, canonicalPath);

  res.setHeader("Deprecation", "true");
  res.setHeader("X-Canonical-API-Path", canonicalPath);
  res.setHeader("Link", `<${canonicalPath}>; rel="successor-version"`);
  return res.redirect(308, location);
};
