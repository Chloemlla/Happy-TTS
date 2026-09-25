// media-tool HTTP 路由构建器:server 态挂到 /api/admin/media-tool(带 JWT 守卫),
// standalone 态由独立入口以本地/可信守卫复用同一份路由定义,保证两端点完全一致。
import crypto from "node:crypto";
import express, { type Request, type RequestHandler, type Response } from "express";
import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import { purgeJobArtifacts } from "../jobs/artifactCleanup";
import { MediaJobRunner } from "../jobs/mediaJobRunner";
import { MEDIA_EXTS, ensureDir, isAudioFile, relInsideRoot, resolveRootDir, resolveYtDlpBin, runTool, sanitizeFileName, statOrNull } from "../runtime";
import { maskedView, type MediaSettingsPatch, type MediaSettingsStore } from "../settingsStore";
import { normalizeTranscribeOutputs } from "../types";
import { readSegments } from "../vivoLasr";
import type { MediaJobRecord, MediaJobStatus } from "../types";
import type { MediaJobStore } from "../jobs/mediaJobStore";
import type { TranscriptStore } from "../jobs/transcriptStore";

const TEXT_EXTS = new Set([".txt", ".srt", ".json", ".vtt"]);
const JOB_KINDS = ["bili-download", "transcribe"] as const;
const TERMINAL: MediaJobStatus[] = ["succeeded", "failed", "cancelled"];

export interface MediaToolRouterDeps {
  mode: string;
  store: MediaJobStore;
  transcripts: TranscriptStore;
  settingsStore: MediaSettingsStore;
  runner: MediaJobRunner;
  /** 守卫(内部态 = authenticateAdmin;standalone 态 = 直通)。每个请求会被调用。 */
  requireAdmin: RequestHandler;
  /** superadmin 守卫(内部态 = authenticateSuperAdmin;standalone 态 = 直通)。 */
  requireSuper: RequestHandler;
  identity(req: Request): string;
}

