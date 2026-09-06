// media-tool 独立本地入口:不依赖 Synapse 全量应用 / MongoDB,
// 用本地 JSON store + JSON settings,本地/可信鉴权,仅媒体工具 API。
//
// 启动:npm run media-tool:serve
// 环境变量:
//   MEDIA_TOOL_PORT   默认 4007        MEDIA_TOOL_HOST  默认 127.0.0.1
//   MEDIA_TOOL_KEY    设置后必须携带 X-Media-Tool-Key 请求头(否则本机直通)
//   MEDIA_TOOL_CORS   允许的来源(逗号分隔;默认全部,本地工具场景)
//   MEDIA_TOOL_DIR    状态/设置/上传根(默认 <cwd>/data/media-tool-standalone)
import crypto from "node:crypto";
import path from "node:path";
import cors from "cors";
import express, { type Request, type RequestHandler } from "express";
import { createMediaToolRouter } from "./http/mediaToolHttp";
import { createJsonMediaJobStore } from "./jobs/mediaJobStore";
import { MediaJobRunner } from "./jobs/mediaJobRunner";
import { ensureDir, resolveRootDir } from "./runtime";
import { createJsonMediaSettingsStore } from "./settingsStore";

const port = parseInt(process.env.MEDIA_TOOL_PORT || "4007", 10) || 4007;
const host = process.env.MEDIA_TOOL_HOST || "127.0.0.1";
const toolKey = (process.env.MEDIA_TOOL_KEY || "").trim();
const dataDir = path.resolve(process.env.MEDIA_TOOL_DIR || path.join(process.cwd(), "data", "media-tool-standalone"));
const corsOrigins = (process.env.MEDIA_TOOL_CORS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

ensureDir(dataDir);

const jobStore = createJsonMediaJobStore(path.join(dataDir, "jobs.json"));
const settingsStore = createJsonMediaSettingsStore(path.join(dataDir, "settings.json"));
const runner = new MediaJobRunner(
  { store: jobStore, getSettings: () => settingsStore.get(), mode: "standalone" },
  2,
);

const pass: RequestHandler = (_req: Request, _res, next) => next();

// key 鉴权:设定 MEDIA_TOOL_KEY 后,所有 media-tool 请求必须携带正确密钥
const keyGuard: RequestHandler = (req: Request, res, next) => {
  if (!toolKey) {
    next();
    return;
  }
  const supplied = String(req.header("x-media-tool-key") || "");
  const a = Buffer.from(toolKey);
  const b = Buffer.from(supplied);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    res.status(401).json({ ok: false, error: "X-Media-Tool-Key 缺失或错误" });
    return;
  }
  next();
};

const app = express();
app.disable("x-powered-by");
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || corsOrigins.length === 0 || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
  }),
);
app.use(express.json({ limit: "3mb" }));

app.get("/", (_req: Request, res) => {
  res.json({ ok: true, name: "synapse-media-tool", path: "/api/admin/media-tool", mode: "standalone" });
});

const mediaRouter = createMediaToolRouter({
  mode: "standalone",
  store: jobStore,
  settingsStore,
  runner,
  requireAdmin: pass,
  requireSuper: pass,
  identity: (req: Request) => String(req.header("x-media-tool-user") || "local"),
});

app.use("/api/admin/media-tool", keyGuard, mediaRouter);

// 启动自恢复:残留 running 标失败,残留 queued 重新入队
setTimeout(() => {
  jobStore
    .list(200)
    .then((records) => {
      for (const r of records) {
        if (r.status === "running") {
          void jobStore.patch(r.id, { status: "failed", error: "服务重启,任务被中断(可重试)", finishedAt: Date.now() });
        } else if (r.status === "queued" && !r.cancelRequested) {
          runner.enqueue(r.id);
        }
      }
    })
    .catch(() => undefined);
}, 1500);

const server = app.listen(port, host, () => {
  const root = resolveRootDir("");
  console.log(`[media-tool] 独立入口已启动: http://${host}:${port}`);
  console.log(`[media-tool] API 前缀  : http://${host}:${port}/api/admin/media-tool`);
  console.log(`[media-tool] 数据目录  : ${dataDir}`);
  console.log(`[media-tool] 默认工作目录(可在设置页修改): ${root}`);
  if (toolKey) console.log("[media-tool] 鉴权      : 已启用 X-Media-Tool-Key");
  else console.log("[media-tool] 鉴权      : 无(仅建议绑定 127.0.0.1 使用)");
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
