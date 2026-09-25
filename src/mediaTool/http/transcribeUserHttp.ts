// 「语音转文本」用户态 HTTP 路由:普通登录用户可用,与 admin 媒体工具共用同一套
// store / settings / runner(serverRuntime.ts),但作用域锁死在 <workDir>/users/<uid>/。
//
// 与 admin 路由的三点差异:
//   1) 守卫是登录态(authenticateToken 在挂载层),不是 authenticateAdmin;
//   2) 对外路径一律是相对「用户自己根目录」的相对路径(inbox/x.m4a),绝不暴露 uid 目录;
//      写进 job 记录的 input.values / 结果项则相对 workDir 根(runner 按该根解析);
//   3) 任务列表、详情、下载都按 scope=user + ownerId 复核归属,越界一律 404。
import crypto from "node:crypto";
import express, { type Request, type Response } from "express";
import fs from "node:fs";
import multer from "multer";
import path from "node:path";
import {
  AUDIO_EXTS,
  ensureDir,
  isAudioFile,
  relInside,
  relInsideRoot,
  resolveRootDir,
  sanitizeFileName,
  statOrNull,
  userScopedDirName,
} from "../runtime";
import { purgeJobArtifacts } from "../jobs/artifactCleanup";
import type { MediaJobRunner } from "../jobs/mediaJobRunner";
import type { MediaJobStore } from "../jobs/mediaJobStore";
import type { TranscriptStore } from "../jobs/transcriptStore";
import type { MediaSettingsStore } from "../settingsStore";
import type { MediaJobRecord, TranscribeOutput } from "../types";
import { TRANSCRIBE_OUTPUTS, normalizeTranscribeOutputs } from "../types";
import { readSegments } from "../vivoLasr";

export interface TranscribeUserRouterDeps {
  store: MediaJobStore;
  transcripts: TranscriptStore;
  settingsStore: MediaSettingsStore;
  runner: MediaJobRunner;
  /** 挂载层已保证登录;返回 null 视为未登录(防御直挂场景)。 */
  resolveUser(req: Request): { id: string; username: string } | null;
}

function genJobId(): string {
  return `st-${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`;
}

