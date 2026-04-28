import { existsSync, mkdirSync } from "node:fs";
import fs from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path, { join } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config, startupConfig } from "../config/config";
import { getStartupDiagnosticsReport } from "../config/startupDiagnostics";
import { registerLogoutRoute } from "../controllers/authController";
import {
  corsHeadersMiddleware,
  corsPreflightHandler,
  globalCors,
  openCorsHeadersMiddleware,
  openCorsPreflightHandler,
} from "../middleware/corsMiddleware";
import { passkeyErrorHandler } from "../middleware/passkeyAutoFix";
import { requestIdMiddleware } from "../middleware/requestId";
import {
  audioFileLimiter,
  docsTimeoutLimiter,
  frontendLimiter,
  globalDefaultLimiter,
  integrityLimiter,
  ipLocationLimiter,
  ipQueryLimiter,
  ipReportLimiter,
  lcCompatLimiter,
  notFoundLimiter,
  openapiLimiter,
  rootLimiter,
  serverStatusLimiter,
  staticFileLimiter,
} from "../middleware/routeLimiters";
import {
  earlyRouteModules,
  postTamperRouteModules,
  preDocsRouteModules,
  preParserRouteModules,
  preTamperRouteModules,
  registerRouteModules,
  routeLimiterModules,
} from "../routes";
import shortUrlRoutes from "../routes/shortUrlRoutes";
import { registerSecurityPipeline } from "../security/securityPipeline";
import { getIPInfo } from "../services/ip";
import { isConnected as isMongoConnected } from "../services/mongoService";
import { wsService } from "../services/wsService";
import logger from "../utils/logger";
import { getNexaiAssetLinksStatements } from "../utils/nexaiWebAuthn";

declare global {
  namespace Express {
    interface Request {
      isLocalIp?: boolean;
    }
  }
}

const DATA_DIR = path.join(process.cwd(), "data");
const CLIENT_REPORTED_IP_FILE = path.join(DATA_DIR, "clientReportedIP.json");
const IP_DATA_FILE = "ip_data.txt";
const audioDir = path.join(__dirname, "../finish");

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
];

const readOpenapiJsonSync = (): string => {
  const candidates = [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    "/app/openapi.json",
    path.join(process.cwd(), "openapi.json"),
    path.join(__dirname, "../openapi.json"),
    path.join(process.cwd(), "dist/openapi.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return fs.readFileSync(candidate, "utf-8");
      }
    } catch (_error) {
      // ignore candidate and continue
    }
  }

  throw new Error(`openapi.json not found in: ${candidates.join(" | ")}`);
};

const readOpenapiJson = async (): Promise<string> => {
  const candidates = [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    "/app/openapi.json",
    path.join(process.cwd(), "openapi.json"),
    path.join(__dirname, "../openapi.json"),
    path.join(process.cwd(), "dist/openapi.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const isFile = await fs.promises
        .stat(candidate)
        .then((stats) => stats.isFile())
        .catch(() => false);
      if (isFile) {
        return await fs.promises.readFile(candidate, "utf-8");
      }
    } catch (_error) {
      // ignore candidate and continue
    }
  }

  throw new Error(`openapi.json not found in: ${candidates.join(" | ")}`);
};

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
      headers: req.headers,
      body: req.body,
    });
  } else {
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

const ensureAudioDir = async () => {
  if (!fs.existsSync(audioDir)) {
    await fs.promises.mkdir(audioDir, { recursive: true });
  }
};

const applyNoCacheHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.removeHeader?.("ETag");
  next();
};

const sendApiDocsJson = async (_req: Request, res: Response) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.send(await readOpenapiJson());
  } catch (_error) {
    res.status(500).json({ error: "无法读取API文档" });
  }
};

const sendFaviconIfExists = (_req: Request, res: Response) => {
  const faviconPath = path.resolve(process.cwd(), "favicon.ico");
  if (fs.existsSync(faviconPath)) {
    res.sendFile(faviconPath);
    return;
  }
  res.status(204).end();
};

const getFrontendFallbackHtml = (expected: string) => `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Synapse API</title>
    <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.6}.card{max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 4px 14px rgba(0,0,0,.08)}h1{margin:0 0 12px;font-size:24px}a{color:#3b82f6;text-decoration:none}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}</style>
  </head>
  <body><div class="card"><h1>Synapse 后端已启动</h1><p>未检测到前端构建文件。您仍可通过 Swagger 访问 API 文档：</p>
    <ul><li><a href="/api-docs">Swagger UI</a></li><li><a href="/api-docs.json">Swagger JSON</a></li></ul>
    <p>如果需要启用前端，请设置环境变量 <code>FRONTEND_DIST_DIR</code> 或将构建产物放到以下任一路径：<br/><small>${expected}</small></p>
  </div></body>
</html>`;

