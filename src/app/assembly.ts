import fs from "node:fs";
import path, { join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { config, startupConfig } from "../config/config";
import {
  corsHeadersMiddleware,
  corsPreflightHandler,
  globalCors,
  openCorsHeadersMiddleware,
  openCorsPreflightHandler,
} from "../middleware/corsMiddleware";
import { passkeyErrorHandler } from "../middleware/passkeyAutoFix";
import { requestProfilingMiddleware } from "../middleware/requestProfiling";
import { requestIdMiddleware } from "../middleware/requestId";
import {
  audioFileLimiter,
  frontendLimiter,
  globalDefaultLimiter,
  notFoundLimiter,
  rootLimiter,
  staticFileLimiter,
} from "../middleware/routeLimiters";
import {
  assertRouteGovernance,
  earlyRouteModules,
  isExemptNonApiRoutePath,
  NON_API_ROUTE_EXEMPTION_PATHS,
  postTamperRouteModules,
  preDocsRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  registerRouteModules,
  routeLimiterModules,
} from "../routes";
import { legacyApiRedirectMiddleware } from "../routes/legacyApiRedirect";
import {
  applyCspNonceToHtml,
  buildHelmetCspDirectives,
  ensureCspNonce,
  resolveCspSurface,
} from "../security/contentSecurityPolicy";
import { registerSecurityPipeline } from "../security/securityPipeline";
import logger from "../utils/logger";
import { sanitizeLogValue } from "../utils/requestLogSanitizer";
import cloudflareChallengeRoutes from "../routes/cloudflareChallengeRoutes";

declare global {
  namespace Express {
    interface Request {
      isLocalIp?: boolean;
    }
  }
}

const audioDir = path.join(__dirname, "../finish");
const assemblyNonApiRouteExemptionSet = new Set<string>(NON_API_ROUTE_EXEMPTION_PATHS);

function assertAssemblyNonApiRoutePath(routePath: string): void {
  if (!isExemptNonApiRoutePath(routePath)) {
    throw new Error(
      `[assembly] Non-API route "${routePath}" is not in the explicit exemption list: ${Array.from(assemblyNonApiRouteExemptionSet).join(", ")}`,
    );
  }
}

const authCacheBypassPaths = [
  "/api/totp/status",
  "/api/passkey/credentials",
  "/api/passkey/authenticate/start",
  "/api/passkey/authenticate/finish",
  "/api/passkey/register/start",
  "/api/passkey/register/finish",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/login",
  "/api/auth/register",
  "/api/oauth/authorize",
  "/api/oauth/token",
  "/api/oauth/userinfo",
  "/api/oauth/introspect",
  "/api/oauth/revoke",
];

const isLocalIp = (req: Request, _res: Response, next: NextFunction) => {
  // Use req.socket.remoteAddress (TCP-level connection IP) instead of req.ip
  // which can be spoofed via X-Forwarded-For when trust proxy is enabled.
  const ip = req.socket.remoteAddress || req.ip || "unknown";
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev") {
    // G1-33: 开发环境刻意恒 false。唯一消费者是 routeLimiters 的 isLocalRequest，
    // 它把本地请求豁免限流；开发时保持 false 才能让本地跑出真实的限流行为。
    req.isLocalIp = false;
  } else {
    req.isLocalIp = config.localIps.includes(ip);
  }
  next();
};

// G1-26: 开发环境曾把完整 headers/body 倒进日志。即使敏感键已脱敏，剩下的
// 字段（邮箱、昵称、地址、UA 全文）仍是 PII，且日志会落盘留存。
const REQUEST_LOG_HEADER_ALLOWLIST = ["content-type", "content-length", "user-agent", "accept-language"] as const;

const pickAllowlistedHeaders = (headers: Request["headers"]): Record<string, string> => {
  const picked: Record<string, string> = {};
  for (const name of REQUEST_LOG_HEADER_ALLOWLIST) {
    const value = headers[name];
    if (typeof value === "string") {
      picked[name] = value;
    }
  }
  return picked;
};

