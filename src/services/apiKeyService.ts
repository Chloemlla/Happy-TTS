import crypto from "node:crypto";
import { type ApiKeyDoc, ApiKeyModel } from "../models/apiKeyModel";
import logger from "../utils/logger";

/** 所有可分配的权限 */
export const ALL_PERMISSIONS = [
  "tts", // TTS 生成
  "status", // 系统状态查询
  "shorturl", // 短链服务
  "media", // 媒体接口
  "network", // 网络工具
  "life", // 生活服务
  "social", // 社交接口
  "ipfs", // IPFS 上传
  "data-process", // 数据处理
] as const;

export const ADMIN_PERMISSION = "*" as const;

export type Permission = (typeof ALL_PERMISSIONS)[number] | typeof ADMIN_PERMISSION;

export interface ApiKeyPermissionDefinition {
  key: Permission;
  label: string;
  description: string;
  category: "core" | "utility" | "content" | "system";
  costCredits: number;
  endpoints: string[];
  adminOnly?: boolean;
}

export type ApiKeyView = Omit<ApiKeyDoc, "keyHash">;

const permissionSet = new Set<string>(ALL_PERMISSIONS);

export const API_KEY_PERMISSION_DEFINITIONS: ApiKeyPermissionDefinition[] = [
  {
    key: ADMIN_PERMISSION,
    label: "全部能力",
    description: "允许访问所有已接入 API Key 认证的能力，不包含后台管理接口。",
    category: "system",
    costCredits: 0,
    endpoints: ["所有已接入 X-API-Key 的接口"],
    adminOnly: true,
  },
  {
    key: "tts",
    label: "TTS 生成",
    description: "提交语音生成任务，查询任务状态、结果和历史记录。",
    category: "core",
    costCredits: 1,
    endpoints: ["/api/tts/generate", "/api/tts/jobs/*", "/api/tts/history"],
  },
  {
    key: "status",
    label: "认证状态",
    description: "访问需要认证的系统状态检查接口。",
    category: "system",
    costCredits: 0,
    endpoints: ["/api/status/status"],
  },
  {
    key: "shorturl",
    label: "短链管理",
    description: "查看和删除所属用户的短链记录。",
    category: "utility",
    costCredits: 0.05,
    endpoints: ["/api/shorturls", "/api/shorturls/*"],
  },
  {
    key: "media",
    label: "媒体解析",
    description: "调用音乐与视频解析接口。",
    category: "content",
    costCredits: 0.2,
    endpoints: ["/api/media/music163", "/api/media/pipixia"],
  },
  {
    key: "network",
    label: "网络工具",
    description: "调用 Ping、TCPing、测速、端口扫描、IP 查询等网络工具。",
    category: "utility",
    costCredits: 0.2,
    endpoints: ["/api/network/*"],
  },
  {
    key: "life",
    label: "生活服务",
    description: "调用手机号归属地、油价等生活信息接口。",
    category: "utility",
    costCredits: 0.1,
    endpoints: ["/api/life/*"],
  },
  {
    key: "social",
    label: "社交热榜",
    description: "调用微博、百度等热榜接口。",
    category: "content",
    costCredits: 0.1,
    endpoints: ["/api/social/*"],
  },
  {
    key: "ipfs",
    label: "IPFS 上传",
    description: "上传文件到 IPFS，并使用 API Key 认证跳过人机验证。",
    category: "core",
    costCredits: 0.5,
    endpoints: ["/api/ipfs/upload"],
  },
  {
    key: "data-process",
    label: "数据处理",
    description: "调用 Base64、MD5 等数据处理工具。",
    category: "utility",
    costCredits: 0.05,
    endpoints: ["/api/data/*"],
  },
];

export function getApiKeyPermissionDefinitions(isAdmin = false): ApiKeyPermissionDefinition[] {
  return API_KEY_PERMISSION_DEFINITIONS.filter((permission) => isAdmin || !permission.adminOnly);
}

export function normalizeApiKeyPermissions(
  permissions: unknown,
  opts: { isAdmin?: boolean; fallback?: string[] } = {},
): string[] {
  const fallback = opts.fallback?.length ? opts.fallback : ["status"];
  const source = Array.isArray(permissions) ? permissions : fallback;
  const normalized: string[] = [];

  for (const value of source) {
    if (typeof value !== "string") continue;
    const permission = value.trim();
    if (!permission) continue;
    if (permission === ADMIN_PERMISSION) {
      if (opts.isAdmin) return [ADMIN_PERMISSION];
      continue;
    }
    if (permissionSet.has(permission) && !normalized.includes(permission)) {
      normalized.push(permission);
    }
  }

  return normalized.length > 0 ? normalized : normalizeApiKeyPermissions(fallback, opts);
}

