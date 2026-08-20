import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import logger from "../utils/logger";
import { RuntimeConfigModel } from "../models/runtimeConfigModel";
import { mongoose } from "./mongoService";

/**
 * CDict 赞赏码配置与图片来源。
 *
 * 客户端安装包内不内置任何收款信息，每次都向 /api/cdict/donate 拉取渠道列表与图片字节，
 * 因此运营方可以在后台随时改图、改文案、临时下线，不需要发版。
 */

const CONFIG_KEY = "CDICT_DONATION";
const DONATE_ROUTE_PREFIX = "/api/cdict/donate";
/** 出站请求带上这个标记；本接口收到带标记的请求就只回内置图片，杜绝跳转绕回来形成递归。 */
export const DONATE_LOOP_HEADER = "x-cdict-donate-proxy";
const ASSET_DIR_CANDIDATES = [
  path.join(__dirname, "..", "assets", "donation"),
  path.join(process.cwd(), "src", "assets", "donation"),
  path.join(process.cwd(), "dist", "assets", "donation"),
];
const ASSET_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const CHANNEL_ID = /^[a-z0-9-]{1,32}$/;
const MAX_CHANNELS = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 8000;
const REMOTE_CACHE_TTL_MS = 10 * 60 * 1000;

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export interface CDictDonationChannel {
  id: string;
  name: string;
  hint: string;
  enabled: boolean;
  /** 远端图片地址；留空表示使用服务端内置的 assets/donation/<id>.<ext>。 */
  imageUrl: string;
}

export interface CDictDonationConfig {
  enabled: boolean;
  notice: string;
  channels: CDictDonationChannel[];
}

export interface CDictDonationImage {
  contentType: string;
  data: Buffer;
}

const DEFAULT_CONFIG: CDictDonationConfig = {
  enabled: true,
  notice: "赞赏完全自愿，不解锁任何功能；应用永久免费。",
  channels: [
    { id: "alipay", name: "支付宝", hint: "打开支付宝扫一扫", enabled: true, imageUrl: "" },
    { id: "wechat", name: "微信", hint: "打开微信扫一扫", enabled: true, imageUrl: "" },
  ],
};

const remoteCache = new Map<string, { image: CDictDonationImage; expiresAt: number }>();

const LOOPBACK_HOSTS = /^(localhost|0\.0\.0\.0|::1|\[::1\])$/i;
const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** 本部署自身的域名，用来拒绝"把图片地址填成本站地址"导致的自我代理。 */
function ownHostnames(): Set<string> {
  const hosts = new Set<string>(["tts.chloemlla.com"]);
  for (const raw of [process.env.VITE_API_URL, process.env.BASE_URL, process.env.FRONTEND_URL]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).hostname.toLowerCase());
    } catch {
      // 环境变量配错就当没配，不影响赞赏码。
    }
  }
  return hosts;
}

function cloneDefaults(): CDictDonationConfig {
  return {
    enabled: DEFAULT_CONFIG.enabled,
    notice: DEFAULT_CONFIG.notice,
    channels: DEFAULT_CONFIG.channels.map((channel) => ({ ...channel })),
  };
}

function asString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

/** 只接受指向外部图床的 https 直链：本站地址、本接口自身与内网地址都拒掉，避免服务端自我代理。 */
function normalizeImageUrl(value: unknown): string {
  const raw = asString(value, "", 512);
  if (!raw) return "";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("图片地址必须是完整的 https URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("图片地址必须使用 https");
  }
  const host = parsed.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.test(host) || PRIVATE_IPV4.test(host)) {
    throw new Error("图片地址不能指向本机或内网");
  }
  if (parsed.pathname.toLowerCase().startsWith(DONATE_ROUTE_PREFIX)) {
    throw new Error("图片地址不能填赞赏码接口自身，否则服务端会自己代理自己");
  }
  if (ownHostnames().has(host)) {
    throw new Error("图片地址不能指向本站；留空即使用服务端内置图片，填写时请给图床直链");
  }
  return parsed.toString();
}

function normalizeChannel(raw: unknown, index: number): CDictDonationChannel {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = asString(obj.id, "", 32).toLowerCase();
  if (!CHANNEL_ID.test(id)) {
    throw new Error(`第 ${index + 1} 个渠道的 id 不合法，只允许小写字母、数字和连字符`);
  }
  const name = asString(obj.name, "", 32);
  if (!name) {
    throw new Error(`第 ${index + 1} 个渠道缺少名称`);
  }
  return {
    id,
    name,
    hint: asString(obj.hint, "", 64),
    enabled: asBoolean(obj.enabled, true),
    imageUrl: normalizeImageUrl(obj.imageUrl),
  };
}