async function getIpLocation(ip: string): Promise<string> {
  try {
    const response = await fetch(`https://api.vore.top/api/IPdata?ip=${ip}`);
    const data = await response.json();
    if (data.code === 200) {
      const info = data.ipdata;
      return `${info.info1}, ${info.info2}, ${info.info3} 运营商: ${info.isp}`;
    }
    return "未找到位置";
  } catch (error) {
    console.error("获取 IP 位置时出错:", { ip, error });
    return "获取位置时出错";
  }
}

async function logIpData(ip: string, location: string): Promise<void> {
  await appendFile(IP_DATA_FILE, `${ip}, ${location}\n`);
}

async function readIpData(): Promise<Record<string, string>> {
  if (!existsSync(IP_DATA_FILE)) return {};
  const content = await readFile(IP_DATA_FILE, "utf-8");
  const ipData: Record<string, string> = {};
  content.split("\n").forEach((line) => {
    if (line.trim()) {
      const [ip, location] = line.split(", ", 2);
      if (ip && location) ipData[ip] = location;
    }
  });
  return ipData;
}

export function registerCoreMiddleware(app: Express): void {
  app.options("/s/*path", corsPreflightHandler);
  app.use("/s/*path", corsHeadersMiddleware);

  registerRouteModules(app, preParserRouteModules);

  app.use(requestIdMiddleware);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    const mongo = isMongoConnected();
    const report = getStartupDiagnosticsReport();
    const requiredFailures = report?.summary.requiredFailures || 0;
    const status = mongo && requiredFailures === 0 ? "ok" : "degraded";
    res.status(status === "ok" ? 200 : 503).json({
      status,
      uptime: process.uptime(),
      mongo: mongo ? "connected" : "disconnected",
      wsConnections: wsService.getConnectionCount(),
      startupReadiness: report?.summary || null,
      dependencies: report?.dependencies || [],
      timestamp: new Date().toISOString(),
    });
  });
}

