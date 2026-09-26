// B 站「API 直取」通道：不碰视频网页，改用官方 JSON 接口拿流地址，下载/转码仍交给 yt-dlp。
//
// 为什么需要它：yt-dlp 的 BiliBili 抽取器一上来就要抓 https://www.bilibili.com/video/BVxxx 网页，
// 而这条路径会被 B 站风控整段拒掉（HTTP 412 + “出错啦!” 验证页）。实测：换桌面 UA、补
// Referer/Origin、用 finger/spi 现取 buvid3+buvid4、凑齐 sec-ch-ua/Sec-Fetch-* 一整套浏览器头、
// 甚至先访问首页拿真 cookie 再回访，全部照旧 412 —— 拦的是出口 IP（境外数据中心尤其明显），
// 不是请求头。yt-dlp 也没有跳过网页抓取的开关（api_version 之类仍然先 Downloading webpage）。
//
// 同一台机器上，JSON 接口是通的：/x/web-interface/nav 拿 wbi key、wbi/view 拿分P、
// /x/player/wbi/playurl 拿流地址、CDN 直链 Range 请求返回 206。参数与签名口径取自
// 本地参考实现 PiliPlus（lib/utils/wbi_sign.dart、lib/http/video.dart VideoHttp.videoUrl、
// lib/http/download.dart）。
//
// 签名还顺带解决画质问题：未签名的 /x/player/playurl 游客只给 qn=32，签名后给到 quality=64
// 且 support_formats 含 112/80，音频 30280(192k) 也在。
import crypto from "node:crypto";
import fs from "node:fs";
import { resolveCookiesFile } from "./biliCookies";
import { BILI_WEB_REFERER, resolveBiliUserAgent } from "./runtime";
import type { BiliOptions } from "./types";

const API_HOST = "https://api.bilibili.com";
const REQUEST_TIMEOUT_MS = 15000;

/** wbi mixin key 的字符打乱表（B 站前端固定值，与 PiliPlus _mixinKeyEncTab 一致）。 */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39,
  12, 38, 41, 13,
];

