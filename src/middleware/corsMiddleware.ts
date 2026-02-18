import cors from "cors";
import type { NextFunction, Request, Response } from "express";

// 允许的域名
const allowedOrigins = [
  "https://tts.hapx.one",
  "https://tts.hapxs.com",
  "https://951100.xyz",
  "https://tts.951100.xyz",
  "https://api.hapxs.com",
  ...(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "dev"
    ? [
        "http://192.168.10.7:3001",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:6000",
        "http://localhost:6001",
        "http://localhost:3002",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:6000",
        "http://127.0.0.1:6001",
        "http://192.168.137.1:3001",
        "http://192.168.137.1:6000",
        "http://192.168.137.1:6001",
        "http://192.168.10.7:6000",
        "http://192.168.10.7:6001",
      ]
    : []),
];

const CORS_METHODS = "GET, POST, PUT, DELETE, OPTIONS, PATCH";
const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "Accept",
  "Origin",
  "Access-Control-Request-Method",
  "Access-Control-Request-Headers",
  "Cache-Control",
  "X-Fingerprint",
  "X-Turnstile-Token",
];
const CORS_EXPOSED_HEADERS = [
  "Content-Length",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "Content-Disposition",
  "Content-Type",
  "Cache-Control",
];

/** 判断 origin 是否在白名单内（含 *.hapxs.com 通配） */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // 无 origin（curl/postman）放行
  if (/^https:\/\/([a-zA-Z0-9-]+\.)*hapxs\.com$/.test(origin)) return true;
  return allowedOrigins.includes(origin);
}

// ============ 全局 CORS 中间件（挂到 app.use） ============
export const globalCors = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: CORS_METHODS.split(", "),
  allowedHeaders: CORS_ALLOWED_HEADERS,
  exposedHeaders: CORS_EXPOSED_HEADERS,
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 200,
});

// ============ 路由级 CORS：基于白名单 ============
/** OPTIONS 预检处理器（用于 /s/*、/api/shorturl/* 等需要单独挂 OPTIONS 的路径） */
export function corsPreflightHandler(req: Request, res: Response) {
  const origin = req.headers.origin;
  res.header("Access-Control-Allow-Origin", isOriginAllowed(origin) ? origin || "*" : "");
  res.header("Access-Control-Allow-Methods", CORS_METHODS);
  res.header("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS.join(", "));
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Max-Age", "86400");
  res.status(200).end();
}

/** 普通请求 CORS 响应头中间件（非 OPTIONS） */
export function corsHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  res.header("Access-Control-Allow-Origin", isOriginAllowed(origin) ? origin || "*" : "");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Expose-Headers", CORS_EXPOSED_HEADERS.join(", "));
  next();
}

// ============ 路由级 CORS：完全开放（origin: *） ============
export function openCorsPreflightHandler(req: Request, res: Response) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", CORS_METHODS);
  res.header("Access-Control-Allow-Headers", CORS_ALLOWED_HEADERS.join(", "));
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Max-Age", "86400");
  res.status(200).end();
}

export function openCorsHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Expose-Headers", CORS_EXPOSED_HEADERS.join(", "));
  next();
}

export { allowedOrigins };
