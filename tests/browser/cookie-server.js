/**
 * Minimal cookie-identity surface for Playwright smoke tests.
 * Mirrors src/utils/authCookie.ts semantics without loading the full backend graph.
 */
const express = require("express");

const AUTH_COOKIE_NAME = "synapse_token";
const app = express();
const token = "browser-cookie-contract-token";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function parseCookieHeader(cookieHeader) {
  if (!cookieHeader) return {};
  const out = {};
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

app.post("/session", (req, res) => {
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
  res.status(204).end();
});

app.get("/session", (req, res) => {
  const cookies = parseCookieHeader(req.headers.cookie);
  const authenticated = cookies[AUTH_COOKIE_NAME] === token;
  res.type("json").send(JSON.stringify({ authenticated }));
});

app.delete("/session", (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
  res.status(204).end();
});

app.listen(4178, "127.0.0.1", () => {
  console.log("Cookie contract server listening on http://127.0.0.1:4178");
});
