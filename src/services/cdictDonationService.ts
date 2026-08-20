import fs from "node:fs";
import path from "node:path";
import logger from "../utils/logger";
import { CDictDonationClaimModel } from "../models/cdictDonationClaimModel";
import { RuntimeConfigModel } from "../models/runtimeConfigModel";
import { mongoose } from "./mongoService";

/**
 * CDict 赞赏码配置与图片来源。
 *
 * 客户端安装包内不内置任何收款信息，每次都向 /api/cdict/donate 拉取渠道列表与图片地址，
 * 因此运营方可以在后台随时改图、改文案、临时下线，不需要发版。
 *
 * 图片本身不经过本服务：后台填了地址就 302 到那个地址，服务端不下载、不缓存、不改写字节。
 */

const CONFIG_KEY = "CDICT_DONATION";
const DONATE_ROUTE_PREFIX = "/api/cdict/donate";
const ASSET_DIR_CANDIDATES = [
  path.join(__dirname, "..", "assets", "donation"),
  path.join(process.cwd(), "src", "assets", "donation"),
  path.join(process.cwd(), "dist", "assets", "donation"),
];
const ASSET_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];
const CHANNEL_ID = /^[a-z0-9-]{1,32}$/;
const TRANSACTION_ID = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_CHANNELS = 8;
const MAX_SUPPORTERS = 500;
const MAX_CLAIMS = 500;

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
  /** 收款码图片地址；客户端会被 302 直接指到这里。留空表示使用服务端内置的 assets/donation/<id>.<ext>。 */
  imageUrl: string;
}

export interface CDictDonationConfig {
  enabled: boolean;
  notice: string;
  channels: CDictDonationChannel[];
  /** 鸣谢名单：核实转账备注后由运营方在后台补充，客户端赞赏页实时显示。 */
  supporters: string[];
}

export interface CDictDonationImage {
  contentType: string;
  data: Buffer;
}

/** 收款码来源：后台填了地址就让客户端直接去那个地址取，否则回服务端内置图片的字节。 */
export type CDictDonationImageSource =
  | { kind: "redirect"; url: string }
  | { kind: "bundled"; image: CDictDonationImage };

const DEFAULT_CONFIG: CDictDonationConfig = {
  enabled: true,
  notice: "赞赏完全自愿，不解锁任何功能；应用永久免费。",
  channels: [
    { id: "alipay", name: "支付宝", hint: "打开支付宝扫一扫", enabled: true, imageUrl: "" },
    { id: "wechat", name: "微信", hint: "打开微信扫一扫", enabled: true, imageUrl: "" },
  ],
  supporters: [],
};

const LOOPBACK_HOSTS = /^(localhost|0\.0\.0\.0|::1|\[::1\])$/i;
const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** 本部署自身的域名，用来拒绝"把图片地址填成本站地址"导致的跳转自环。 */
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
    supporters: [...DEFAULT_CONFIG.supporters],
  };
}

/** 鸣谢名单：去空、去重、限长，顺序按后台填写的顺序保留。 */
function normalizeSupporters(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const name = asString(item, "", 32);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (names.length >= MAX_SUPPORTERS) break;
  }
  return names;
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

/** 只接受指向外部图床的 https 直链：本站地址、本接口自身与内网地址都拒掉，避免 302 跳回自己形成死循环。 */
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
    throw new Error("图片地址不能填赞赏码接口自身，否则跳转会绕回本接口形成死循环");
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
    supporters: normalizeSupporters(obj.supporters),
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
    supporters: normalizeSupporters(obj.supporters),
  };

  const now = new Date();
  await RuntimeConfigModel.findOneAndUpdate(
    { key: CONFIG_KEY },
    { value: config, updatedAt: now },
    { upsert: true, returnDocument: "after" },
  ).exec();
  return { updatedAt: now.toISOString() };
}

export async function deleteDonationSetting(): Promise<void> {
  await RuntimeConfigModel.deleteOne({ key: CONFIG_KEY }).exec();
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

/**
 * 解析某个渠道的收款码来源。
 *
 * 填了图片地址就回 redirect，让客户端直接去后台填的那个地址取图——服务端不下载、不缓存、
 * 不改写，改地址立刻生效。地址留空才回服务端内置图片的字节。两者都没有时返回 null，控制器给 404。
 */
export async function resolveDonationImage(channelId: string): Promise<CDictDonationImageSource | null> {
  const id = channelId.trim().toLowerCase();
  if (!CHANNEL_ID.test(id)) return null;
  const config = await getPublicDonationConfig();
  if (!config.enabled) return null;
  const channel = config.channels.find((item) => item.id === id);
  if (!channel) return null;
  if (channel.imageUrl) return { kind: "redirect", url: channel.imageUrl };
  const image = readBundledImage(id);
  return image ? { kind: "bundled", image } : null;
}

export interface CDictDonationClaim {
  id: string;
  transactionId: string;
  displayName: string;
  createdAt?: string;
}

/**
 * 提交署名申请：只接受交易号与想展示的称呼，两项都由提交者自己填写。
 *
 * 同一个交易号重复提交视为幂等，不报错也不覆盖已有记录——客户端可能因为超时重试。
 */
export async function submitDonationClaim(input: unknown): Promise<{ duplicated: boolean }> {
  const obj = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const transactionId = asString(obj.transactionId, "", 64);
  const displayName = asString(obj.displayName, "", 32);
  if (!TRANSACTION_ID.test(transactionId)) {
    throw new Error("交易号不合法：请填写 6-64 位的字母、数字、连字符或下划线");
  }
  if (!displayName) {
    throw new Error("请填写希望展示在鸣谢名单中的称呼");
  }
  if (mongoose.connection.readyState !== 1) {
    throw new Error("服务暂时不可用，请稍后再试");
  }
  const existing = await CDictDonationClaimModel.findOne({ transactionId }).lean().exec();
  if (existing) return { duplicated: true };
  const pending = await CDictDonationClaimModel.estimatedDocumentCount().exec();
  if (pending >= MAX_CLAIMS) {
    throw new Error("待核实的署名申请过多，请稍后再试");
  }
  await CDictDonationClaimModel.create({ transactionId, displayName, createdAt: new Date() });
  return { duplicated: false };
}

/** 后台：待核实的署名申请，新的在前。 */
export async function listDonationClaims(): Promise<CDictDonationClaim[]> {
  if (mongoose.connection.readyState !== 1) return [];
  const docs = await CDictDonationClaimModel.find({})
    .sort({ createdAt: -1 })
    .limit(MAX_CLAIMS)
    .lean()
    .exec();
  return docs.map((doc) => ({
    id: String((doc as { _id?: unknown })._id ?? ""),
    transactionId: String(doc.transactionId ?? ""),
    displayName: String(doc.displayName ?? ""),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : undefined,
  }));
}

/** 后台：核实完（无论是否加入名单）就删掉这条申请。 */
export async function deleteDonationClaim(id: string): Promise<void> {
  if (!mongoose.isValidObjectId(id)) {
    throw new Error("申请 id 不合法");
  }
  await CDictDonationClaimModel.deleteOne({ _id: id }).exec();
}