export function registerSecurityMiddleware(app: Express): void {
  app.set("trust proxy", 1);
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
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://js.hcaptcha.com",
            "https://*.hcaptcha.com",
          ],
          styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://accounts.google.com",
            "https://challenges.cloudflare.com",
            "https://*.cloudflare.com",
            "https://js.hcaptcha.com",
            "https://*.hcaptcha.com",
            "https://www.google-analytics.com",
            "https://analytics.google.com",
            "https://www.clarity.ms",
            "https://*.clarity.ms",
          ],
          scriptSrcElem: [
            "'self'",
            "'unsafe-inline'",
            "https://accounts.google.com",
            "https://www.clarity.ms",
            "https://*.clarity.ms",
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
            "https://api.openai.com",
            "https://api.951100.xyz",
            ...(process.env.NODE_ENV !== "production"
              ? [
                  "http://localhost:3000",
                  "http://localhost:3001",
                  "http://localhost:6000",
                  "http://localhost:6001",
                  "http://127.0.0.1:3001",
                  "http://127.0.0.1:6000",
                  "http://127.0.0.1:6001",
                  "http://192.168.10.7:3001",
                  "http://192.168.10.7:6000",
                  "http://192.168.10.7:6001",
                ]
              : []),
            "https://api.hcaptcha.com",
            "https://*.hcaptcha.com",
            "https://www.google-analytics.com",
            "https://analytics.google.com",
            "https://www.clarity.ms",
            "https://*.clarity.ms",
          ],
          frameSrc: [
            "'self'",
            "https://accounts.google.com",
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
  app.use("/s", shortUrlRoutes);

  app.options("/api/shorturl/*path", corsPreflightHandler);
  app.use("/api/shorturl/*path", corsHeadersMiddleware);

  app.options("/api/turnstile/verify-token", openCorsPreflightHandler);
  app.options("/api/turnstile/public-turnstile", openCorsPreflightHandler);
  app.use("/api/turnstile/verify-token", openCorsHeadersMiddleware);
  app.use("/api/turnstile/public-turnstile", openCorsHeadersMiddleware);

  app.use(authCacheBypassPaths, applyNoCacheHeaders);

  app.use("/api/shorturl", shortUrlRoutes);
  registerLogoutRoute(app);

  registerRouteModules(app, earlyRouteModules);
  registerRouteModules(app, routeLimiterModules);
  registerRouteModules(app, preDocsRouteModules);

  app.get("/api/frontend-config", (_req: Request, res: Response) => {
    res.json({
      enableFirstVisitVerification: config.ipqs.enabled,
      enableIpVerification: config.ipqs.enabled,
      ipVerificationTtlMinutes: config.ipqs.tokenTtlMinutes,
    });
  });

  registerRouteModules(app, preTamperRouteModules);
  registerSecurityPipeline(app, "prePostTamperRoutes");

  app.options("/api/debug-console/*path", corsPreflightHandler);
  app.use("/api/debug-console/*path", corsHeadersMiddleware);
  registerRouteModules(app, postTamperRouteModules);

  logger.info("[NexAI] 鉴权路由已挂载 /api/nexai");
  logger.info("[NexAI Security] 安全路由已挂载 /api/nexai/security");

  app.head("/api/proxy-test", integrityLimiter, (_req, res) => res.sendStatus(200));
  app.get("/api/proxy-test", integrityLimiter, (_req, res) => res.sendStatus(200));
  app.get("/api/timing-test", integrityLimiter, (_req, res) => res.sendStatus(200));

  app.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(getNexaiAssetLinksStatements());
  });

  app.get("/", rootLimiter, (_req, res) => {
    res.redirect("http://tts.951100.xyz/");
  });

  app.get("/favicon.ico", sendFaviconIfExists);

  app.get("/lc", lcCompatLimiter, (_req, res) => {
    try {
      const { libreChatService } = require("../services/libreChatService");
      const record = libreChatService.getLatestRecord();
      if (record) {
        return res.json({
          update_time: record.updateTime,
          image_name: record.imageUrl,
          update_time_shanghai: record.updateTimeShanghai,
        });
      }
      return res.status(404).json({ error: "No data available." });
    } catch (_error) {
      return res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get("/librechat-image", lcCompatLimiter, (_req, res) => res.redirect(302, "/api/libre-chat/librechat-image"));

  app.get("/ip", ipQueryLimiter, async (req, res) => {
    try {
      const ip = (req.headers["x-real-ip"] as string) || req.ip || "127.0.0.1";
      logger.info("收到IP信息查询请求", {
        ip,
        userAgent: req.headers["user-agent"],
      });
      const ipInfo = await getIPInfo(ip);
      logger.info("IP信息查询成功", { ip, ipInfo });
      res.json(ipInfo);
    } catch (error) {
      logger.error("IP信息查询失败", {
        ip: (req.headers["x-real-ip"] as string) || req.ip || "127.0.0.1",
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "获取IP信息失败",
        ip: (req.headers["x-real-ip"] as string) || req.ip || "127.0.0.1",
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  });

  app.post("/api/report-ip", ipReportLimiter, async (req, res) => {
    try {
      const { ip: clientReportedIP, userAgent, url, referrer, timestamp } = req.body;
      const realIP = req.headers["x-real-ip"] || req.ip;
      const ua = req.headers["user-agent"] || "";
      logger.info(
        `前端上报公网IP: ${clientReportedIP}，请求真实IP: ${realIP}，UA: ${ua}，userAgent: ${userAgent}，url: ${url}，referrer: ${referrer}，timestamp: ${timestamp}`,
      );

      if (!existsSync(DATA_DIR)) {
        mkdirSync(DATA_DIR, { recursive: true });
      }

      let records: any[] = [];
      if (existsSync(CLIENT_REPORTED_IP_FILE)) {
        try {
          const content = await readFile(CLIENT_REPORTED_IP_FILE, "utf-8");
          records = JSON.parse(content);
          if (!Array.isArray(records)) records = [];
        } catch (_error) {
          records = [];
        }
      }

      records.push({
        clientReportedIP,
        realIP,
        ua,
        userAgent,
        url,
        referrer,
        timestamp,
      });
      await writeFile(CLIENT_REPORTED_IP_FILE, JSON.stringify(records, null, 2));
      res.json({ success: true });
    } catch (error) {
      logger.error("处理 /api/report-ip 失败:", error);
      res.status(500).json({ error: "上报公网IP失败" });
    }
  });

  app.post("/api/report-docs-timeout", docsTimeoutLimiter, (req, res) => {
    const { url, timestamp, userAgent } = req.body;
    logger.error("API文档加载超时", {
      url,
      timestamp: new Date(timestamp).toISOString(),
      userAgent,
      ip: req.ip,
      headers: req.headers,
    });
    res.json({ success: true });
  });

  app.get("/ip-location", ipLocationLimiter, async (req, res) => {
    const providedIp = req.query.ip as string;
    const realTime = req.query["real-time"] !== undefined;

    let ip = providedIp;
    if (!ip) {
      const forwardedFor = req.headers["x-forwarded-for"]?.toString();
      const realIp = req.headers["x-real-ip"]?.toString();
      ip = forwardedFor?.split(",")[0] || realIp || req.ip || "unknown";
    }

    console.log(`获取到的 IP: ${ip}`);

    if (realTime) {
      const locationInfo = await getIpLocation(ip);
      await logIpData(ip, locationInfo);
      return res.json({ ip, location: locationInfo, message: "实时结果" });
    }

    const ipData = await readIpData();
    if (ip in ipData) {
      return res.json({
        ip,
        location: ipData[ip],
        message: "本次内容为缓存结果。您可以请求 /ip?real-time 来获取实时结果。",
      });
    }

    const locationInfo = await getIpLocation(ip);
    await logIpData(ip, locationInfo);
    return res.json({
      ip,
      location: locationInfo,
      message: "如果您提供的 IP 是 VPN 服务器的地址，位置信息可能不准确。",
    });
  });

  const password = startupConfig.serverPassword;
  app.post("/server_status", serverStatusLimiter, (req, res) => {
    if (req.body.password === password) {
      const bootTime = process.uptime();
      const memoryUsage = process.memoryUsage();
      return res.json({
        boot_time: new Date(Date.now() - bootTime * 1000).toISOString(),
        uptime: bootTime,
        cpu_usage_percent: process.cpuUsage().user / 1000000,
        memory_usage: {
          used: memoryUsage.heapUsed,
          total: memoryUsage.heapTotal,
          percent: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        },
      });
    }

    return res.json({
      boot_time: "2023-01-01T00:00:00.000Z",
      uptime: Math.floor(Math.random() * 34200) + 1800,
      cpu_usage_percent: Math.floor(Math.random() * 90) + 5,
      memory_usage: {
        used: Math.floor(Math.random() * 7.5 * 1024 * 1024 * 1024) + 500 * 1024 * 1024,
        total: Math.floor(Math.random() * 14 * 1024 * 1024 * 1024) + 2 * 1024 * 1024 * 1024,
        percent: Math.floor(Math.random() * 90) + 5,
      },
    });
  });
}

export function registerStaticRoutes(app: Express): void {
  app.get("/api/api-docs.json", openapiLimiter, sendApiDocsJson);
  app.get("/api-docs.json", openapiLimiter, sendApiDocsJson);
  app.get("/openapi.json", openapiLimiter, sendApiDocsJson);

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

  const preferSwaggerUrl = !!process.env.OPENAPI_JSON_PATH || fs.existsSync("/app/openapi.json");

  app.get("/api-docs/favicon-32x32.png", sendFaviconIfExists);
  app.get("/api-docs/favicon-16x16.png", sendFaviconIfExists);

  app.use(
    "/api-docs",
    applyNoCacheHeaders,
    swaggerUi.serve,
    preferSwaggerUrl
      ? swaggerUi.setup(undefined, {
          swaggerUrl: "/openapi.json",
          customSiteTitle: "Happy API",
          customCss: swaggerCustomCss,
        })
      : swaggerUi.setup(swaggerUiSpec, {
          customSiteTitle: "Happy API",
          customCss: swaggerCustomCss,
        }),
  );

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
  void ensureAudioDir().catch(console.error);

  const resolvedFrontendPath = frontendCandidates.find((candidate) => existsSync(candidate));
  if (resolvedFrontendPath) {
    logger.info(`[Frontend] Serving static files from: ${resolvedFrontendPath}`);
    app.use("/static", staticFileLimiter, express.static(resolvedFrontendPath));
    app.get(/^\/(?!\.well-known(?:\/|$)|api|api-docs|static|openapi)(.*)/, frontendLimiter, (_req, res) => {
      res.sendFile(join(resolvedFrontendPath, "index.html"));
    });
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

  app.use(notFoundLimiter, (req: Request, res: Response) => {
    logger.warn(`404 Not Found: ${req.method} ${req.url}`, {
      ip: req.ip,
      headers: req.headers,
      body: req.body,
    });
    res.status(404).json({ error: "Not Found" });
  });
}
