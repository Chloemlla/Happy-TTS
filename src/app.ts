// 设置时区为上海
process.env.TZ = "Asia/Shanghai";

import { exec } from "node:child_process";
import fs, { existsSync, mkdirSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path, { join } from "node:path";
import { promisify } from "node:util";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import helmet from "helmet";
import { OpenAI } from "openai";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { config } from "./config/config";
import { registerLogoutRoute } from "./controllers/authController";
import { authenticateToken } from "./middleware/authenticateToken";
// ========== CORS 中间件 ==========
import {
  corsHeadersMiddleware,
  corsPreflightHandler,
  globalCors,
  openCorsHeadersMiddleware,
  openCorsPreflightHandler,
} from "./middleware/corsMiddleware";
import { ipBanCheckWithRateLimit } from "./middleware/ipBanCheck";
import { passkeyAutoFixMiddleware, passkeyErrorHandler } from "./middleware/passkeyAutoFix";
// ========== 限流器（统一从 routeLimiters 导入） ==========
import {
  adminLimiter,
  antaLimiter,
  audioFileLimiter,
  authLimiter,
  cdkMountLimiter,
  commandLimiter,
  dataCollectionLimiter,
  dataProcessLimiter,
  docsTimeoutLimiter,
  frontendLimiter,
  githubBillingLimiter,
  globalDefaultLimiter,
  historyLimiter,
  integrityLimiter,
  ipfsLimiter,
  ipLocationLimiter,
  ipQueryLimiter,
  ipReportLimiter,
  lcCompatLimiter,
  libreChatLimiter,
  lifeLimiter,
  mediaLimiter,
  meEndpointLimiter,
  miniapiLimiter,
  modlistMountLimiter,
  networkLimiter,
  notFoundLimiter,
  openapiLimiter,
  passkeyLimiter,
  rootLimiter,
  serverStatusLimiter,
  socialLimiter,
  staticFileLimiter,
  statusLimiter,
  tamperLimiter,
  totpLimiter,
  ttsLimiter,
} from "./middleware/routeLimiters";
import { tamperProtectionMiddleware } from "./middleware/tamperProtection";
import { wafMiddleware } from "./middleware/wafMiddleware";
import adminRoutes from "./routes/adminRoutes";
import antaRoutes from "./routes/antaRoutes";
import apiKeyRoutes from "./routes/apiKeyRoutes";
import auditLogRoutes from "./routes/auditLogRoutes";
import authRoutes from "./routes/authRoutes";
import cdkRoutes from "./routes/cdkRoutes";
import commandRoutes from "./routes/commandRoutes";
import dataCollectionAdminRoutes from "./routes/dataCollectionAdminRoutes";
import dataCollectionRoutes from "./routes/dataCollectionRoutes";
import dataProcessRoutes from "./routes/dataProcessRoutes";
import debugConsoleRoutes from "./routes/debugConsoleRoutes";
import emailRoutes from "./routes/emailRoutes";
import fbiWantedRoutes from "./routes/fbiWantedRoutes";
import githubBillingRoutes from "./routes/githubBillingRoutes";
import humanCheckRoutes from "./routes/humanCheckRoutes";
import imageDataRoutes from "./routes/imageDataRoutes";
import ipfsRoutes from "./routes/ipfsRoutes";
import libreChatRoutes from "./routes/libreChatRoutes";
import lifeRoutes from "./routes/lifeRoutes";
import logRoutes from "./routes/logRoutes";
import lotteryRoutes from "./routes/lotteryRoutes";
import mediaRoutes from "./routes/mediaRoutes";
import miniapiRoutes from "./routes/miniapiRoutes";
import modlistRoutes from "./routes/modlistRoutes";
import networkRoutes from "./routes/networkRoutes";
import outemailRoutes from "./routes/outemailRoutes";
import passkeyRoutes from "./routes/passkeyRoutes";
import policyRoutes from "./routes/policyRoutes";
import resourceRoutes from "./routes/resourceRoutes";
import shortUrlRoutes from "./routes/shortUrlRoutes";
import socialRoutes from "./routes/socialRoutes";
import statusRouter from "./routes/status";
import tamperRoutes from "./routes/tamperRoutes";
import totpRoutes, { totpStatusHandler } from "./routes/totpRoutes";
import ttsRoutes from "./routes/ttsRoutes";
import turnstileRoutes from "./routes/turnstileRoutes";
import webhookEventRoutes from "./routes/webhookEventRoutes";
import webhookRoutes from "./routes/webhookRoutes";
import { getIPInfo } from "./services/ip";
import { isConnected as isMongoConnected } from "./services/mongoService";
import { schedulerService } from "./services/schedulerService";
import { wsService } from "./services/wsService";
import logger from "./utils/logger";
import { UserStorage } from "./utils/userStorage";

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      isLocalIp?: boolean;
    }
  }
}

