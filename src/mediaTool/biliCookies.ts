// B 站 cookies 的持久化层：正文存 DB（server 态 = Mongo，standalone 态 = 本地文件），
// 运行时再落一份 0600 的 Netscape 文件给 yt-dlp --cookies 用。
//
// 为什么要存正文而不是只存路径：运行镜像没有挂载持久卷（现场实测 Mounts=[]），
// 写在 workDir 或容器内任何路径的文件都会在下次重新部署后静默消失；而 cookiesArgs()
// 早期版本对「文件不存在」是静默跳过，于是表现为游客请求撞 B 站风控 412，
// 排查时页面上还显示「cookies 已配置」。正文入库后，进程启动即恢复运行文件。
import fs from "node:fs";
import path from "node:path";
import { MediaToolCookiesModel } from "../models/mediaToolModels";
import { ensureDir, statOrNull, tmpRoot } from "./runtime";
import type { BiliOptions } from "./types";

const COOKIES_KEY = "bilibili";

/** 上传上限：浏览器导出的 bilibili cookies 一般 2~20KB，512KB 已足够宽，又能挡住灌垃圾。 */
export const MAX_COOKIES_BYTES = 512 * 1024;

export interface MediaCookiesStore {
  read(): Promise<string | null>;
  write(content: string, by: string): Promise<{ bytes: number; updatedAt: number }>;
  clear(): Promise<void>;
}