const requestLogger = (req: Request, _res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === "development" || process.env.VERBOSE_LOGGING === "true") {
    // 需要整份请求体排查问题时显式开 VERBOSE_REQUEST_DUMP=true，默认不落 PII。
    const meta: Record<string, unknown> =
      process.env.VERBOSE_REQUEST_DUMP === "true"
        ? { ip: req.ip, headers: sanitizeLogValue(req.headers), body: sanitizeLogValue(req.body) }
        : { ip: req.ip, headers: pickAllowlistedHeaders(req.headers) };
    logger.info(`收到请求: ${req.method} ${req.url}`, meta);
  } else if (process.env.ACCESS_LOG_ENABLED === "true") {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
  }
  next();
};

const frontendCandidates = [
  process.env.FRONTEND_DIST_DIR && path.resolve(process.env.FRONTEND_DIST_DIR),
  join(__dirname, "../frontend/dist"),
  join(__dirname, "../../frontend/dist"),
  path.resolve(process.cwd(), "frontend/dist"),
].filter(Boolean) as string[];

const ensureAudioDir = () => {
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }
};

const applyNoCacheHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.removeHeader?.("ETag");
  next();
};

// 不可变缓存策略：Vite 使用 [name].[hash].[ext] 命名，
// hashed 资源用 1 年 immutable；HTML 永远 no-cache 以便部署后立即拿到新 shell。
const HASHED_FILE_RE = /\.[A-Za-z0-9_-]{6,}\.(?:js|mjs|cjs|css|woff2?|ttf|otf|eot|svg|png|jpe?g|gif|webp|avif|ico|map)$/i;