// 邮件服务全局开关
// eslint-disable-next-line no-var
var _EMAIL_ENABLED: boolean;
// eslint-disable-next-line no-var
var _EMAIL_SERVICE_STATUS: { available: boolean; error?: string };
// eslint-disable-next-line no-var
var _OUTEMAIL_SERVICE_STATUS: { available: boolean; error?: string };

// Synchronous helper for Swagger UI initialization
const readOpenapiJsonSync = (): string => {
  const candidates = [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    "/app/openapi.json",
    path.join(process.cwd(), "openapi.json"),
    path.join(__dirname, "../openapi.json"),
    path.join(process.cwd(), "dist/openapi.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return fs.readFileSync(p, "utf-8");
      }
    } catch (_) {
      /* ignore */
    }
  }
  throw new Error(`openapi.json not found in: ${candidates.join(" | ")}`);
};

const app = express();
const _execAsync = promisify(exec);

// ========== 需要在全局 JSON 解析器之前挂载的路由 ==========

// 短链路由 CORS（OPTIONS + 响应头）
app.options("/s/*path", corsPreflightHandler);
app.use("/s/*path", corsHeadersMiddleware);

// Webhook 路由（需要原始 body，必须在 JSON parser 之前）
app.use("/api/webhooks", webhookRoutes);

// 数据收集路由（避免 body-parser 对非 JSON 请求抛错）
app.use("/api/data-collection", dataCollectionRoutes);
app.use("/", dataCollectionRoutes);

// ========== 全局中间件 ==========

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 健康检查端点（轻量，跳过所有中间件，用于 liveness/readiness probe）
app.get("/health", (_req: Request, res: Response) => {
  const mongo = isMongoConnected();
  const status = mongo ? "ok" : "degraded";
  res.status(mongo ? 200 : 503).json({
    status,
    uptime: process.uptime(),
    mongo: mongo ? "connected" : "disconnected",
    wsConnections: wsService.getConnectionCount(),
    timestamp: new Date().toISOString(),
  });
});

// 全局 IP 封禁检查
app.use(ipBanCheckWithRateLimit);

// WAF 安全校验（在 body parser 之后、路由之前，确保能检查 body）
if (process.env.WAF_ENABLED !== "false") {
  app.use(wafMiddleware);
  logger.info("[WAF] 已启用");
} else {
  logger.info("[WAF] 已通过 WAF_ENABLED=false 禁用");
}

// 短链跳转（最高优先级）
app.use("/s", shortUrlRoutes);

// /api/shorturl CORS
app.options("/api/shorturl/*path", corsPreflightHandler);
app.use("/api/shorturl/*path", corsHeadersMiddleware);

// Turnstile 开放 CORS（origin: *）
app.options("/api/turnstile/verify-token", openCorsPreflightHandler);
app.options("/api/turnstile/public-turnstile", openCorsPreflightHandler);
app.use("/api/turnstile/verify-token", openCorsHeadersMiddleware);
app.use("/api/turnstile/public-turnstile", openCorsHeadersMiddleware);

// 短链管理 API
app.use("/api/shorturl", shortUrlRoutes);

// 信任代理
app.set("trust proxy", 1);

// 检查是否是本地 IP
const isLocalIp = (req: Request, _res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev") {
    req.isLocalIp = false;
  } else {
    req.isLocalIp = config.localIps.includes(ip);
  }
  next();
};

// 请求日志（仅记录关键信息，避免序列化完整 headers/body 造成性能开销）
app.use((req: Request, _res: Response, next: NextFunction) => {
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
});

// 全局 CORS
app.use(globalCors);

