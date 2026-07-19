import crypto from "node:crypto";
import type { Request, Response } from "express";

export type CspSurface = "default" | "docs" | "spa";

declare global {
  namespace Express {
    interface Locals {
      cspNonce?: string;
      cspSurface?: CspSurface;
    }
  }
}

const THIRD_PARTY_SCRIPT_HOSTS = [
  "https://accounts.google.com",
  "https://www.gstatic.com",
  "https://*.chloemlla.com",
  "https://challenges.cloudflare.com",
  "https://*.cloudflare.com",
  "https://js.hcaptcha.com",
  "https://*.hcaptcha.com",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://analytics.google.com",
  "https://www.clarity.ms",
  "https://*.clarity.ms",
] as const;

const THIRD_PARTY_STYLE_HOSTS = [
  "https://fonts.googleapis.com",
  "https://accounts.google.com",
  "https://www.gstatic.com",
  "https://*.chloemlla.com",
  "https://challenges.cloudflare.com",
  "https://*.cloudflare.com",
  "https://js.hcaptcha.com",
  "https://*.hcaptcha.com",
] as const;

const PRODUCTION_CONNECT_HOSTS = [
  "'self'",
  "https://accounts.google.com",
  "https://www.googleapis.com",
  "https://oauth2.googleapis.com",
  "https://api.openai.com",
  "wss://*.chloemlla.com",
  "https://*.chloemlla.com",
  "https://api.hcaptcha.com",
  "https://*.hcaptcha.com",
  "https://challenges.cloudflare.com",
  "https://*.cloudflare.com",
  "https://www.google-analytics.com",
  "https://analytics.google.com",
  "https://www.google.com",
  "https://www.clarity.ms",
  "https://*.clarity.ms",
] as const;

const DEVELOPMENT_CONNECT_HOSTS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:6000",
  "http://localhost:6001",
  "ws://localhost:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:6000",
  "http://127.0.0.1:6001",
  "ws://127.0.0.1:3000",
  "http://192.168.10.7:3001",
  "http://192.168.10.7:3000",
  "http://192.168.10.7:6000",
  "http://192.168.10.7:6001",
  "ws://192.168.10.7:3000",
] as const;

const FRAME_HOSTS = [
  "'self'",
  "https://accounts.google.com",
  "https://*.chloemlla.com",
  "https://challenges.cloudflare.com",
  "https://*.cloudflare.com",
  "https://js.hcaptcha.com",
  "https://*.hcaptcha.com",
] as const;