/** 签名时 B 站要求先剔除 value 里的这几个字符（不是编码，是真的删掉）。 */
const WBI_VALUE_FILTER = /[!'()*]/g;

/** 音频流 id 从高到低：Hi-Res / 杜比全景声 / 192K / 132K / 64K。 */
const AUDIO_ORDER = [100010, 100009, 100008, 30251, 30255, 30250, 30280, 30232, 30216];

export interface BiliPart {
  page: number;
  cid: number;
  title: string;
}

export interface BiliVideoInfo {
  bvid: string;
  aid: number;
  title: string;
  durationSec: number;
  parts: BiliPart[];
}

export type BiliStreamKind = "dash-audio" | "durl";

export interface BiliDirectTarget {
  /** 直链（含 upsig/deadline 等签名参数，日志里必须脱敏，见 maskStreamUrl） */
  streamUrl: string;
  kind: BiliStreamKind;
  /** 视频标题，命名产物用 */
  title: string;
  /** 人话说明（走了哪条流、什么档），写任务日志 */
  detail: string;
}

// ---------------------------------------------------------------------------
// wbi 签名
// ---------------------------------------------------------------------------

/**
 * Dart 的 Uri.encodeComponent 与 encodeURIComponent 不等价：`!'()*~` 在 Dart 里会被编码。
 * 签名是把 query 拼起来算 md5 的，少编码一个字符就直接 -403 参数错误，所以手工对齐。
 */
function encodeComponent(value: unknown): string {
  return encodeURIComponent(String(value)).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function mixinKeyOf(imgKey: string, subKey: string): string {
  const orig = `${imgKey}${subKey}`;
  // 打乱表最大下标是 58，而 B 站正常返回的是 imgKey+subKey 各 32 位（共 64）；
  // 长度不够就拼不出真 key，与其让每个 playurl 默默返回签名错，不如开场说清。
  const required = Math.max(...MIXIN_KEY_ENC_TAB) + 1;
  if (orig.length < required) {
    throw new Error(`B 站 wbi 图片名总长异常（${orig.length} < ${required}），无法生成 mixin key`);
  }
  return MIXIN_KEY_ENC_TAB.map((i) => orig[i]).join("");
}

/** https://i0.hdslb.com/bfs/wbi/7cd08494133a4d4082a110d71b996699.png → 7cd08494133a4d4082a110d71b996699 */
function baseNameNoExt(url: string): string {
  const tail = url.split("/").pop() || "";
  return tail.split(".")[0];
}

/** mixin key 每天换；缓存 6 小时，够长视频任务用，又不至于拿着过期 key 撞签名失败。 */
let cachedMixinKey = "";
let cachedMixinKeyAt = 0;

async function getMixinKey(opts: BiliOptions): Promise<string> {
  const now = Date.now();
  if (cachedMixinKey && now - cachedMixinKeyAt < 6 * 60 * 60 * 1000) return cachedMixinKey;
  // 游客访问 nav 会返回 code=-101，但 wbi_img 照样在 data 里 —— 不能按 code===0 判失败。
  const nav = (await apiJson<BiliNavResponse>(opts, "/x/web-interface/nav", { strict: false })).data;
  const img = nav?.wbi_img;
  if (!img?.img_url || !img?.sub_url) throw new Error("B 站 /x/web-interface/nav 未返回 wbi_img（接口形状变了？）");
  cachedMixinKey = mixinKeyOf(baseNameNoExt(img.img_url), baseNameNoExt(img.sub_url));
  cachedMixinKeyAt = now;
  return cachedMixinKey;
}

/** 给参数加 wts/w_rid，返回可直接拼 URL 的 query。 */
async function signedQuery(opts: BiliOptions, params: Record<string, string | number | boolean>): Promise<string> {
  const key = await getMixinKey(opts);
  const withTs: Record<string, string | number | boolean> = { ...params, wts: Math.floor(Date.now() / 1000) };
  const plain = Object.keys(withTs)
    .sort()
    .map((k) => `${encodeComponent(k)}=${encodeComponent(String(withTs[k]).replace(WBI_VALUE_FILTER, ""))}`)
    .join("&");
  const rid = crypto.createHash("md5").update(`${plain}${key}`).digest("hex");
  // 必须显式标注：把带索引签名的对象展开进字面量时，TS 会丢掉索引签名，
  // 下一行再用字符串下标取就成 TS7053。
  const all: Record<string, string | number | boolean> = { ...withTs, w_rid: rid };
  return Object.keys(all).map((k) => `${encodeComponent(k)}=${encodeComponent(String(all[k]))}`).join("&");
}

// ---------------------------------------------------------------------------
// 请求封装
// ---------------------------------------------------------------------------

interface BiliEnvelope<T> {
  code: number;
  message?: string;
  msg?: string;
  data?: T;
}

interface BiliNavResponse {
  isLogin?: boolean;
  wbi_img?: { img_url?: string; sub_url?: string };
}

interface BiliViewResponse {
  bvid: string;
  aid: number;
  cid?: number;
  title: string;
  duration?: number;
  pages?: Array<{ page: number; cid: number; part: string; duration: number }>;
}

interface AudioStream {
  id: number;
  baseUrl: string;
  backupUrl?: string[];
  bandwidth?: number;
  codecs?: string;
  size?: number;
}

interface PlayUrlData {
  quality?: number;
  durl?: Array<{ url: string; size?: number; length?: number; order?: number }>;
  dash?: {
    audio?: AudioStream[];
    video?: Array<{ id: number; baseUrl: string; bandwidth?: number; codecs?: string }>;
  };
}

/**
 * 把 Netscape 文件里属于 bilibili 域的条目拼成请求头 Cookie。
 *
 * 两个坑：一、许多导出工具把 httpOnly 条目（包括 SESSDATA）写成 `#HttpOnly_.bilibili.com`
 * 开头，它看着像注释但是真数据，不能当注释丢；二、同名条目可能重复（旧备份里常见），
 * 重复上送会让 B 站当成伪造指纹，所以按后出现的为准去重。
 */
function cookieHeaderFor(cookiesFile: string): string {
  const cf = (cookiesFile || "").trim();
  if (!cf) return "";
  let raw: string;
  try {
    raw = fs.readFileSync(cf, "utf8");
  } catch {
    return "";
  }
  const byName = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const httpOnly = line.startsWith("#HttpOnly_");
    if (line.startsWith("#") && !httpOnly) continue;
    const cols = line.split("\t");
    if (cols.length < 7) continue;
    const domain = cols[0].replace(/^#HttpOnly_/, "").replace(/^\./, "");
    if (!/bilibili\.(com|tv|cn)$/i.test(domain)) continue;
    byName.set(cols[5], `${cols[5]}=${cols[6]}`);
  }
  return [...byName.values()].join("; ");
}

async function apiJson<T>(
  opts: BiliOptions,
  pathWithHost: string,
  extra: { query?: string; strict?: boolean; referer?: string } = {},
): Promise<BiliEnvelope<T>> {
  const url = pathWithHost.startsWith("http")
    ? pathWithHost
    : `${API_HOST}${pathWithHost}${extra.query ? `?${extra.query}` : ""}`;
  const cookie = cookieHeaderFor(resolveCookiesFile(opts));
  const headers: Record<string, string> = {
    "User-Agent": resolveBiliUserAgent(),
    Referer: extra.referer || BILI_WEB_REFERER,
    Accept: "application/json, text/plain, */*",
  };
  if (cookie) headers.Cookie = cookie;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`B 站接口请求失败 ${url.split("?")[0]}: ${(e as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`B 站接口 HTTP ${res.status} ${url.split("?")[0]}: ${text.slice(0, 120)}`);
  }
  let json: BiliEnvelope<T>;
  try {
    json = JSON.parse(text) as BiliEnvelope<T>;
  } catch {
    throw new Error(`B 站接口返回的不是 JSON ${url.split("?")[0]}: ${text.slice(0, 120)}`);
  }
  if ((extra.strict ?? true) && json.code !== 0) {
    throw new Error(`B 站接口 ${url.split("?")[0]} code=${json.code} ${json.message || json.msg || ""}`);
  }
  return json;
}

// ---------------------------------------------------------------------------
// 对外能力
// ---------------------------------------------------------------------------

export function isBilibiliInput(input: string): boolean {
  return /bilibili\.com|bilibili\.tv|b23\.tv|^BV[0-9A-Za-z]{8,}$/i.test((input || "").trim());
}

export function biliBvid(input: string): string | null {
  const m = /\bBV[0-9A-Za-z]{8,}\b/.exec(input || "");
  return m ? m[0] : null;
}

/** 直链进日志前一定要过一遍：upsig/deadline/trid 是「谁能下这个文件」的凭据。 */
export function maskStreamUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}?<已省略 ${u.searchParams.size} 个签名参数>`;
  } catch {
    return url.split("?")[0];
  }
}

/** 多 P 批量时同一 bvid 会被反复问，缓存 5 分钟省掉 N 次 view 请求。 */
const viewCache = new Map<string, { at: number; info: BiliVideoInfo }>();
const VIEW_CACHE_TTL_MS = 5 * 60 * 1000;

/** BV → 分P 清单（多 P 展开用；yt-dlp 的 flat-playlist 要抓网页，412 时全靠这里）。 */
export async function listBiliParts(opts: BiliOptions, bvid: string): Promise<BiliVideoInfo> {
  const hit = viewCache.get(bvid);
  if (hit && Date.now() - hit.at < VIEW_CACHE_TTL_MS) return hit.info;
  const query = await signedQuery(opts, { bvid, web_location: 1550101 });
  const data = (await apiJson<BiliViewResponse>(opts, "/x/web-interface/wbi/view", { query })).data;
  if (!data) throw new Error(`B 站 ${bvid} 的 wbi/view 没有 data`);
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const parts: BiliPart[] = pages.length
    ? pages.map((p) => ({ page: p.page, cid: p.cid, title: (p.part || "").trim() }))
    : [{ page: 1, cid: data.cid || 0, title: "" }];
  const info: BiliVideoInfo = {
    bvid: data.bvid || bvid,
    aid: data.aid || 0,
    title: (data.title || "").trim(),
    durationSec: data.duration || 0,
    parts,
  };
  viewCache.set(bvid, { at: Date.now(), info });
  return info;
}

function pickAudio(streams: AudioStream[] | undefined): AudioStream | undefined {
  if (!streams || !streams.length) return undefined;
  const rank = (id: number) => {
    const i = AUDIO_ORDER.indexOf(id);
    return i === -1 ? AUDIO_ORDER.length : i;
  };
  const sorted = streams.slice().sort((a, b) => rank(a.id) - rank(b.id) || (b.bandwidth || 0) - (a.bandwidth || 0));
  return sorted[0];
}

/**
 * 取一集的下载目标。
 *
 * 音频模式 → dash.audio（单个 m4s，B 站把音频做成一路一份，无需再合流，转写就用它最省）；
 * 视频模式 → fnval=1 的 durl（自带画面的 mp4 单文件）。dash 的画质档在游客态只有 360P，
 * 真要高清得给 Cookie；多段 durl 需要自己 concat，这里不装，直接报出来。
 */
export async function resolveBiliDirectTarget(
  opts: BiliOptions,
  bvid: string,
  page: number,
  videoMode: boolean,
): Promise<BiliDirectTarget> {
  const info = await listBiliParts(opts, bvid);
  const part = info.parts.find((p) => p.page === page) || info.parts[0];
  if (!part || !part.cid) throw new Error(`B 站 ${bvid} 找不到第 ${page} 集（cid 缺失）`);

  const cookie = cookieHeaderFor(resolveCookiesFile(opts));
  const params: Record<string, string | number | boolean> = {
    bvid,
    cid: part.cid,
    qn: videoMode ? 127 : 64,
    // 4048=要 dash；1=只要 mp4 直链。两条路的产物形态不同，分开请求比事后挑流清楚。
    fnval: videoMode ? 1 : 4048,
    fourk: 1,
    fnver: 0,
    voice_balance: 0,
    gaia_source: "pre-load",
    isGaiaAvoided: true,
    web_location: 1315873,
    dm_img_list: "[]",
    dm_img_str: crypto.randomBytes(16).toString("base64").slice(0, 16),
    dm_cover_img_str: crypto.randomBytes(32).toString("base64").slice(0, 32),
    dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
  };
  // 游客试看高画质（PiliPlus 的 tryLook 只在未登录时带）
  if (!cookie) params.try_look = 1;

  const query = await signedQuery(opts, params);
  const data = (await apiJson<PlayUrlData>(opts, "/x/player/wbi/playurl", {
    query,
    referer: `https://www.bilibili.com/video/${bvid}`,
  })).data;
  if (!data) throw new Error(`B 站 playurl 对 ${bvid} 没返回数据`);

  if (!videoMode) {
    const audio = pickAudio(data.dash?.audio);
    if (audio?.baseUrl) {
      return {
        streamUrl: audio.baseUrl,
        kind: "dash-audio",
        title: info.title,
        detail: `dash 音频 id=${audio.id}${audio.codecs ? `/${audio.codecs}` : ""}${audio.bandwidth ? ` ${Math.round(audio.bandwidth / 1000)}kbps` : ""}`,
      };
    }
    // 少数老视频没有 dash，退回 mp4 直链（照样能抽音频）
  }

  const durl = data.durl || [];
  if (durl.length === 1 && durl[0].url) {
    return {
      streamUrl: durl[0].url,
      kind: "durl",
      title: info.title,
      detail: `mp4 直链 quality=${data.quality ?? "?"}${durl[0].size ? ` ${(durl[0].size / 1048576) | 0}MB` : ""}`,
    };
  }
  if (durl.length > 1) {
    throw new Error(
      `B 站 ${bvid} 第 ${page} 集是 ${durl.length} 段 mp4，直取通道不做分段拼接；请改用音频模式，或配 Cookie 走 yt-dlp 完整路径`,
    );
  }
  throw new Error(`B 站 ${bvid} 第 ${page} 集没有可用流（playurl 既无 dash 音频也无 durl）`);
}