// 安全头配置
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://challenges.cloudflare.com",
          "https://*.cloudflare.com",
          "https://js.hcaptcha.com",
          "https://*.hcaptcha.com",
        ],
        styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
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
          "https://api.openai.com",
          "https://api.951100.xyz",
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
          "https://api.hcaptcha.com",
          "https://*.hcaptcha.com",
          "https://www.google-analytics.com",
          "https://analytics.google.com",
          "https://www.clarity.ms",
          "https://*.clarity.ms",
        ],
        frameSrc: [
          "'self'",
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

// 移除泄露信息的响应头
app.use((_req, res, next) => {
  res.removeHeader("X-Powered-By");
  res.removeHeader("Server");
  next();
});
app.use(isLocalIp);

// ========== 路由注册 + 限流绑定 ==========

// 邮件路由（无需 token）
app.use("/api/email", emailRoutes);
app.use("/api/outemail", outemailRoutes);

// 限流绑定
app.use("/api/auth", authLimiter);
app.use("/api/auth/me", meEndpointLimiter);
app.use("/api/tts/generate", ttsLimiter);
app.use("/api/tts/history", historyLimiter);
app.use("/api/totp", totpLimiter);
app.use("/api/passkey", passkeyLimiter);
app.use("/api/tamper", tamperLimiter);
app.use("/api/command", commandLimiter);
app.use("/api/libre-chat", libreChatLimiter);
app.use("/api/data-collection", dataCollectionLimiter);
app.use("/api/ipfs", ipfsLimiter);
app.use("/api/network", networkLimiter);
app.use("/api/data", dataProcessLimiter);
app.use("/api/media", mediaLimiter);
app.use("/api/social", socialLimiter);
app.use("/api/life", lifeLimiter);
app.use("/api/status", statusLimiter);

// 路由挂载
app.use("/api/tts", ttsRoutes);
app.use("/api/librechat", libreChatLimiter, libreChatRoutes);

// ========== Swagger OpenAPI 文档集成 ==========
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: { title: "Happy-TTS API 文档", version: "1.0.0", description: "基于 OpenAPI 3.0 的接口文档" },
  },
  apis: [path.join(process.cwd(), "src/routes/*.ts"), path.join(process.cwd(), "dist/routes/*.js")],
};
const swaggerSpec = swaggerJSDoc(swaggerOptions);

const readOpenapiJson = async (): Promise<string> => {
  const candidates = [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    "/app/openapi.json",
    path.join(process.cwd(), "openapi.json"),
    path.join(__dirname, "../openapi.json"),
    path.join(process.cwd(), "dist/openapi.json"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (
        await fs.promises
          .stat(p)
          .then((s) => s.isFile())
          .catch(() => false)
      ) {
        return await fs.promises.readFile(p, "utf-8");
      }
    } catch (_) {
      /* ignore */
    }
  }
  throw new Error(`openapi.json not found in: ${candidates.join(" | ")}`);
};

// openapi.json 路由
app.get("/api/api-docs.json", openapiLimiter, async (_req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.send(await readOpenapiJson());
  } catch (_error) {
    res.status(500).json({ error: "无法读取API文档" });
  }
});
app.get("/api-docs.json", openapiLimiter, async (_req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.send(await readOpenapiJson());
  } catch (_error) {
    res.status(500).json({ error: "无法读取API文档" });
  }
});
app.get("/openapi.json", openapiLimiter, async (_req, res) => {
  try {
    res.setHeader("Content-Type", "application/json");
    res.send(await readOpenapiJson());
  } catch (_error) {
    res.status(500).json({ error: "无法读取API文档" });
  }
});

// Swagger UI
let swaggerUiSpec: any = swaggerSpec;
let _swaggerLoadReason = "swagger-jsdoc";
try {
  const json = readOpenapiJsonSync();
  swaggerUiSpec = JSON.parse(json);
  const pathsCount = swaggerUiSpec?.paths ? Object.keys(swaggerUiSpec.paths).length : 0;
  logger.info(`[Swagger] 为 UI 加载预先生成的 openapi.json，路径数=${pathsCount}`);
  _swaggerLoadReason = "pre-generated-openapi.json";
} catch (e) {
  logger.warn(
    `[Swagger] Falling back to swagger-jsdoc generated spec. Reason: ${e instanceof Error ? e.message : String(e)}`,
  );
}

const preferSwaggerUrl = !!process.env.OPENAPI_JSON_PATH || fs.existsSync("/app/openapi.json");