function normalizeStored(value: unknown): CDictDonationConfig {
  const obj = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawChannels = Array.isArray(obj.channels) ? obj.channels : [];
  const channels: CDictDonationChannel[] = [];
  const seen = new Set<string>();
  rawChannels.slice(0, MAX_CHANNELS).forEach((raw, index) => {
    try {
      const channel = normalizeChannel(raw, index);
      if (seen.has(channel.id)) return;
      seen.add(channel.id);
      channels.push(channel);
    } catch (error) {
      logger.warn("[CDict] 忽略非法赞赏渠道配置", {
        index,
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  });
  return {
    enabled: asBoolean(obj.enabled, DEFAULT_CONFIG.enabled),
    notice: asString(obj.notice, DEFAULT_CONFIG.notice, 200) || DEFAULT_CONFIG.notice,
    channels: channels.length > 0 ? channels : cloneDefaults().channels,
  };
}

async function readDoc(): Promise<{ value: Record<string, unknown>; updatedAt?: Date } | null> {
  // 未连上库时直接用默认配置：查询会一直挂着，赞赏码没必要为此拖住请求。
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const doc = await RuntimeConfigModel.findOne({ key: CONFIG_KEY }).lean().exec();
    if (!doc?.value || typeof doc.value !== "object") return null;
    return { value: doc.value as Record<string, unknown>, updatedAt: doc.updatedAt };
  } catch (error) {
    logger.warn("[CDict] 读取赞赏配置失败，回退到默认配置", {
      message: error instanceof Error ? error.message : "未知错误",
    });
    return null;
  }
}

/** 客户端可见的配置：只暴露已启用的渠道。 */
export async function getPublicDonationConfig(): Promise<CDictDonationConfig> {
  const doc = await readDoc();
  const config = doc ? normalizeStored(doc.value) : cloneDefaults();
  return { ...config, channels: config.channels.filter((channel) => channel.enabled) };
}

/** 后台可见的完整配置（含已停用渠道与图片地址）。 */
export async function getDonationSetting(): Promise<{ config: CDictDonationConfig; updatedAt?: string }> {
  const doc = await readDoc();
  return {
    config: doc ? normalizeStored(doc.value) : cloneDefaults(),
    updatedAt: doc?.updatedAt?.toISOString(),
  };
}

export async function setDonationSetting(input: unknown): Promise<{ updatedAt: string }> {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const rawChannels = Array.isArray(obj.channels) ? obj.channels : [];
  if (rawChannels.length === 0) {
    throw new Error("至少需要一个赞赏渠道");
  }
  if (rawChannels.length > MAX_CHANNELS) {
    throw new Error(`渠道数量不能超过 ${MAX_CHANNELS} 个`);
  }
  const channels: CDictDonationChannel[] = [];
  const seen = new Set<string>();
  rawChannels.forEach((raw, index) => {
    const channel = normalizeChannel(raw, index);
    if (seen.has(channel.id)) {
      throw new Error(`渠道 id "${channel.id}" 重复`);
    }
    seen.add(channel.id);
    channels.push(channel);
  });
  const config: CDictDonationConfig = {
    enabled: asBoolean(obj.enabled, DEFAULT_CONFIG.enabled),
    notice: asString(obj.notice, DEFAULT_CONFIG.notice, 200) || DEFAULT_CONFIG.notice,
    channels,
  };

  const now = new Date();
  await RuntimeConfigModel.findOneAndUpdate(
    { key: CONFIG_KEY },
    { value: config, updatedAt: now },
    { upsert: true, returnDocument: "after" },
  ).exec();
  remoteCache.clear();
  return { updatedAt: now.toISOString() };
}

export async function deleteDonationSetting(): Promise<void> {
  await RuntimeConfigModel.deleteOne({ key: CONFIG_KEY }).exec();
  remoteCache.clear();
}

/** 内置图片：按渠道 id 找 assets/donation/<id>.<ext>，id 已限定字符集，不可能越出目录。 */
function readBundledImage(channelId: string): CDictDonationImage | null {
  for (const dir of ASSET_DIR_CANDIDATES) {
    for (const ext of ASSET_EXTENSIONS) {
      const file = path.join(dir, `${channelId}${ext}`);
      if (!fs.existsSync(file)) continue;
      return { contentType: CONTENT_TYPES[ext] || "application/octet-stream", data: fs.readFileSync(file) };
    }
  }
  return null;
}

async function fetchRemoteImage(url: string): Promise<CDictDonationImage> {
  const cached = remoteCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.image;

  const response = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: REMOTE_TIMEOUT_MS,
    maxContentLength: MAX_IMAGE_BYTES,
    maxRedirects: 2,
    validateStatus: () => true,
    headers: { [DONATE_LOOP_HEADER]: "1" },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`图片源返回 ${response.status}`);
  }
  const contentType = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`图片源返回了非图片内容（${contentType || "未知类型"}）`);
  }
  const data = Buffer.from(response.data);
  if (data.length === 0) {
    throw new Error("图片源返回空内容");
  }
  const image: CDictDonationImage = { contentType, data };
  remoteCache.set(url, { image, expiresAt: Date.now() + REMOTE_CACHE_TTL_MS });
  return image;
}

/**
 * 取某个渠道的收款码字节：优先后台配置的远端图片，取不到则回落到服务端内置图片；
 * 两者都没有时返回 null，由控制器给出 404。
 *
 * [allowRemote] 为 false 时只读内置图片——请求带着 [DONATE_LOOP_HEADER] 进来，说明是本服务
 * 出站取图被跳转绕回了自己，此时绝不能再发一次出站请求。
 */
export async function getDonationImage(
  channelId: string,
  allowRemote = true,
): Promise<CDictDonationImage | null> {
  const id = channelId.trim().toLowerCase();
  if (!CHANNEL_ID.test(id)) return null;
  const config = await getPublicDonationConfig();
  if (!config.enabled) return null;
  const channel = config.channels.find((item) => item.id === id);
  if (!channel) return null;
  if (channel.imageUrl && allowRemote) {
    try {
      return await fetchRemoteImage(channel.imageUrl);
    } catch (error) {
      logger.warn("[CDict] 远端赞赏码拉取失败，回落到内置图片", {
        channel: id,
        message: error instanceof Error ? error.message : "未知错误",
      });
    }
  }
  return readBundledImage(id);
}