export function toApiKeyView(doc: ApiKeyDoc): ApiKeyView {
  const { keyHash: _keyHash, ...view } = doc;
  return view;
}

function toPlainDoc(doc: ApiKeyDoc): ApiKeyDoc {
  return typeof (doc as any).toObject === "function" ? ((doc as any).toObject() as ApiKeyDoc) : doc;
}

/** 生成 API Key：返回明文（仅此一次）和 keyId */
export async function createApiKey(opts: {
  name: string;
  userId: string;
  permissions?: string[];
  rateLimit?: number;
  expiresInDays?: number | null;
  isAdmin?: boolean;
  billingEnabled?: boolean;
  billingMode?: "metered" | "prepaid";
  balanceCredits?: number;
}): Promise<{ keyId: string; plainKey: string }> {
  const randomPart = crypto.randomBytes(24).toString("base64url"); // 32 字符
  const keyId = `ak_${crypto.randomBytes(4).toString("hex")}`; // ak_xxxxxxxx
  const plainKey = `${keyId}.${randomPart}`;
  const keyHash = hashKey(plainKey);

  await ApiKeyModel.create({
    keyId,
    keyHash,
    name: opts.name,
    userId: opts.userId,
    permissions: normalizeApiKeyPermissions(opts.permissions, { isAdmin: opts.isAdmin }),
    rateLimit: opts.rateLimit ?? 60,
    expiresAt: opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86400000) : null,
    billingEnabled: opts.billingEnabled ?? true,
    billingMode: opts.billingMode === "prepaid" ? "prepaid" : "metered",
    balanceCredits: Math.max(Number(opts.balanceCredits) || 0, 0),
  });

  logger.info("[ApiKey] 创建 API Key", { keyId, userId: opts.userId, name: opts.name });
  return { keyId, plainKey };
}

/** 验证 API Key，返回文档或 null */
export async function validateApiKey(plainKey: string): Promise<ApiKeyDoc | null> {
  const hash = hashKey(plainKey);
  const doc = (await ApiKeyModel.findOne({ keyHash: hash }).lean()) as ApiKeyDoc | null;
  if (!doc) return null;
  if (!doc.enabled) return null;
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null;
  return doc;
}

/** 记录使用 */
export async function recordUsage(keyId: string, ip: string): Promise<void> {
  await ApiKeyModel.updateOne(
    { keyId },
    {
      $set: { lastUsedAt: new Date(), lastUsedIp: ip, updatedAt: new Date() },
      $inc: { usageCount: 1 },
    },
  );
}

/** 列出某用户的所有 Key */
export async function listUserKeys(userId: string): Promise<ApiKeyView[]> {
  const docs = (await ApiKeyModel.find({ userId }).sort({ createdAt: -1 }).lean()) as ApiKeyDoc[];
  return docs.map(toApiKeyView);
}

/** 列出所有 Key（管理员） */
export async function listAllKeys(): Promise<ApiKeyView[]> {
  const docs = (await ApiKeyModel.find().sort({ createdAt: -1 }).lean()) as ApiKeyDoc[];
  return docs.map(toApiKeyView);
}

/** 吊销（软删除：禁用） */
export async function revokeKey(keyId: string): Promise<boolean> {
  const result = await ApiKeyModel.updateOne({ keyId }, { $set: { enabled: false, updatedAt: new Date() } });
  logger.info("[ApiKey] 吊销 API Key", { keyId });
  return result.modifiedCount > 0;
}

/** 启用 */
export async function enableKey(keyId: string): Promise<boolean> {
  const result = await ApiKeyModel.updateOne({ keyId }, { $set: { enabled: true, updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

/** 硬删除 */
export async function deleteKey(keyId: string): Promise<boolean> {
  const result = await ApiKeyModel.deleteOne({ keyId });
  logger.info("[ApiKey] 删除 API Key", { keyId });
  return result.deletedCount > 0;
}

/** 更新权限/限流/名称 */
export async function updateKey(
  keyId: string,
  updates: {
    name?: string;
    permissions?: string[];
    rateLimit?: number;
    enabled?: boolean;
    expiresAt?: Date | null;
    billingEnabled?: boolean;
    billingMode?: "metered" | "prepaid";
  },
): Promise<ApiKeyView | null> {
  const doc = await ApiKeyModel.findOneAndUpdate(
    { keyId },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
  return doc ? toApiKeyView(toPlainDoc(doc as ApiKeyDoc)) : null;
}

function hashKey(plain: string): string {
  const salt = "api-key-static-salt";
  return crypto.scryptSync(plain, salt, 64).toString("hex");
}