const applyStaticCacheHeaders = (res: Response, filePath: string): void => {
  if (/\.html?$/i.test(filePath)) {
    res.set("Cache-Control", "no-cache, must-revalidate");
    return;
  }
  if (HASHED_FILE_RE.test(filePath) || /[\\/]assets[\\/]/.test(filePath)) {
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  res.set("Cache-Control", "public, max-age=3600");
};

const getFrontendFallbackHtml = (expected: string, nonce?: string) => {
  const html = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Synapse API</title>
    <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.6}.card{max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 4px 14px rgba(0,0,0,.08)}h1{margin:0 0 12px;font-size:24px}a{color:#3b82f6;text-decoration:none}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}</style>
  </head>
  <body><div class="card"><h1>Synapse 后端已启动</h1><p>未检测到前端构建文件。您仍可通过 Swagger 访问 API 文档：</p>
    <ul><li><a href="/api-docs">Swagger UI</a></li><li><a href="/api/openapi.json">Swagger JSON</a></li></ul>
    <p>如果需要启用前端，请设置环境变量 <code>FRONTEND_DIST_DIR</code> 或将构建产物放到以下任一路径：<br/><small>${expected}</small></p>
  </div></body>
</html>`;
  return nonce ? applyCspNonceToHtml(html, nonce) : html;
};

function parseTrustProxySetting(): boolean | number | string | string[] {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) {
    // 默认不信任任何代理：trust proxy 未显式配置时，req.ip === socket.remoteAddress，
    // 客户端无法通过伪造 X-Forwarded-For 控制 req.ip（影响 IP 封禁、限流、用量统计）。
    // 若部署在反向代理之后，请显式设置 TRUST_PROXY（如 TRUST_PROXY=true 或代理跳数）。
    if (process.env.NODE_ENV === "production") {
      // 在 assembly 顶层避免重复输出
      const key = "TRUST_PROXY_UNSET_WARNED";
      if (!(globalThis as any)[key]) {
        (globalThis as any)[key] = true;
        console.warn(
          "[assembly] WARNING: TRUST_PROXY is not set, defaulting to no trust. " +
            "If this server runs behind a reverse proxy, set TRUST_PROXY explicitly so req.ip reflects the real client.",
        );
      }
    }
    return false;
  }

  const normalized = raw.toLowerCase();
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["true", "yes", "on"].includes(normalized)) {
    return true;
  }

  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) {
    return numeric;
  }

  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return raw;
}

function resolveStaticDirectory(candidates: string[], requiredFiles: string[]): string | undefined {
  return candidates.find((candidate) => {
    try {
      const stats = fs.statSync(candidate);
      if (!stats.isDirectory()) {
        return false;
      }

      return requiredFiles.every((requiredFile) => fs.statSync(join(candidate, requiredFile)).isFile());
    } catch (_error) {
      return false;
    }
  });
}

export function registerCoreMiddleware(app: Express): void {
  app.set("trust proxy", parseTrustProxySetting());

  // G1-07: 安全响应头（CSP nonce + helmet + 去 Server/X-Powered-By）提到最前，
  // 使 pre-parser 路由（/health、/api/health、/status、/api/webhooks/*、
  // /api/data-collection/*）以及 IP 封禁 403 / 限流 429 响应都带上安全头。
  // globalCors 仍保持后置（registerSecurityMiddleware），避免在 open-CORS 路由
  // 处理器（/api/turnstile/verify-token 等）之前短路预检，也避免 data-collection
  // 被白名单外 Origin 拦截。
  app.use((req, res, next) => {
    res.locals.cspSurface = resolveCspSurface(req.path);
    ensureCspNonce(res);
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: buildHelmetCspDirectives(),
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      noSniff: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xssFilter: true,
      frameguard: { action: "deny" },
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use((_req, res, next) => {
    res.removeHeader("X-Powered-By");
    res.removeHeader("Server");
    next();
  });

  assertAssemblyNonApiRoutePath("/s/*path");
  app.options("/s/*path", corsPreflightHandler);
  app.use("/s/*path", corsHeadersMiddleware);

  registerSecurityPipeline(app, "preBodyParser");
  registerRouteModules(app, preParserRouteModules);

  app.use(requestIdMiddleware);
  app.use(requestProfilingMiddleware);
  app.use(express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      // G1-34: 拒绝 JSON 载荷里的 __proto__（原型污染向量）。body-parser 的
      // JSON.parse 默认不过滤该键，后续若被 merge/assign 会污染 Object.prototype。
      // 先做 Buffer 原生快速扫描，命中后才转字符串正则确认，避免大请求体重复转换。
      if (buf.length > 0 && buf.includes('"__proto__"') && /"__proto__"\s*:/.test(buf.toString("utf8"))) {
        const err: any = new Error("Prototype pollution payload rejected");
        err.status = 400;
        err.statusCode = 400;
        throw err;
      }
      // Preserve raw bytes only for the signed surfaces (nexai-sig-v2 / cdict-sig-v1 / lumen-sig-v1).
      // Copying the buffer for every request wastes CPU and memory; all other
      // routes only need the parsed JSON body. req.url is path + optional query.
      if (
        req.url?.startsWith("/api/nexai") ||
        req.url?.startsWith("/api/cdict") ||
        req.url?.startsWith("/api/lumen")
      ) {
        (req as any).rawBody = Buffer.from(buf);
      }
    },
  }));
  app.use(express.urlencoded({
    extended: true,
    limit: "10mb",
    verify: (req, _res, buf) => {
      // /api/cdict/translate also accepts form-urlencoded and cdict-sig-v1 signs raw bytes.
      if (req.url?.startsWith("/api/cdict")) {
        (req as any).rawBody = Buffer.from(buf);
      }
    },
  }));
}

export function registerSecurityMiddleware(app: Express): void {
  registerSecurityPipeline(app, "postBodyParser");

  if (startupConfig.security.wafEnabled) {
    logger.info("[WAF] 已启用");
  } else {
    logger.info("[WAF] 已通过 WAF_ENABLED=false 禁用");
  }

  app.use(globalCors);
  app.use(isLocalIp);
  app.use(requestLogger);
}

export function registerApiRoutes(app: Express): void {
  assertRouteGovernance();

  app.options("/api/shorturl/*path", corsPreflightHandler);
  app.use("/api/shorturl/*path", corsHeadersMiddleware);

  app.options("/api/turnstile/verify-token", openCorsPreflightHandler);
  app.options("/api/turnstile/public-turnstile", openCorsPreflightHandler);
  app.use("/api/turnstile/verify-token", openCorsHeadersMiddleware);
  app.use("/api/turnstile/public-turnstile", openCorsHeadersMiddleware);

  app.use(authCacheBypassPaths, applyNoCacheHeaders);

  registerRouteModules(app, earlyRouteModules);
  registerRouteModules(app, routeLimiterModules);
  registerRouteModules(app, preDocsRouteModules);

  registerRouteModules(app, preTamperRouteModules);
  registerSecurityPipeline(app, "prePostTamperRoutes");

  registerRouteModules(app, postTamperRouteModules);
  app.use(legacyApiRedirectMiddleware);

  logger.info("[NexAI] 鉴权路由已挂载 /api/nexai");
  logger.info("[NexAI Security] 安全路由已挂载 /api/nexai/security");
}

export function registerStaticRoutes(app: Express): void {
  app.use("/cdn-cgi", cloudflareChallengeRoutes);

  ensureAudioDir();
  if (process.env.TTS_PUBLIC_STATIC_AUDIO_ENABLED === "true") {
    app.use(
      "/static/audio",
      audioFileLimiter,
      express.static(audioDir, {
        setHeaders: (res) => {
          res.set("Cross-Origin-Resource-Policy", "cross-origin");
          res.set("Access-Control-Allow-Origin", "*");
        },
      }),
    );
  } else {
    app.use("/static/audio", audioFileLimiter, (_req, res) => {
      res.status(410).json({
        success: false,
        error: "Public static audio access is disabled. Use authorized TTS asset URLs.",
        code: "TTS_PUBLIC_AUDIO_DISABLED",
      });
    });
  }

  const serveFrontend = process.env.SERVE_FRONTEND !== "false";
  if (!serveFrontend) {
    logger.info("[Frontend] Static hosting disabled via SERVE_FRONTEND=false");
    return;
  }

  const resolvedFrontendPath = resolveStaticDirectory(frontendCandidates, ["index.html"]);
  if (resolvedFrontendPath) {
    logger.info(`[Frontend] Serving static files from: ${resolvedFrontendPath}`);
    // Read index.html once at startup instead of hitting the disk on every SPA
    // request. Per-request only the CSP nonce is injected into the cached shell.
    const indexPath = join(resolvedFrontendPath, "index.html");
    let cachedIndexHtml: string | null = null;
    try {
      cachedIndexHtml = fs.readFileSync(indexPath, "utf8");
    } catch (error) {
      logger.error("[Frontend] Failed to read index.html at startup", {
        path: indexPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const frontendStaticOptions = {
      setHeaders: (res: Response, filePath: string) => applyStaticCacheHeaders(res, filePath),
    };
    app.use(staticFileLimiter, express.static(resolvedFrontendPath, { index: false, ...frontendStaticOptions }));
    app.use("/static", staticFileLimiter, express.static(resolvedFrontendPath, frontendStaticOptions));
    const sendIndexHtml = (_req: Request, res: Response) => {
      const nonce = ensureCspNonce(res);
      if (cachedIndexHtml === null) {
        res.status(500).type("text/plain").send("Frontend shell unavailable");
        return;
      }
      res.set("Cache-Control", "no-cache, must-revalidate");
      res.set("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(applyCspNonceToHtml(cachedIndexHtml, nonce));
    };
    app.get("/", rootLimiter, sendIndexHtml);
    // /api-docs is an SPA route (embedded Swagger UI); only /api itself and the
    // raw spec paths stay backend-owned.
    app.get(/^\/(?!\.well-known(?:\/|$)|api(?:\/|$)|docs(?:\/|$)|static|assets(?:\/|$)|openapi)(.*)/, frontendLimiter, sendIndexHtml);
    return;
  }

  const expected = frontendCandidates.join(" | ");
  logger.warn(`[Frontend] 在任何候选路径中均未找到前端文件。已尝试：${expected}`);
  app.get("/index.html", (req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(getFrontendFallbackHtml(expected, ensureCspNonce(res)));
  });
}

export function registerErrorHandlers(app: Express): void {
  app.use(globalDefaultLimiter);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      logger.warn("JSON parse error", {
        ip: req.ip || req.connection.remoteAddress,
        path: req.path,
        method: req.method,
        userAgent: req.headers["user-agent"],
        error: err.message,
      });
      return res.status(400).json({ error: "无效的JSON格式" });
    }
    next(err);
  });

  app.use(passkeyErrorHandler);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    const statusCode = Number(err?.statusCode || err?.status || 500);
    const safeStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;
    logger.error("Unhandled request error", {
      path: req.path,
      method: req.method,
      ip: req.ip,
      error: err instanceof Error ? err.message : String(err),
      stack: process.env.NODE_ENV === "production" ? undefined : err?.stack,
    });

    return res.status(safeStatusCode).json({
      error: safeStatusCode >= 500 ? "Internal Server Error" : err?.message || "Request failed",
    });
  });

  app.use(notFoundLimiter, (req: Request, res: Response) => {
    logger.warn(`404 Not Found: ${req.method} ${req.url}`, {
      ip: req.ip,
      headers: sanitizeLogValue(req.headers),
      body: sanitizeLogValue(req.body),
    });
    res.status(404).json({ error: "Not Found" });
  });
}