function isNonProductionRuntime(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function createCspNonce(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export function ensureCspNonce(res: Response): string {
  if (!res.locals.cspNonce) {
    res.locals.cspNonce = createCspNonce();
  }
  return res.locals.cspNonce;
}

export function resolveCspSurface(pathname: string): CspSurface {
  const normalized = pathname.split("?")[0] || "/";
  if (normalized === "/api-docs" || normalized.startsWith("/api-docs/")) {
    return "docs";
  }

  // API JSON and non-document endpoints still get a tight default policy header.
  if (
    normalized === "/api" ||
    normalized.startsWith("/api/") ||
    normalized === "/health" ||
    normalized.startsWith("/health/") ||
    normalized.startsWith("/cdn-cgi/")
  ) {
    return "default";
  }

  return "spa";
}

function nonceSource(_req: Request, res: Response): string {
  return `'nonce-${ensureCspNonce(res)}'`;
}

/**
 * Style elements:
 * - SPA/default: per-request nonce (no element-level unsafe-inline)
 * - docs (/api-docs): unsafe-inline only — Swagger UI injects styles without nonces,
 *   and CSP ignores 'unsafe-inline' when a nonce is also present in the same directive
 */
function styleElementSource(_req: Request, res: Response): string {
  const surface = res.locals.cspSurface || resolveCspSurface(_req.path || "/");
  if (surface === "docs") {
    return "'unsafe-inline'";
  }
  return `'nonce-${ensureCspNonce(res)}'`;
}

function buildConnectSrc(): string[] {
  if (isNonProductionRuntime()) {
    return [...PRODUCTION_CONNECT_HOSTS, ...DEVELOPMENT_CONNECT_HOSTS];
  }
  return [...PRODUCTION_CONNECT_HOSTS];
}

/**
 * Production-compatible CSP:
 * - script-src: nonce only (no unsafe-inline / unsafe-eval)
 * - style-src / style-src-elem: nonce for SPA; unsafe-inline for Swagger docs only
 * - style-src-attr: unsafe-inline kept for React style props + Swagger SVG attrs
 * - script-src-attr: none (blocks inline event handlers)
 */
type HelmetCspDirectiveValue =
  | string
  | ((req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => string);

/**
 * Helmet CSP directives. Callback form uses IncomingMessage/ServerResponse so the
 * return type is assignable to helmet's ContentSecurityPolicyDirectives.
 */
export function buildHelmetCspDirectives(): Record<string, Iterable<HelmetCspDirectiveValue>> {
  const asHttpNonceSource = (
    _req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): string => {
    const expressRes = res as unknown as Response;
    return `'nonce-${ensureCspNonce(expressRes)}'`;
  };

  const asHttpStyleElementSource = (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): string => {
    const expressRes = res as unknown as Response;
    const expressReq = req as unknown as Request;
    const surface = expressRes.locals?.cspSurface || resolveCspSurface(expressReq.path || "/");
    if (surface === "docs") {
      return "'unsafe-inline'";
    }
    return `'nonce-${ensureCspNonce(expressRes)}'`;
  };

  return {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    objectSrc: ["'none'"],
    imgSrc: ["'self'", "data:", "blob:", "https:"],
    // Frontend bundles may inline woff2 as data URLs.
    fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
    scriptSrc: ["'self'", asHttpNonceSource, ...THIRD_PARTY_SCRIPT_HOSTS],
    scriptSrcElem: ["'self'", asHttpNonceSource, ...THIRD_PARTY_SCRIPT_HOSTS],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'", asHttpStyleElementSource, ...THIRD_PARTY_STYLE_HOSTS],
    styleSrcElem: ["'self'", asHttpStyleElementSource, ...THIRD_PARTY_STYLE_HOSTS],
    // Required for React runtime style props and Swagger UI SVG style attributes.
    styleSrcAttr: ["'unsafe-inline'"],
    connectSrc: buildConnectSrc(),
    frameSrc: [...FRAME_HOSTS],
    childSrc: [...FRAME_HOSTS],
    workerSrc: ["'self'", "blob:"],
    mediaSrc: ["'self'", "blob:", "data:"],
    upgradeInsecureRequests: [],
  };
}

/**
 * Materialize helmet-style directive functions into a CSP header string for tests/audits.
 * Optional surface forces docs vs spa style source selection.
 */
export function renderCspHeaderValue(
  resLocals: { cspNonce?: string; cspSurface?: CspSurface } = {},
  options: { path?: string; nodeEnv?: string } = {},
): string {
  const previousNodeEnv = process.env.NODE_ENV;
  if (options.nodeEnv !== undefined) {
    process.env.NODE_ENV = options.nodeEnv;
  }

  try {
    const req = { path: options.path || "/" } as Request;
    const res = { locals: { ...resLocals } } as Response;
    if (!res.locals.cspSurface) {
      res.locals.cspSurface = resolveCspSurface(req.path);
    }
    if (!res.locals.cspNonce) {
      ensureCspNonce(res);
    }

    const directives = buildHelmetCspDirectives();
    const parts: string[] = [];

    for (const [camelKey, values] of Object.entries(directives)) {
      const headerName = camelKey.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      if (!Array.isArray(values) || values.length === 0) {
        // Empty array directives (e.g. upgradeInsecureRequests) are flag-only.
        parts.push(headerName);
        continue;
      }

      const resolved = values.map((value) => (typeof value === "function" ? value(req, res) : value));
      parts.push(`${headerName} ${resolved.join(" ")}`);
    }

    return parts.join("; ");
  } finally {
    if (options.nodeEnv !== undefined) {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  }
}

export function applyCspNonceToHtml(html: string, nonce: string): string {
  if (!html || !nonce) {
    return html;
  }

  const safeNonce = nonce.replace(/"/g, "");
  return html
    .replace(/<script\b(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${safeNonce}"$1>`)
    .replace(/<style\b(?![^>]*\bnonce=)([^>]*)>/gi, `<style nonce="${safeNonce}"$1>`)
    .replace(/<link\b([^>]*\brel=["']stylesheet["'][^>]*)>/gi, (match, attrs: string) => {
      if (/\bnonce=/.test(attrs)) {
        return match;
      }
      return `<link nonce="${safeNonce}"${attrs}>`;
    });
}

export function summarizeCspHeader(headerValue: string | string[] | undefined): {
  hasUnsafeEval: boolean;
  hasScriptUnsafeInline: boolean;
  hasStyleElemUnsafeInline: boolean;
  hasStyleAttrUnsafeInline: boolean;
  hasNonce: boolean;
  hasScriptNonce: boolean;
} {
  const raw = Array.isArray(headerValue) ? headerValue.join(",") : headerValue || "";
  const lower = raw.toLowerCase();

  const scriptSrcMatch = lower.match(/(?:^|;)\s*script-src\s+([^;]*)/);
  const scriptSrc = scriptSrcMatch?.[1] || "";
  const styleSrcMatch = lower.match(/(?:^|;)\s*style-src(?:-elem)?\s+([^;]*)/);
  const styleSrc = styleSrcMatch?.[1] || "";
  const styleAttrMatch = lower.match(/(?:^|;)\s*style-src-attr\s+([^;]*)/);
  const styleAttr = styleAttrMatch?.[1] || "";

  return {
    hasUnsafeEval: /'unsafe-eval'/.test(lower),
    hasScriptUnsafeInline: /'unsafe-inline'/.test(scriptSrc),
    hasStyleElemUnsafeInline: /'unsafe-inline'/.test(styleSrc),
    hasStyleAttrUnsafeInline: /'unsafe-inline'/.test(styleAttr),
    hasNonce: /'nonce-/.test(lower),
    hasScriptNonce: /'nonce-/.test(scriptSrc),
  };
}
