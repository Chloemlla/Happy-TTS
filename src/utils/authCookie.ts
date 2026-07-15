import type { CookieOptions, Request, Response } from "express";
import { config } from "../config/config";

export const AUTH_COOKIE_NAME = "synapse_token";

function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d|w|y)$/i.exec(duration.trim());
  if (!match) {
    return 30 * 24 * 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_536_000_000,
  };
  return amount * (mult[unit] || mult.d);
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const forwarded = req.headers["x-forwarded-proto"];
  if (!forwarded) return process.env.NODE_ENV === "production";
  return String(forwarded).split(",")[0].trim() === "https";
}

export function getAuthCookieOptions(req: Request): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: parseDurationToMs(config.jwtExpiresIn || "30d"),
  };
}

export function setAuthSessionCookie(req: Request, res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions(req));
}

export function clearAuthSessionCookie(req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(req),
    path: "/",
  });
}

/** Lightweight Cookie header parser (no cookie-parser dependency). */
export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer) return bearer;
  }

  const cookies = parseCookieHeader(
    typeof req.headers.cookie === "string" ? req.headers.cookie : undefined,
  );
  // Prefer parsed cookies if a cookie middleware populated req.cookies.
  const fromReqCookies = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE_NAME];
  const token = (fromReqCookies || cookies[AUTH_COOKIE_NAME] || "").trim();
  return token || null;
}