export function createTranscribeUserRouter(deps: TranscribeUserRouterDeps): express.Router {
  const { store, transcripts, settingsStore, runner } = deps;
  const router = express.Router();

  interface Ctx {
    user: { id: string; username: string };
    settings: Awaited<ReturnType<MediaSettingsStore["get"]>>;
    /** 媒体工具工作根目录(= runner 解析 input.values 的根) */
    workRoot: string;
    /** 当前用户专属根目录 */
    userRoot: string;
    /** 对外(相对 userRoot)→ 绝对路径;越界 null */
    resolveUserPath(rel: string): string | null;
    /** 绝对路径 → 对外相对路径(相对 userRoot);不在用户目录内 null */
    toApiRel(abs: string): string | null;
    /** 绝对路径 → job 记录用的相对 workRoot 路径;不在用户目录内 null */
    toStoreRel(abs: string): string | null;
  }

  const ctx = async (req: Request, res: Response): Promise<Ctx | null> => {
    const user = deps.resolveUser(req);
    if (!user) {
      res.status(401).json({ ok: false, error: "未登录" });
      return null;
    }
    const settings = await settingsStore.get();
    const workRoot = resolveRootDir(settings.workDir);
    const userRoot = path.join(workRoot, "users", userScopedDirName(user.id));
    ensureDir(userRoot);
    const resolveUserPath = (rel: string): string | null => {
      const clean = relInsideRoot(userRoot, rel);
      return clean === null ? null : path.join(userRoot, clean);
    };
    return {
      user,
      settings,
      workRoot,
      userRoot,
      resolveUserPath,
      toApiRel: (abs: string) => relInside(userRoot, abs),
      toStoreRel: (abs: string) => (relInside(userRoot, abs) === null ? null : relInside(workRoot, abs)),
    };
  };

  /** 该用户当前排队/运行的任务数(用于每用户并发限额)。 */
  const activeJobCount = async (c: Ctx): Promise<number> => {
    const mine = await store.list(200, { scope: "user", ownerId: c.user.id });
    return mine.filter((j) => j.status === "queued" || j.status === "running").length;
  };

  // ---- 能力与限额(页面初始化) ----
  // codeql[js/missing-rate-limiting] /api/transcribe 整棵在挂载层过 transcribeLimiter(authRead 档 240/5min);路由器内重复挂会分走配额
  router.get("/config", async (req: Request, res: Response) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const active = await activeJobCount(c);
      res.json({
        ok: true,
        enabled: c.settings.enabled && c.settings.user.enabled,
        notice: !c.settings.enabled
          ? "媒体工具已停用,转写暂时不可用"
          : !c.settings.user.enabled
            ? "语音转文本用户入口已被管理员关闭"
            : null,
        limits: {
          maxFilesPerJob: c.settings.user.maxFilesPerJob,
          maxActiveJobs: c.settings.user.maxActiveJobs,
          activeJobs: active,
          maxUploadBytes: Math.min(c.settings.maxUploadBytes, c.settings.lasr.maxFileSizeBytes),
          maxFileSizeBytes: c.settings.lasr.maxFileSizeBytes,
          acceptedExts: [...AUDIO_EXTS].sort(),
          outputs: TRANSCRIBE_OUTPUTS,
          defaultOutputs: c.settings.lasr.outputs,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // ---- 上传到用户目录 inbox ----
  // codeql[js/missing-rate-limiting] 同上:挂载层 transcribeLimiter 已覆盖整棵子树
  router.post("/upload", async (req: Request, res: Response) => {
    if (!/multipart\/form-data/i.test(String(req.headers["content-type"] || ""))) {
      res.status(415).json({ ok: false, error: "未收到文件:请求需以 multipart/form-data 提交(field 名 file)，当前 Content-Type=" + (req.headers["content-type"] || "缺失") });
      return;
    }
    let inbox: string;
    let limitBytes: number;
    let toApiRel: (abs: string) => string | null;
    try {
      const c = await ctx(req, res);
      if (!c) return;
      if (!c.settings.enabled || !c.settings.user.enabled) {
        res.status(403).json({ ok: false, error: "语音转文本当前不可用" });
        return;
      }
      inbox = path.join(c.userRoot, "inbox");
      ensureDir(inbox);
      limitBytes = Math.min(c.settings.maxUploadBytes, c.settings.lasr.maxFileSizeBytes);
      toApiRel = c.toApiRel;
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
      return;
    }

    const upload = multer({
      storage: multer.diskStorage({
        destination: (_r, _f, cb) => cb(null, inbox),
        filename: (_r, file, cb) => cb(null, `${Date.now()}-${sanitizeFileName(file.originalname)}`),
      }),
      fileFilter: (_req, file, cb) => {
        if (!isAudioFile(file.originalname)) {
          cb(new Error("仅支持音频文件"));
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: limitBytes, files: 1 },
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
    const st = statOrNull(file.path);
    res.json({
      ok: true,
      upload: { rel: toApiRel(file.path) ?? path.basename(file.path), size: st?.size ?? 0, name: path.basename(file.path) },
    });
  });

  // ---- 浏览自己的目录(只列一层;任务记录里的路径也按此约定回填) ----
  // codeql[js/missing-rate-limiting] 同上:挂载层 transcribeLimiter 已覆盖整棵子树
  router.get("/files", async (req: Request, res: Response) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const sub = String(req.query.sub || "");
      const dir = sub ? c.resolveUserPath(sub) : c.userRoot;
      if (!dir) {
        res.status(400).json({ ok: false, error: "非法目录路径" });
        return;
      }
      let names: string[];
      try {
        names = fs.readdirSync(dir);
      } catch {
        res.json({ ok: true, sub, entries: [] });
        return;
      }
      const entries = names
        .filter((name) => !name.startsWith(".") && !name.endsWith(".transcribe.json"))
        .map((name) => {
          const abs = path.join(dir, name);
          const st = statOrNull(abs);
          return {
            name,
            rel: sub ? `${sub}/${name}` : name,
            dir: st?.isDirectory() ?? false,
            size: st?.isFile() ? st.size : 0,
            audio: isAudioFile(name),
            mtime: st?.mtimeMs ?? 0,
          };
        })
        .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, "zh"));
      res.json({ ok: true, sub, entries });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // ---- 建任务 ----
  // codeql[js/missing-rate-limiting] 同上:挂载层 transcribeLimiter 已覆盖整棵子树
  router.post("/jobs", async (req: Request, res: Response) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      if (!c.settings.enabled || !c.settings.user.enabled) {
        res.status(403).json({ ok: false, error: "语音转文本当前不可用" });
        return;
      }
      const body = (req.body ?? {}) as { files?: unknown; outputs?: unknown };
      const requested = (Array.isArray(body.files) ? body.files : []).map((f) => String(f).trim()).filter(Boolean);
      if (requested.length === 0) {
        res.status(400).json({ ok: false, error: "请至少选择一个音频文件" });
        return;
      }
      if (requested.length > c.settings.user.maxFilesPerJob) {
        res.status(400).json({ ok: false, error: `单次最多 ${c.settings.user.maxFilesPerJob} 个文件` });
        return;
      }
      const active = await activeJobCount(c);
      if (active >= c.settings.user.maxActiveJobs) {
        res.status(429).json({ ok: false, error: `已有 ${active} 个任务在排队或运行,请等待完成后再提交` });
        return;
      }

      const checked: string[] = [];
      for (const rel of requested) {
        const abs = c.resolveUserPath(rel);
        if (!abs) {
          res.status(400).json({ ok: false, error: `非法文件路径: ${rel}` });
          return;
        }
        const st = statOrNull(abs);
        if (!st || !st.isFile() || !isAudioFile(abs)) {
          res.status(400).json({ ok: false, error: `文件不存在或非音频: ${rel}` });
          return;
        }
        if (st.size > c.settings.lasr.maxFileSizeBytes) {
          res.status(400).json({ ok: false, error: `文件超过 ${Math.round(c.settings.lasr.maxFileSizeBytes / 1024 / 1024)}MB 上限` });
          return;
        }
        const storeRel = c.toStoreRel(abs);
        if (!storeRel) {
          res.status(400).json({ ok: false, error: `文件路径越界: ${rel}` });
          return;
        }
        checked.push(storeRel);
      }

      const outputs = normalizeTranscribeOutputs(body.outputs, c.settings.lasr.outputs) as TranscribeOutput[];
      const record: MediaJobRecord = {
        id: genJobId(),
        kind: "transcribe",
        mode: "server",
        scope: "user",
        ownerId: c.user.id,
        createdBy: c.user.username || c.user.id,
        createdAt: Date.now(),
        status: "queued",
        stage: "queued",
        progress: 0,
        input: { type: "paths", values: checked },
        params: { outputs },
        logs: [],
        cancelRequested: false,
      };
      await store.create(record);
      runner.enqueue(record.id);
      res.json({ ok: true, job: record });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // ---- 任务列表 / 归属复核 ----
  // codeql[js/missing-rate-limiting] 同上:挂载层 transcribeLimiter 已覆盖整棵子树
  router.get("/jobs", async (req: Request, res: Response) => {
    try {
      const c = await ctx(req, res);
      if (!c) return;
      const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || "20"), 10) || 20, 50));
      const jobs = await store.list(limit, { scope: "user", ownerId: c.user.id });
      res.json({ ok: true, jobs: jobs.map((j) => ({ ...j, logs: j.logs.slice(-20) })) });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  const ownJob = async (req: Request, res: Response) => {
    const c = await ctx(req, res);
    if (!c) return null;
    const id = String(req.params.id ?? "").trim();
    const job = id ? await store.get(id) : null;
    if (!job || job.scope !== "user" || job.ownerId !== c.user.id) {
      res.status(404).json({ ok: false, error: "任务不存在" });
      return null;
    }
    return { ...c, job };
  };

  /** 详情带分段:有时间线视图与纯文本视图都从这一个接口取(workRoot 相对路径回传给前端)。 */
  router.get("/jobs/:id", async (req: Request, res: Response) => {
    try {
      const found = await ownJob(req, res);
      if (!found) return;
      const { job, workRoot, userRoot } = found;
      const items = job.result?.items ?? [];
      // job 里的产物路径相对 workRoot;对外回传与读取都先验它仍在该用户目录内
      const userRel = (rel?: string): string | null => {
        if (!rel) return null;
        const abs = path.resolve(workRoot, String(rel));
        return relInside(userRoot, abs);
      };
      const userAbs = (rel?: string): string | null => {
        if (!rel) return null;
        const abs = path.resolve(workRoot, String(rel));
        return relInside(userRoot, abs) === null ? null : abs;
      };
      // 正文优先读库(磁盘被清/换盘后仍可读),磁盘只作回退;两边都没有就明确标出来
      const stored = await transcripts.listByJob(job.id);
      const storedByIndex = new Map(stored.map((row) => [row.index, row]));
      const transcriptsPayload = items.map((item, index) => {
        const row = storedByIndex.get(index);
        const jsonAbs = userAbs(item.jsonFile);
        const diskSegments = jsonAbs ? readSegments(jsonAbs) : null;
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
          files: {
            audio: userRel(item.file),
            txt: userRel(item.txtFile),
            timed: userRel(item.timedFile),
            srt: userRel(item.srtFile),
            json: userRel(item.jsonFile),
          },
        };
      });
      res.json({ ok: true, job, transcripts: transcriptsPayload });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.post("/jobs/:id/cancel", async (req: Request, res: Response) => {
    try {
      const found = await ownJob(req, res);
      if (!found) return;
      const { job } = found;
      if (["succeeded", "failed", "cancelled"].includes(job.status)) {
        res.json({ ok: true, job });
        return;
      }
      await runner.cancel(job.id);
      // 队列里的任务会由 runJob 自己落成 cancelled;本进程已没有执行体的(如历史遗留的
      // "运行中"僵尸)没人会再写它的状态,这里直接落终态,否则永远取消不掉。
      if (!runner.isActive(job.id)) {
        await store.patch(job.id, { status: "cancelled", finishedAt: Date.now() });
      }
      res.json({ ok: true, job: (await store.get(job.id)) ?? job });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // 重试沿用 sidecar 会话:已上传分片不重传,只补跑后续阶段
  router.post("/jobs/:id/retry", async (req: Request, res: Response) => {
    try {
      const found = await ownJob(req, res);
      if (!found) return;
      const { job } = found;
      if (!["succeeded", "failed", "cancelled"].includes(job.status)) {
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
        logs: [...job.logs, { t: Date.now(), text: "—— 重试(已上传分片将复用) ——" }],
      });
      runner.enqueue(job.id);
      res.json({ ok: true, job: (await store.get(job.id)) ?? job });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  router.delete("/jobs/:id", async (req: Request, res: Response) => {
    try {
      const found = await ownJob(req, res);
      if (!found) return;
      if (found.job.status === "running") {
        res.status(409).json({ ok: false, error: "任务运行中,请先取消再删除" });
        return;
      }
      // 正文与产物一起清:留着正文却删了任务只会变成孤儿数据
      const removedFiles = purgeJobArtifacts(found.job, found.workRoot, found.userRoot);
      await transcripts.removeByJob(found.job.id);
      await store.remove(found.job.id);
      res.json({ ok: true, removedFiles });
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  // ---- 产物下载(限定在该任务已登记、且落在用户目录内的文件) ----
  router.get("/jobs/:id/download", async (req: Request, res: Response) => {
    try {
      const found = await ownJob(req, res);
      if (!found) return;
      const { job, workRoot, userRoot } = found;
      const index = Math.max(0, parseInt(String(req.query.index ?? "0"), 10) || 0);
      const format = String(req.query.format || "txt");
      const item = (job.result?.items ?? [])[index];
      const rel = item
        ? ({ txt: item.txtFile, timed: item.timedFile, srt: item.srtFile, json: item.jsonFile, audio: item.file } as const)[
            format as "txt" | "timed" | "srt" | "json" | "audio"
          ]
        : undefined;
      if (!rel) {
        res.status(404).json({ ok: false, error: "产物不存在(可能未选择该格式)" });
        return;
      }
      const abs = path.resolve(workRoot, String(rel));
      if (relInside(userRoot, abs) === null) {
        res.status(404).json({ ok: false, error: "产物不存在" });
        return;
      }
      if (!statOrNull(abs)) {
        // 文件被清/换盘后仍然可读正文:分开报,不让用户以为"没选这个格式"
        res.status(404).json({ ok: false, error: "产物文件已不在服务器磁盘;转写正文仍可在任务详情中查看。" });
        return;
      }
      res.download(abs, path.basename(abs));
    } catch (e) {
      res.status(500).json({ ok: false, error: (e as Error).message });
    }
  });

  return router;
}
