import {
  applyCspNonceToHtml,
  createCspNonce,
  renderCspHeaderValue,
  resolveCspSurface,
  summarizeCspHeader,
} from "../security/contentSecurityPolicy";

describe("contentSecurityPolicy", () => {
  describe("resolveCspSurface", () => {
    it("classifies docs, api/default, and spa paths", () => {
      expect(resolveCspSurface("/api-docs")).toBe("docs");
      expect(resolveCspSurface("/api-docs/")).toBe("docs");
      expect(resolveCspSurface("/api-docs/index.html")).toBe("docs");
      expect(resolveCspSurface("/api/openapi.json")).toBe("default");
      expect(resolveCspSurface("/api/auth/login")).toBe("default");
      expect(resolveCspSurface("/health")).toBe("default");
      expect(resolveCspSurface("/cdn-cgi/challenge")).toBe("default");
      expect(resolveCspSurface("/")).toBe("spa");
      expect(resolveCspSurface("/login")).toBe("spa");
      expect(resolveCspSurface("/admin?tab=1")).toBe("spa");
    });
  });

  describe("createCspNonce / applyCspNonceToHtml", () => {
    it("creates opaque nonces", () => {
      const a = createCspNonce();
      const b = createCspNonce();
      expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(a.length).toBeGreaterThanOrEqual(16);
      expect(a).not.toBe(b);
    });

    it("injects nonce into script, style, and stylesheet link tags once", () => {
      const html = `<!doctype html><html><head>
<link rel="stylesheet" href="/assets/app.css">
<link rel="icon" href="/favicon.ico">
<style>body{margin:0}</style>
<script>window.x=1</script>
<script type="module" src="/assets/app.js"></script>
</head></html>`;
      const out = applyCspNonceToHtml(html, "testNonce123");
      expect(out).toContain('<link nonce="testNonce123" rel="stylesheet" href="/assets/app.css">');
      expect(out).toContain('<link rel="icon" href="/favicon.ico">');
      expect(out).toContain('<style nonce="testNonce123">body{margin:0}</style>');
      expect(out).toContain('<script nonce="testNonce123">window.x=1</script>');
      expect(out).toContain('<script nonce="testNonce123" type="module" src="/assets/app.js"></script>');
      // Idempotent: re-applying does not duplicate nonce attributes.
      const twice = applyCspNonceToHtml(out, "other");
      expect(twice).toContain('nonce="testNonce123"');
      expect(twice).not.toContain('nonce="other"');
    });

    it("strips quote characters from nonce before attribute injection", () => {
      const out = applyCspNonceToHtml("<script>1</script>", 'ab"cd');
      expect(out).toBe('<script nonce="abcd">1</script>');
    });
  });

  describe("renderCspHeaderValue / summarizeCspHeader", () => {
    it("removes unsafe-eval and script unsafe-inline for SPA", () => {
      const header = renderCspHeaderValue({ cspNonce: "spaNonce", cspSurface: "spa" }, { path: "/", nodeEnv: "production" });
      const summary = summarizeCspHeader(header);

      expect(summary.hasUnsafeEval).toBe(false);
      expect(summary.hasScriptUnsafeInline).toBe(false);
      expect(summary.hasScriptNonce).toBe(true);
      expect(summary.hasStyleElemUnsafeInline).toBe(false);
      expect(summary.hasStyleAttrUnsafeInline).toBe(true);
      expect(header).toContain("'nonce-spaNonce'");
      expect(header).toMatch(/script-src[^;]*'nonce-spaNonce'/);
      expect(header).toMatch(/style-src[^;]*'nonce-spaNonce'/);
      expect(header).toMatch(/style-src-attr\s+'unsafe-inline'/);
      expect(header).toMatch(/script-src-attr\s+'none'/);
      expect(header).not.toContain("'unsafe-eval'");
      expect(header).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    });

    it("keeps docs style unsafe-inline without style nonces so Swagger can inject CSS", () => {
      const header = renderCspHeaderValue({ cspNonce: "docsNonce", cspSurface: "docs" }, { path: "/api-docs", nodeEnv: "production" });
      const summary = summarizeCspHeader(header);

      expect(summary.hasUnsafeEval).toBe(false);
      expect(summary.hasScriptUnsafeInline).toBe(false);
      expect(summary.hasScriptNonce).toBe(true);
      expect(summary.hasStyleElemUnsafeInline).toBe(true);
      expect(header).toMatch(/script-src[^;]*'nonce-docsNonce'/);
      expect(header).toMatch(/style-src[^;]*'unsafe-inline'/);
      // Must not combine style nonce + unsafe-inline (browsers ignore unsafe-inline then).
      expect(header).not.toMatch(/style-src[^;]*'nonce-/);
      expect(header).not.toMatch(/style-src-elem[^;]*'nonce-/);
    });

    it("omits development connect hosts in production and includes them otherwise", () => {
      const prod = renderCspHeaderValue({ cspNonce: "n", cspSurface: "spa" }, { path: "/", nodeEnv: "production" });
      const dev = renderCspHeaderValue({ cspNonce: "n", cspSurface: "spa" }, { path: "/", nodeEnv: "development" });

      expect(prod).not.toContain("http://localhost:3000");
      expect(dev).toContain("http://localhost:3000");
      expect(dev).toContain("ws://localhost:3000");
    });

    it("retains third-party hosts required by SPA integrations", () => {
      const header = renderCspHeaderValue({ cspNonce: "n", cspSurface: "spa" }, { path: "/", nodeEnv: "production" });
      expect(header).toContain("https://challenges.cloudflare.com");
      expect(header).toContain("https://js.hcaptcha.com");
      expect(header).toContain("https://accounts.google.com");
      expect(header).toContain("https://www.googletagmanager.com");
      expect(header).toContain("https://fonts.googleapis.com");
      expect(header).toContain("frame-ancestors 'none'");
      expect(header).toContain("object-src 'none'");
    });
  });
});