app.get("/api-docs/favicon-32x32.png", (_req: Request, res: Response) => {
  res.redirect(302, "https://png.hapxs.com/i/2025/08/08/68953253d778d.png");
});
app.get("/api-docs/favicon-16x16.png", (_req: Request, res: Response) => {
  res.redirect(302, "https://png.hapxs.com/i/2025/08/08/68953253d778d.png");
});

const swaggerCustomCss = `
  .swagger-ui .topbar .link img,
  .swagger-ui .topbar .link svg { display: none !important; }
  .swagger-ui .topbar .link {
    background-image: url('https://png.hapxs.com/i/2025/08/08/68953253d778d.png');
    background-repeat: no-repeat;
    background-position: left center;
    background-size: auto 40px;
    height: 50px;
    padding-left: 150px;
  }
`;

app.use(
  "/api-docs",
  (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.removeHeader?.("ETag");
    next();
  },
  swaggerUi.serve,
  preferSwaggerUrl
    ? swaggerUi.setup(undefined, {
        swaggerUrl: "/openapi.json",
        customSiteTitle: "Happy API",
        customCss: swaggerCustomCss,
      })
    : swaggerUi.setup(swaggerUiSpec, { customSiteTitle: "Happy API", customCss: swaggerCustomCss }),
);

// ========== 音频静态文件 ==========
const audioDir = path.join(__dirname, "../finish");
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

const ensureAudioDir = async () => {
  if (!fs.existsSync(audioDir)) {
    await fs.promises.mkdir(audioDir, { recursive: true });
  }
};
ensureAudioDir().catch(console.error);

// 前端配置 API（公开访问）
app.get("/api/frontend-config", (_req: Request, res: Response) => {
  res.json({ enableFirstVisitVerification: config.enableFirstVisitVerification });
});