function genId(): string {
  return `mt-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

export function createMediaToolRouter(deps: MediaToolRouterDeps): express.Router {
  const { store, transcripts, settingsStore, runner, requireAdmin, requireSuper, identity } = deps;
  const router = express.Router();

  // 所有端点先过 admin 守卫
  router.use(requireAdmin);

  // ---- 健康检查 / 设置 ----
  // codeql[js/missing-rate-limiting] media-tool admin subtree rate-limited at mount (/api/admin/media-tool adminLimiter via postTamperModules); in-router copy would split quota
  router.get("/health", async (_req: Request, res: Response) => {
    try {
      const settings = await settingsStore.get();
      const root = resolveRootDir(settings.workDir);
      try {
        ensureDir(root);
      } catch {
        /* 下面 writable 探测会给结论 */
      }
      const ytRes = runTool(resolveYtDlpBin(settings.bili.ytDlpPath), ["--version"], { maxBuffer: 1024 * 1024 });
      const ffRes = runTool("ffprobe", ["-version"], { maxBuffer: 1024 * 1024 });
      res.json({
        ok: true,
        mode: deps.mode,
        timestamp: Date.now(),
        settings: maskedView(settings),
        runtime: {
          workDir: root,
          workDirWritable: (() => {
            try {
              const probe = path.join(root, `.probe-${process.pid}`);
              fs.writeFileSync(probe, "1");
              fs.unlinkSync(probe);
              return true;
            } catch {
              return false;
            }
          })(),
          ytDlp: ytRes.status === 0 ? { ok: true, version: ytRes.stdout.trim().split("\n")[0] || null } : { ok: false, hint: (ytRes.stderr || ytRes.stdout || "无法启动").slice(0, 200) },
          ffprobe: ffRes.status === 0 ? { ok: true } : { ok: false, hint: "PATH 中未找到 ffprobe,音频时长取不到(不影响转写,服务器可能自动测) " },
          cookies: settings.bili.cookiesFile ? { ok: fs.existsSync(settings.bili.cookiesFile), path: settings.bili.cookiesFile } : { ok: true, path: null },
          lasrConfigured: Boolean(settings.lasr.appId && settings.lasr.appKey && settings.lasr.serverUrl),
          queuedJobs: runner.getQueuedCount(),
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.get("/settings", async (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, settings: maskedView(await settingsStore.get()) });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.put("/settings", requireSuper, async (req: Request, res: Response) => {
    try {
      const patch = (req.body ?? {}) as MediaSettingsPatch;
      const next = await settingsStore.update(patch);
      res.json({ ok: true, settings: maskedView(next) });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // ---- 文件浏览 / 内容 / 下载 / 上传 ----
  // codeql[js/missing-rate-limiting] media-tool admin subtree rate-limited at mount (/api/admin/media-tool adminLimiter via postTamperModules); in-router copy would split quota
  router.get("/files", async (req: Request, res: Response) => {
    try {
      const settings = await settingsStore.get();
      const root = resolveRootDir(settings.workDir);
      const sub = relInsideRoot(root, String(req.query.sub || ""));
      const dir = sub === null ? root : path.join(root, sub);
      const entries: Array<{ name: string; rel: string; dir: boolean; size: number; audio: boolean; text: boolean; media: boolean; mtime: number }> = [];
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        res.json({ ok: true, sub: sub ?? "", entries: [] });
        return;
      }
      for (const ent of dirents) {
        const name = ent.name;
        if (name.startsWith(".")) continue;
        const rel = sub ? `${sub}/${name}` : name;
        const abs = path.join(dir, name);
        if (ent.isDirectory()) {
          entries.push({ name, rel, dir: true, size: 0, audio: false, text: false, media: false, mtime: 0 });
        } else {
          const ext = path.extname(name).toLowerCase();
          const st = statOrNull(abs);
          entries.push({
            name,
            rel,
            dir: false,
            size: st?.size ?? 0,
            audio: isAudioFile(name),
            text: TEXT_EXTS.has(ext),
            media: MEDIA_EXTS.has(ext),
            mtime: st?.mtimeMs ?? 0,
          });
        }
      }
      entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, "zh"));
      res.json({ ok: true, sub: sub ?? "", entries });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  const resolveFile = async (req: Request, res: Response): Promise<string | null> => {
    const settings = await settingsStore.get();
    const root = resolveRootDir(settings.workDir);
    const rel = relInsideRoot(root, String(req.query.rel || ""));
    if (rel === null) {
      res.status(400).json({ ok: false, error: "非法相对路径" });
      return null;
    }
    const abs = path.join(root, rel);
    const st = statOrNull(abs);
    if (!st || !st.isFile()) {
      res.status(404).json({ ok: false, error: "文件不存在" });
      return null;
    }
    return abs;
  };

  // codeql[js/missing-rate-limiting] media-tool admin subtree rate-limited at mount (/api/admin/media-tool adminLimiter via postTamperModules); in-router copy would split quota
  router.get("/files/content", async (req: Request, res: Response) => {
    const abs = await resolveFile(req, res);
    if (!abs) return;
    const ext = path.extname(abs).toLowerCase();
    if (TEXT_EXTS.has(ext)) {
      res.type("text/plain; charset=utf-8").send(fs.readFileSync(abs, "utf8"));
    } else {
      res.sendFile(abs);
    }
  });

  // codeql[js/missing-rate-limiting] media-tool admin subtree rate-limited at mount (/api/admin/media-tool adminLimiter via postTamperModules); in-router copy would split quota
  router.get("/files/download", async (req: Request, res: Response) => {
    const abs = await resolveFile(req, res);
    if (!abs) return;
    res.download(abs, path.basename(abs));
  });

  // 上传落点 = workDir/inbox,每个请求按当前设置构造 multer
  // codeql[js/missing-rate-limiting] media-tool admin subtree rate-limited at mount (/api/admin/media-tool adminLimiter via postTamperModules); in-router copy would split quota
  router.post("/upload", async (req: Request, res: Response) => {
    if (!/multipart\/form-data/i.test(String(req.headers["content-type"] || ""))) {
      res.status(415).json({ ok: false, error: "未收到文件:请求需以 multipart/form-data 提交(field 名 file)，当前 Content-Type=" + (req.headers["content-type"] || "缺失") });
      return;
    }
    let inbox: string;
    try {
      const settings = await settingsStore.get();
      const root = resolveRootDir(settings.workDir);
      inbox = path.join(root, "inbox");
      ensureDir(inbox);
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
      return;
    }
    const upload = multer({
      storage: multer.diskStorage({
        destination: (_r, _f, cb) => cb(null, inbox),
        filename: (_r, file, cb) => {
          const orig = sanitizeFileName(file.originalname);
          cb(null, `${Date.now()}-${orig}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!isAudioFile(file.originalname)) {
          cb(new Error("仅支持音频文件"));
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 400 * 1024 * 1024, files: 1 },
    }).single("file");
    try {
      await new Promise<void>((resolve, reject) => {
        upload(req, res, (err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      const isLimit = code === "LIMIT_FILE_SIZE";
      res.status(isLimit ? 413 : 400).json({ ok: false, error: isLimit ? "文件超过大小上限" : (err as Error).message });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ ok: false, error: "未收到文件:multipart 里没有名为 file 的部分(Content-Type=" + (req.headers["content-type"] || "缺失") + ")" });
      return;
    }
    const rel = `inbox/${path.basename(file.path)}`;
    const st = statOrNull(file.path);
    res.json({ ok: true, upload: { rel, size: st?.size ?? 0, name: file.filename } });
  });

  // ---- Job 管理 ----
  const readJob = async (raw: string | string[] | undefined): Promise<MediaJobRecord | null> => {
    const id = Array.isArray(raw) ? raw[0] : raw;
    return id ? store.get(id) : null;
  };

  router.post("/jobs", async (req: Request, res: Response) => {
    try {
      const settings = await settingsStore.get();
      const root = resolveRootDir(settings.workDir);
      const body = (req.body ?? {}) as {
        kind?: string;
        urls?: string[];
        files?: string[];
        mode?: "audio" | "video";
        audioFormat?: string;
        transcribeAfter?: boolean;
        saveSrt?: boolean;
        outputs?: string[];
      };
      const kind = body.kind;
      if (!JOB_KINDS.includes(kind as (typeof JOB_KINDS)[number])) {
        res.status(400).json({ ok: false, error: "kind 必须是 bili-download 或 transcribe" });
        return;
      }
      const record: MediaJobRecord = {
        id: genId(),
        kind: kind as MediaJobRecord["kind"],
        mode: deps.mode,
        createdBy: identity(req),
        createdAt: Date.now(),
        status: "queued",
        stage: "queued",
        progress: 0,
        input: { type: "urls", values: [] },
        logs: [],
        cancelRequested: false,
      };

      if (kind === "bili-download") {
        const urls = (body.urls ?? []).map((u) => String(u).trim()).filter(Boolean);
        if (urls.length === 0) {
          res.status(400).json({ ok: false, error: "请提供至少一个 B 站链接/BV 号" });
          return;
        }
        record.input = { type: "urls", values: urls };
        record.params = {
          mode: body.mode,
          audioFormat: body.audioFormat,
          transcribeAfter: body.transcribeAfter,
          saveSrt: body.saveSrt,
          outputs: normalizeTranscribeOutputs(body.outputs, settings.lasr.outputs),
          urls,
        };
      } else {
        const files = (body.files ?? []).map((f) => String(f).trim()).filter(Boolean);
        if (files.length === 0) {
          res.status(400).json({ ok: false, error: "请选择至少一个音频文件" });
          return;
        }
        const checked: string[] = [];
        for (const rel of files) {
          const clean = relInsideRoot(root, rel);
          if (clean === null) {
            res.status(400).json({ ok: false, error: `非法文件路径: ${rel}` });
            return;
          }
          const st = statOrNull(path.join(root, clean));
          if (!st || !st.isFile()) {
            res.status(400).json({ ok: false, error: `文件不存在: ${clean}` });
            return;
          }
          if (!isAudioFile(clean)) {
            res.status(400).json({ ok: false, error: `非音频文件: ${clean}` });
            return;
          }
          checked.push(clean);
        }
        record.input = { type: "paths", values: checked };
        record.params = { saveSrt: body.saveSrt, outputs: normalizeTranscribeOutputs(body.outputs, settings.lasr.outputs) };
      }
      await store.create(record);
      runner.enqueue(record.id);
      res.json({ ok: true, job: record });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.get("/jobs", async (req: Request, res: Response) => {
    try {
      const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || "30"), 10) || 30, 100));
      const records = await store.list(limit);
      // 列表轻量化:日志只留尾巴,详情由 /jobs/:id 取全量
      const light = records.map((r) => ({ ...r, logs: r.logs.slice(-60) }));
      res.json({ ok: true, jobs: light });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.get("/jobs/:id", async (req: Request, res: Response) => {
    try {
      const job = await readJob(req.params.id);
      if (!job) {
        res.status(404).json({ ok: false, error: "任务不存在" });
        return;
      }
      // 管理端详情同样带分段:有时间线/纯文本两种视图直接靠它渲染
      const settings = await settingsStore.get();
      const root = resolveRootDir(settings.workDir);
      // 正文优先读库(磁盘被清/换盘后仍可读),磁盘只作回退;两边都没有就明确标出来
      const stored = await transcripts.listByJob(job.id);
      const storedByIndex = new Map(stored.map((row) => [row.index, row]));
      const transcriptsPayload = (job.result?.items ?? []).map((item, index) => {
        const row = storedByIndex.get(index);
        const diskSegments = item.jsonFile ? readSegments(path.resolve(root, String(item.jsonFile))) : null;
        const segments = row?.segments ?? diskSegments;
        // 只有"应该带正文的转写项"才会有 missing 一说:纯下载项本来就没有正文
        const isTranscript = Boolean(item.jsonFile);
        return {
          index,
          label: item.label,
          ok: item.ok,
          error: item.error,
          durationSec: item.durationSec ?? 0,
          segmentCount: segments?.length ?? 0,
          segments: segments ?? [],
          source: row ? "db" : segments ? "disk" : isTranscript ? "missing" : "none",
          contentMissing: isTranscript && Boolean(item.ok) && !segments,
          files: { txt: item.txtFile ?? null, timed: item.timedFile ?? null, srt: item.srtFile ?? null, json: item.jsonFile ?? null },
        };
      });
      res.json({ ok: true, job, transcripts: transcriptsPayload });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.post("/jobs/:id/cancel", async (req: Request, res: Response) => {
    try {
      const job = await readJob(req.params.id);
      if (!job) {
        res.status(404).json({ ok: false, error: "任务不存在" });
        return;
      }
      if (TERMINAL.includes(job.status)) {
        res.json({ ok: true, job });
        return;
      }
      await runner.cancel(job.id);
      // 队列里的任务会由 runJob 自己落成 cancelled;本进程已没有执行体的(如历史遗留的
      // "运行中"僵尸)没人会再写它的状态,这里直接落终态,否则永远取消不掉。
      if (!runner.isActive(job.id)) {
        await store.patch(job.id, { status: "cancelled", finishedAt: Date.now() });
      }
      res.json({ ok: true, job: (await readJob(job.id)) ?? job });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.post("/jobs/:id/retry", async (req: Request, res: Response) => {
    try {
      const job = await readJob(req.params.id);
      if (!job) {
        res.status(404).json({ ok: false, error: "任务不存在" });
        return;
      }
      if (!TERMINAL.includes(job.status)) {
        res.status(409).json({ ok: false, error: "仅已完成/失败/已取消的任务可重试" });
        return;
      }
      await store.patch(job.id, {
        status: "queued",
        stage: "queued",
        progress: 0,
        cancelRequested: false,
        startedAt: undefined,
        finishedAt: undefined,
        error: undefined,
        result: undefined,
        logs: [...job.logs, { t: Date.now(), text: "—— 重试 ——" }],
      });
      runner.enqueue(job.id);
      res.json({ ok: true, job: (await readJob(job.id)) ?? job });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.delete("/jobs/:id", requireSuper, async (req: Request, res: Response) => {
    try {
      const job = await readJob(req.params.id);
      if (!job) {
        res.status(404).json({ ok: false, error: "任务不存在" });
        return;
      }
      if (job.status === "running") {
        res.status(409).json({ ok: false, error: "任务运行中,请先取消再删除" });
        return;
      }
      // 正文与产物一起清:留着正文却删了任务只会变成孤儿数据
      const settings = await settingsStore.get();
      const removedFiles = purgeJobArtifacts(job, resolveRootDir(settings.workDir));
      await transcripts.removeByJob(job.id);
      await store.remove(job.id);
      res.json({ ok: true, removedFiles });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