export interface CookiesValidation {
  ok: boolean;
  entries: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// 两种实现
// ---------------------------------------------------------------------------

export function createMongoMediaCookiesStore(): MediaCookiesStore {
  return {
    async read(): Promise<string | null> {
      const doc = await MediaToolCookiesModel.findOne({ key: COOKIES_KEY }).lean().exec();
      return typeof doc?.content === "string" ? doc.content : null;
    },
    async write(content: string, by: string) {
      const updatedAt = Date.now();
      await MediaToolCookiesModel.updateOne(
        { key: COOKIES_KEY },
        { $set: { key: COOKIES_KEY, content, bytes: Buffer.byteLength(content, "utf8"), updatedAt, updatedBy: by } },
        { upsert: true },
      ).exec();
      return { bytes: Buffer.byteLength(content, "utf8"), updatedAt };
    },
    async clear() {
      await MediaToolCookiesModel.deleteMany({ key: COOKIES_KEY }).exec();
    },
  };
}

/** standalone 态（本地后端壳）：没有 Mongo，正文落在数据目录里一个 0600 文件。 */
export function createFileMediaCookiesStore(file: string): MediaCookiesStore {
  return {
    async read(): Promise<string | null> {
      try {
        return fs.readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    async write(content: string, _by: string) {
      ensureDir(path.dirname(file));
      fs.writeFileSync(file, content, { mode: 0o600 });
      return { bytes: Buffer.byteLength(content, "utf8"), updatedAt: Date.now() };
    },
    async clear() {
      try {
        fs.unlinkSync(file);
      } catch {
        /* 本来就没有 */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 校验与运行时落盘
// ---------------------------------------------------------------------------

/**
 * Netscape/curl cookies.txt 形状校验：允许空行与 `#` 注释，但 `#HttpOnly_` 开头的是真条目
 * （SESSDATA 常写成这样），得计数。目的只是挡住「贴成了 JSON / 一行 Cookie 头」这类误用。
 */
export function validateCookiesText(text: string): CookiesValidation {
  const raw = String(text ?? "");
  if (Buffer.byteLength(raw, "utf8") > MAX_COOKIES_BYTES) {
    return { ok: false, entries: 0, error: `cookies 内容超过 ${Math.floor(MAX_COOKIES_BYTES / 1024)}KB 上限` };
  }
  let entries = 0;
  let malformed = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.startsWith("#") && !line.startsWith("#HttpOnly_")) continue;
    if (line.split("\t").length >= 7) entries++;
    else malformed++;
  }
  if (entries === 0) {
    return {
      ok: false,
      entries: 0,
      error: malformed > 0
        ? "不是 Netscape cookies.txt 格式：每行需 7 个 tab 分隔字段（domain\\tflag\\tpath\\tsecure\\texpiry\\tname\\tvalue）。浏览器导出请选 Netscape/Cookie 格式，不要贴请求头里的 Cookie 串"
        : "内容里没有任何 cookie 条目",
    };
  }
  if (malformed > 0 && malformed > entries) {
    return { ok: false, entries, error: `格式可疑：${malformed} 行不合 Netscape 格式，只有 ${entries} 行合法` };
  }
  return { ok: true, entries };
}

/** 运行时的 cookies 文件路径（standalone 与 server 同用一个位置，均在 os.tmpdir 下）。 */
export function biliCookiesPath(): string {
  return path.join(tmpRoot(), "bili-cookies.txt");
}

let lastWrittenContent = "";

/**
 * 把正文写成 cookies 文件（0600）。内容没变就跳过重写，避免每次读设置都刷 mtime。
 * 返回实际路径；写失败抛错由调用方转成 HTTP 错误。
 */
export function writeCookiesFile(content: string): string {
  const target = biliCookiesPath();
  ensureDir(path.dirname(target));
  if (content === lastWrittenContent && statOrNull(target)) return target;
  fs.writeFileSync(target, content, { mode: 0o600 });
  try {
    fs.chmodSync(target, 0o600); // ensureDir 之前已存在时 writeFileSync 的 mode 不生效
  } catch {
    /* 某些文件系统不支持 chmod，忽略 */
  }
  lastWrittenContent = content;
  return target;
}

export function removeCookiesFile(): void {
  lastWrittenContent = "";
  try {
    fs.unlinkSync(biliCookiesPath());
  } catch {
    /* 没有就算了 */
  }
}

/**
 * 真正生效的 cookies 路径：显式配置（设置页/env）优先，其次是用 DB 正文落出来的那份。
 *
 * 注意：显式配了路径但文件读不到时这里仍原样返回它 —— 由 biliYtDlp.assertCookiesUsable
 * 负责把问题在任务开场就报出来，而不是静默降级成游客请求。
 */
export function resolveCookiesFile(opts: BiliOptions): string {
  const explicit = (opts.cookiesFile || "").trim();
  if (explicit) return explicit;
  const persisted = biliCookiesPath();
  return statOrNull(persisted) ? persisted : "";
}

/** 启动恢复：把 DB 里的正文重建成运行时文件（容器是新写的，tmp 里什么都没有）。 */
export async function restoreBiliCookies(store: MediaCookiesStore): Promise<void> {
  try {
    const content = await store.read();
    if (content && content.trim()) writeCookiesFile(content);
  } catch {
    /* 恢复失败只影响 cookies，不阻断启动 */
  }
}

export interface BiliCookiesStatus {
  configured: boolean;
  /** path = 设置/env 里指定的文件；db = 持久化正文落的运行文件；none = 都没配 */
  source: "path" | "db" | "none";
  ok: boolean;
  path: string | null;
  hint?: string;
  /** 已存正文的字节数与更新时间（不回传内容本身） */
  bytes?: number;
  updatedAt?: number;
}

/** 给 /health 与设置页用的 cookies 现状（绝不回传正文，避免密钥外流）。 */
export async function biliCookiesStatus(
  store: MediaCookiesStore,
  opts: BiliOptions,
  docMeta?: { bytes: number; updatedAt: number } | null,
): Promise<BiliCookiesStatus> {
  const explicit = (opts.cookiesFile || "").trim();
  if (explicit) {
    const exists = Boolean(statOrNull(explicit));
    return {
      configured: true,
      source: "path",
      ok: exists,
      path: explicit,
      hint: exists ? undefined : "指定路径的文件不存在（容器无持久卷时重新部署会丢；建议改用上传/粘贴）",
    };
  }
  const persisted = biliCookiesPath();
  if (statOrNull(persisted)) {
    return {
      configured: true,
      source: "db",
      ok: true,
      path: persisted,
      bytes: docMeta?.bytes,
      updatedAt: docMeta?.updatedAt,
    };
  }
  const stored = await store.read().catch(() => null);
  if (stored && stored.trim()) {
    // DB 里有正文但运行文件还没落出来（首次读设置/写文件失败）：状态如实说明
    return {
      configured: true,
      source: "db",
      ok: false,
      path: persisted,
      hint: "DB 里有正文但运行时文件还没落出来（保存一次或重启即可）",
      bytes: Buffer.byteLength(stored, "utf8"),
    };
  }
  return {
    configured: false,
    source: "none",
    ok: false,
    path: null,
    hint: "未配置：B 站按游客请求处理，很容易撞风控 412",
  };
}