// ========== 路由注册（续） ==========
app.use("/api/auth", authRoutes);
app.use("/api/totp", totpRoutes);
app.use("/api/totp/status", authenticateToken, totpStatusHandler as RequestHandler);
app.use("/api/admin", adminLimiter, adminRoutes);
app.use("/api/admin/audit-logs", adminLimiter, authenticateToken, auditLogRoutes);
app.use("/api/apikeys", apiKeyRoutes);
app.use("/api/status", statusRouter);
app.use("/api/turnstile", turnstileRoutes);
app.use("/api/policy", policyRoutes);
app.use("/api/tamper", tamperRoutes);
app.use(tamperProtectionMiddleware);
app.use("/api/command", commandRoutes);
app.use("/api/libre-chat", libreChatRoutes);
app.use("/api/human-check", humanCheckRoutes);
app.options("/api/debug-console/*path", corsPreflightHandler);
app.use("/api/debug-console/*path", corsHeadersMiddleware);
app.use("/api/debug-console", debugConsoleRoutes);
app.use("/api/data-collection", dataCollectionRoutes);
app.use("/api/data-collection/admin", dataCollectionAdminRoutes);
app.use("/api/ipfs", ipfsRoutes);
app.use("/api/network", networkRoutes);
app.use("/api/data", dataProcessRoutes);
app.use("/api/lottery", lotteryRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/life", lifeRoutes);
app.use("/api", logRoutes);
app.use("/api/passkey", passkeyAutoFixMiddleware);
app.use("/api/passkey", passkeyRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/miniapi", miniapiLimiter, miniapiRoutes);

// 安踏防伪查询路由
app.use(
  "/api/anta",
  antaLimiter,
  (req: Request, _res: Response, next: NextFunction) => {
    logger.info(`安踏防伪查询请求: ${req.method} ${req.url}`, {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      productId: req.params?.productId || req.body?.productId || "unknown",
    });
    next();
  },
  antaRoutes,
);

app.use("/api/modlist", modlistMountLimiter, modlistRoutes);
app.use("/api/image-data", imageDataRoutes);
app.use("/api", resourceRoutes);
app.use("/api/cdks", cdkMountLimiter, cdkRoutes);
app.use("/api/webhook-events", authenticateToken, adminLimiter, webhookEventRoutes);
app.use("/api/fbi-wanted", fbiWantedRoutes);
app.use("/api/github-billing", githubBillingLimiter, githubBillingRoutes);

// 完整性检测兜底接口
app.head("/api/proxy-test", integrityLimiter, (_req, res) => res.sendStatus(200));
app.get("/api/proxy-test", integrityLimiter, (_req, res) => res.sendStatus(200));
app.get("/api/timing-test", integrityLimiter, (_req, res) => res.sendStatus(200));

// 根路由
app.get("/", rootLimiter, (_req, res) => {
  res.redirect("http://tts-new.951100.xyz/");
});

app.get("/favicon.ico", (_req, res) => {
  res.redirect(302, "https://png.hapxs.com/i/2025/08/08/68953253d778d.png");
});

// 兼容旧路径
app.get("/lc", lcCompatLimiter, (_req, res) => {
  try {
    const { libreChatService } = require("./services/libreChatService");
    const record = libreChatService.getLatestRecord();
    if (record) {
      return res.json({
        update_time: record.updateTime,
        image_name: record.imageUrl,
        update_time_shanghai: record.updateTimeShanghai,
      });
    }
    return res.status(404).json({ error: "No data available." });
  } catch (_e) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
app.get("/librechat-image", lcCompatLimiter, (_req, res) => res.redirect(302, "/api/libre-chat/librechat-image"));

// ========== IP 相关路由 ==========

app.get("/ip", ipQueryLimiter, async (req, res) => {
  try {
    const ip = (req.headers["x-real-ip"] as string) || req.ip || "127.0.0.1";
    logger.info("收到IP信息查询请求", { ip, userAgent: req.headers["user-agent"] });
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

// 前端上报公网IP
const DATA_DIR = path.join(process.cwd(), "data");
const CLIENT_REPORTED_IP_FILE = path.join(DATA_DIR, "clientReportedIP.json");
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
      } catch (_e) {
        records = [];
      }
    }

    records.push({ clientReportedIP, realIP, ua, userAgent, url, referrer, timestamp });
    await writeFile(CLIENT_REPORTED_IP_FILE, JSON.stringify(records, null, 2));
    res.json({ success: true });
  } catch (error) {
    logger.error("处理 /api/report-ip 失败:", error);
    res.status(500).json({ error: "上报公网IP失败" });
  }
});

// ========== 静态文件服务 ==========

const frontendCandidates = [
  process.env.FRONTEND_DIST_DIR && path.resolve(process.env.FRONTEND_DIST_DIR),
  join(__dirname, "../frontend/dist"),
  join(__dirname, "../../frontend/dist"),
  path.resolve(process.cwd(), "frontend/dist"),
].filter(Boolean) as string[];

const resolvedFrontendPath = frontendCandidates.find((p) => existsSync(p));

if (resolvedFrontendPath) {
  logger.info(`[Frontend] Serving static files from: ${resolvedFrontendPath}`);
  app.use("/static", staticFileLimiter, express.static(resolvedFrontendPath));
  app.get(/^\/(?!api|api-docs|static|openapi)(.*)/, frontendLimiter, (_req, res) => {
    res.sendFile(join(resolvedFrontendPath, "index.html"));
  });
} else {
  const expected = frontendCandidates.join(" | ");
  logger.warn(`[Frontend] 在任何候选路径中均未找到前端文件。已尝试：${expected}`);
  app.get("/index.html", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Happy-TTS API</title>
    <style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:40px;line-height:1.6}.card{max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 4px 14px rgba(0,0,0,.08)}h1{margin:0 0 12px;font-size:24px}a{color:#3b82f6;text-decoration:none}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}</style>
  </head>
  <body><div class="card"><h1>Happy-TTS 后端已启动</h1><p>未检测到前端构建文件。您仍可通过 Swagger 访问 API 文档：</p>
    <ul><li><a href="/api-docs">Swagger UI</a></li><li><a href="/api-docs.json">Swagger JSON</a></li></ul>
    <p>如果需要启用前端，请设置环境变量 <code>FRONTEND_DIST_DIR</code> 或将构建产物放到以下任一路径：<br/><small>${expected}</small></p>
  </div></body>
</html>`);
  });
}

// 文档加载超时上报
app.post("/api/report-docs-timeout", docsTimeoutLimiter, express.json(), (req, res) => {
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

// ========== IP 位置查询 ==========

const IP_DATA_FILE = "ip_data.txt";

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

// 服务器状态
const PASSWORD = process.env.SERVER_PASSWORD || "wmy";
app.post("/server_status", serverStatusLimiter, (req, res) => {
  const password = req.body.password;
  if (password === PASSWORD) {
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

// ========== 全局兜底中间件 ==========

// 全局默认限流
app.use(globalDefaultLimiter);

// JSON 解析错误处理
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

// 404 处理
app.use(notFoundLimiter, (req: Request, res: Response) => {
  logger.warn(`404 Not Found: ${req.method} ${req.url}`, {
    ip: req.ip,
    headers: req.headers,
    body: req.body,
  });
  res.status(404).json({ error: "Not Found" });
});

// ========== 常量与工具 ==========

const OPENAI_KEY = process.env.OPENAI_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const _openai = new OpenAI({ apiKey: OPENAI_KEY, baseURL: OPENAI_BASE_URL });

class RateLimiter {
  private calls: number[] = [];
  constructor(
    private maxCalls: number,
    private period: number,
  ) {}
  attempt(): boolean {
    const now = Date.now();
    this.calls = this.calls.filter((call) => call > now - this.period);
    if (this.calls.length < this.maxCalls) {
      this.calls.push(now);
      return true;
    }
    return false;
  }
}

const _ttsRateLimiter = new RateLimiter(5, 30000);

// 确保必要的目录存在
const ensureDirectories = async () => {
  const dirs = ["logs", "finish", "data"];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }
};

// 注册登出接口
registerLogoutRoute(app);

// 检查邮件API密钥
if (!process.env.RESEND_API_KEY) {
  (globalThis as any).EMAIL_ENABLED = false;
  (globalThis as any).EMAIL_SERVICE_STATUS = { available: false, error: "未配置 RESEND_API_KEY" };
  (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: "未配置 RESEND_API_KEY" };
  console.warn("[邮件服务] 未检测到 RESEND_API_KEY，邮件发送功能已禁用");
} else {
  (globalThis as any).EMAIL_ENABLED = true;
  (async () => {
    try {
      const { EmailService } = require("./services/emailService");
      (globalThis as any).EMAIL_SERVICE_STATUS = { available: true };
      logger.info("[邮件服务] 配置检查完成：已启用");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      (globalThis as any).EMAIL_SERVICE_STATUS = { available: false, error: errorMessage };
      logger.warn("[邮件服务] 配置检查失败：", errorMessage);
    }
  })();
  (async () => {
    try {
      const config = require("./config").default;
      if (!config.email?.outemail?.enabled) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: "对外邮件服务未启用" };
        logger.warn("[对外邮件服务] 服务未启用");
        return;
      }
      if (!config.email?.outemail?.domain) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: "对外邮件服务未配置域名" };
        logger.warn("[对外邮件服务] 未配置域名");
        return;
      }
      const key = config.email.outemail.apiKey;
      if (!key || !/^re_\w{8,}/.test(key)) {
        (globalThis as any).OUTEMAIL_SERVICE_STATUS = {
          available: false,
          error: "未配置有效的对外邮件API密钥（re_ 开头）",
        };
        logger.warn("[对外邮件服务] 未配置有效API密钥");
        return;
      }
      (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: true };
      logger.info("[对外邮件服务] 配置检查完成：已启用");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      (globalThis as any).OUTEMAIL_SERVICE_STATUS = { available: false, error: errorMessage };
      logger.warn("[对外邮件服务] 配置检查失败：", errorMessage);
    }
  })();
}

// ========== 启动服务器 ==========

if (process.env.NODE_ENV !== "test") {
  const PORT = config.port;
  const server = app.listen(Number(PORT), "::", async () => {
    await ensureDirectories();

    // 初始化 WebSocket 服务
    wsService.init(server);

    logger.info(`服务器运行在 http://[::]:${PORT} (IPv4/IPv6 双栈)`);
    logger.info(`生成音频目录: ${audioDir}`);
    logger.info(`当前生成码: ${config.generationCode}`);

    // 启动时检查文件权限
    try {
      let checkFilePermissions;
      const possiblePaths = [
        "../scripts/check-file-permissions.js",
        "../../scripts/check-file-permissions.js",
        "./scripts/check-file-permissions.js",
        path.join(process.cwd(), "scripts", "check-file-permissions.js"),
      ];
      for (const scriptPath of possiblePaths) {
        try {
          const scriptModule = require(scriptPath);
          checkFilePermissions = scriptModule.checkFilePermissions;
          if (checkFilePermissions) {
            logger.info(`[启动] 找到文件权限检查脚本: ${scriptPath}`);
            break;
          }
        } catch (_e) {
          /* continue */
        }
      }
      if (checkFilePermissions) {
        checkFilePermissions();
      } else {
        logger.warn("[启动] 未找到文件权限检查脚本，跳过检查");
      }
    } catch (error) {
      logger.warn("[启动] 文件权限检查失败，继续启动", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 初始化存储
    try {
      logger.info("[启动] 检查用户存储模式...");
      const storageMode = process.env.USER_STORAGE_MODE || "file";
      logger.info(`[启动] 当前存储模式: ${storageMode}`);

      if (storageMode === "mongo") {
        try {
          const { connectMongo } = require("./services/mongoService");
          await connectMongo();
          logger.info("[启动] MongoDB 连接成功");
          const initResult = await UserStorage.initializeDatabase();
          if (initResult.initialized) {
            logger.info(`[启动] ${initResult.message}`);
          } else {
            logger.error(`[启动] MongoDB 初始化失败: ${initResult.message}`);
          }
        } catch (error) {
          logger.warn("[启动] MongoDB 连接失败，建议切换到文件模式", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (storageMode === "mysql") {
        try {
          const { getMysqlConnection } = require("./utils/userStorage");
          const conn = await getMysqlConnection();
          await conn.execute("SELECT 1");
          await conn.end();
          logger.info("[启动] MySQL 连接成功");
          const initResult = await UserStorage.initializeDatabase();
          if (initResult.initialized) {
            logger.info(`[启动] ${initResult.message}`);
          } else {
            logger.error(`[启动] MySQL 初始化失败: ${initResult.message}`);
          }
        } catch (error) {
          logger.warn("[启动] MySQL 连接失败，建议切换到文件模式", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        try {
          const initResult = await UserStorage.initializeDatabase();
          if (initResult.initialized) {
            logger.info(`[启动] ${initResult.message}`);
          } else {
            logger.error(`[启动] 文件存储初始化失败: ${initResult.message}`);
          }
        } catch (error) {
          logger.error("[启动] 文件存储初始化失败", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      UserStorage.initializeMongoListener();

      try {
        schedulerService.start();
        logger.info("[启动] 定时任务服务已启动");
      } catch (error) {
        logger.warn("[启动] 定时任务服务启动失败，继续启动", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      logger.error("[启动] 数据库初始化和Passkey数据修复失败", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export default app;

// 禁止二次校验相关接口缓存
app.use(
  [
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
  ],
  (_req: any, res: any, next: any) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.removeHeader?.("ETag");
    next();
  },
);

// Passkey 错误处理
app.use(passkeyErrorHandler);

// --- MongoDB tts -> user_datas 自动迁移逻辑 ---
import { MongoClient } from "mongodb";

async function migrateTtsCollection() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.MONGO_DB || "tts";
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const ttsCol = db.collection("tts");
    const userDatasCol = db.collection("user_datas");
    const ttsCount = await ttsCol.countDocuments();
    if (ttsCount === 0) {
      logger.info("[迁移] tts 集合为空，无需迁移");
      return;
    }
    const userDatasCount = await userDatasCol.countDocuments();
    if (userDatasCount >= ttsCount) {
      logger.info("[迁移] user_datas 集合已包含全部数据，无需迁移");
      return;
    }
    const docs = await ttsCol.find().toArray();
    if (docs.length === 0) {
      console.log("[迁移] tts 集合无数据");
      return;
    }
    const bulk = userDatasCol.initializeUnorderedBulkOp();
    for (const doc of docs) {
      bulk.find({ _id: doc._id }).upsert().replaceOne(doc);
    }
    if (bulk.length > 0) {
      const result = await bulk.execute();
      const migratedCount = (result.upsertedCount || 0) + (result.modifiedCount || 0);
      console.log(`[迁移] 已迁移 ${migratedCount} 条数据到 user_datas`);
    }
    const afterCount = await userDatasCol.countDocuments();
    if (afterCount >= ttsCount) {
      await ttsCol.drop();
      console.log(`[迁移] 校验通过，已删除原 tts 集合。user_datas 总数: ${afterCount}`);
    } else {
      console.error(`[迁移] 校验失败，user_datas 数量(${afterCount}) < tts 数量(${ttsCount})，未删除原集合`);
    }
  } catch (err) {
    console.error("[迁移] 发生错误:", err);
  } finally {
    await client.close();
  }
}
migrateTtsCollection();
