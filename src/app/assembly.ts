import fs from "node:fs";
import path, { join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
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
import { sendFaviconIfExists } from "../routes/siteMetadataRoutes";
import { registerSecurityPipeline } from "../security/securityPipeline";
import { readOpenapiJsonSync, shouldServeSwaggerFromJsonUrl } from "../services/openapiDocumentService";
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
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev") {
    req.isLocalIp = false;
  } else {
    req.isLocalIp = config.localIps.includes(ip);
  }
  next();
};

const requestLogger = (req: Request, _res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === "development" || process.env.VERBOSE_LOGGING === "true") {
    logger.info(`收到请求: ${req.method} ${req.url}`, {
      ip: req.ip,
      headers: sanitizeLogValue(req.headers),
      body: sanitizeLogValue(req.body),
    });
  } else if (process.env.ACCESS_LOG_ENABLED === "true") {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
  }
  next();
};

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Synapse API 文档",
      version: "1.0.0",
      description: "基于 OpenAPI 3.0 的接口文档",
    },
  },
  apis: [path.join(process.cwd(), "src/routes/*.ts"), path.join(process.cwd(), "dist/routes/*.js")],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

const swaggerCustomCss = `
  .swagger-ui .topbar .link img,
  .swagger-ui .topbar .link svg { display: none !important; }
  .swagger-ui .topbar .link {
    background: linear-gradient(135deg, #0f172a, #1d4ed8);
    border-radius: 8px;
    height: 50px;
    padding-left: 16px;
    padding-right: 16px;
    color: #fff !important;
    display: inline-flex;
    align-items: center;
  }
`;

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

const getFrontendFallbackHtml = (expected: string) => `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Synapse API</title>
    <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.6}.card{max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 4px 14px rgba(0,0,0,.08)}h1{margin:0 0 12px;font-size:24px}a{color:#3b82f6;text-decoration:none}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}</style>
  </head>
  <body><div class="card"><h1>Synapse 后端已启动</h1><p>未检测到前端构建文件。您仍可通过 Swagger 访问 API 文档：</p>
    <ul><li><a href="/api-docs">Swagger UI</a></li><li><a href="/api/openapi.json">Swagger JSON</a></li></ul>
    <p>如果需要启用前端，请设置环境变量 <code>FRONTEND_DIST_DIR</code> 或将构建产物放到以下任一路径：<br/><small>${expected}</small></p>
  </div></body>
</html>`;

function parseTrustProxySetting(): boolean | number | string | string[] {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) {
    return 1;
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
      // Preserve raw bytes for NexAI request signature (nexai-sig-v2).
      (req as any).rawBody = Buffer.from(buf);
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
}

export function registerSecurityMiddleware(app: Express): void {
  registerSecurityPipeline(app, "postBodyParser");

  if (startupConfig.security.wafEnabled) {
    logger.info("[WAF] 已启用");
  } else {
    logger.info("[WAF] 已通过 WAF_ENABLED=false 禁用");
  }

  app.use(globalCors);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
            "https://accounts.google.com",
            "https://www.gstatic.com",
            "https://*.chloemlla.com",
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://js.hcaptcha.com",
            "https://*.hcaptcha.com",
          ],
          styleSrcElem: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
            "https://accounts.google.com",
            "https://www.gstatic.com",
            "https://*.chloemlla.com",
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://js.hcaptcha.com",
            "https://*.hcaptcha.com",
          ],
          // Frontend bundles may inline woff2 as data URLs, so the static mount CSP must allow data: fonts.
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
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
          ],
          scriptSrcElem: [
            "'self'",
            "'unsafe-inline'",
            "https://accounts.google.com",
            "https://www.gstatic.com",
            "https://*.chloemlla.com",
            "https://www.clarity.ms",
            "https://*.clarity.ms",
            "https://www.googletagmanager.com",
            "https://www.google-analytics.com",
            "https://analytics.google.com",
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://js.hcaptcha.com",
            "https://*.hcaptcha.com",
          ],
          connectSrc: [
            "'self'",
            "https://accounts.google.com",
            "https://www.googleapis.com",
            "https://oauth2.googleapis.com",
            "https://api.openai.com",
            "wss://*.chloemlla.com",
            "https://*.chloemlla.com",
            ...(process.env.NODE_ENV !== "production"
              ? [
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
                ]
              : []),
            "https://api.hcaptcha.com",
            "https://*.hcaptcha.com",
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://www.google-analytics.com",
            "https://analytics.google.com",
            "https://www.google.com",
            "https://www.clarity.ms",
            "https://*.clarity.ms",
          ],
          frameSrc: [
            "'self'",
            "https://accounts.google.com",
            "https://*.chloemlla.com",
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://js.hcaptcha.com",
            "https://*.hcaptcha.com",
          ],
          childSrc: [
            "'self'",
            "https://accounts.google.com",
            "https://*.chloemlla.com",
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://js.hcaptcha.com",
            "https://*.hcaptcha.com",
          ],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
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

  let swaggerUiSpec: any = swaggerSpec;
  try {
    const json = readOpenapiJsonSync();
    swaggerUiSpec = JSON.parse(json);
    const pathsCount = swaggerUiSpec?.paths ? Object.keys(swaggerUiSpec.paths).length : 0;
    logger.info(`[Swagger] 为 UI 加载预先生成的 openapi.json，路径数=${pathsCount}`);
  } catch (error) {
    logger.warn(
      `[Swagger] Falling back to swagger-jsdoc generated spec. Reason: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const preferSwaggerUrl = shouldServeSwaggerFromJsonUrl();

  app.get("/api-docs/favicon-32x32.png", sendFaviconIfExists);
  app.get("/api-docs/favicon-16x16.png", sendFaviconIfExists);

  app.use(
    "/api-docs",
    applyNoCacheHeaders,
    swaggerUi.serve,
    preferSwaggerUrl
      ? swaggerUi.setup(undefined, {
          swaggerUrl: "/api/openapi.json",
          customSiteTitle: "Synapse API",
          customCss: swaggerCustomCss,
        })
      : swaggerUi.setup(swaggerUiSpec, {
          customSiteTitle: "Synapse API",
          customCss: swaggerCustomCss,
        }),
  );

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
    const frontendStaticOptions = {
      setHeaders: (res: Response, filePath: string) => applyStaticCacheHeaders(res, filePath),
    };
    app.use(staticFileLimiter, express.static(resolvedFrontendPath, { index: false, ...frontendStaticOptions }));
    app.use("/static", staticFileLimiter, express.static(resolvedFrontendPath, frontendStaticOptions));
    const sendIndexHtml = (_req: Request, res: Response) => {
      res.set("Cache-Control", "no-cache, must-revalidate");
      res.sendFile(join(resolvedFrontendPath, "index.html"));
    };
    app.get("/", rootLimiter, sendIndexHtml);
    app.get(/^\/(?!\.well-known(?:\/|$)|api|api-docs|docs(?:\/|$)|static|assets(?:\/|$)|openapi)(.*)/, frontendLimiter, sendIndexHtml);
    return;
  }

  const expected = frontendCandidates.join(" | ");
  logger.warn(`[Frontend] 在任何候选路径中均未找到前端文件。已尝试：${expected}`);
  app.get("/index.html", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(getFrontendFallbackHtml(expected));
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
