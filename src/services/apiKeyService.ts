import crypto from 'crypto';
import { ApiKeyModel, ApiKeyDoc } from '../models/apiKeyModel';
import logger from '../utils/logger';

/** 所有可分配的权限 */
export const ALL_PERMISSIONS = [
  'tts',          // TTS 生成
  'status',       // 系统状态查询
  'shorturl',     // 短链服务
  'media',        // 媒体接口
  'network',      // 网络工具
  'life',         // 生活服务
  'social',       // 社交接口
  'ipfs',         // IPFS 上传
  'data-process', // 数据处理
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

/** 生成 API Key：返回明文（仅此一次）和 keyId */
export async function createApiKey(opts: {
  name: string;
  userId: string;
  permissions?: string[];
  rateLimit?: number;
  expiresInDays?: number | null;
}): Promise<{ keyId: string; plainKey: string }> {
  const randomPart = crypto.randomBytes(24).toString('base64url'); // 32 字符
  const keyId = `ak_${crypto.randomBytes(4).toString('hex')}`; // ak_xxxxxxxx
  const plainKey = `${keyId}.${randomPart}`;
  const keyHash = hashKey(plainKey);

  await ApiKeyModel.create({
    keyId,
    keyHash,
    name: opts.name,
    userId: opts.userId,
    permissions: opts.permissions ?? ['status'],
    rateLimit: opts.rateLimit ?? 60,
    expiresAt: opts.expiresInDays ? new Date(Date.now() + opts.expiresInDays * 86400000) : null,
  });

  logger.info('[ApiKey] 创建 API Key', { keyId, userId: opts.userId, name: opts.name });
  return { keyId, plainKey };
}

/** 验证 API Key，返回文档或 null */
export async function validateApiKey(plainKey: string): Promise<ApiKeyDoc | null> {
  const hash = hashKey(plainKey);
  const doc = await ApiKeyModel.findOne({ keyHash: hash }).lean() as ApiKeyDoc | null;
  if (!doc) return null;
  if (!doc.enabled) return null;
  if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null;
  return doc;
}

/** 记录使用 */
export async function recordUsage(keyId: string, ip: string): Promise<void> {
  await ApiKeyModel.updateOne({ keyId }, {
    $set: { lastUsedAt: new Date(), lastUsedIp: ip, updatedAt: new Date() },
    $inc: { usageCount: 1 },
  });
}

/** 列出某用户的所有 Key */
export async function listUserKeys(userId: string): Promise<ApiKeyDoc[]> {
  return ApiKeyModel.find({ userId }).sort({ createdAt: -1 }).lean() as Promise<ApiKeyDoc[]>;
}

/** 列出所有 Key（管理员） */
export async function listAllKeys(): Promise<ApiKeyDoc[]> {
  return ApiKeyModel.find().sort({ createdAt: -1 }).lean() as Promise<ApiKeyDoc[]>;
}

/** 吊销（软删除：禁用） */
export async function revokeKey(keyId: string): Promise<boolean> {
  const result = await ApiKeyModel.updateOne({ keyId }, { $set: { enabled: false, updatedAt: new Date() } });
  logger.info('[ApiKey] 吊销 API Key', { keyId });
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
  logger.info('[ApiKey] 删除 API Key', { keyId });
  return result.deletedCount > 0;
}

/** 更新权限/限流/名称 */
export async function updateKey(keyId: string, updates: {
  name?: string;
  permissions?: string[];
  rateLimit?: number;
  enabled?: boolean;
}): Promise<ApiKeyDoc | null> {
  const doc = await ApiKeyModel.findOneAndUpdate(
    { keyId },
    { $set: { ...updates, updatedAt: new Date() } },
    { new: true },
  ).lean() as ApiKeyDoc | null;
  return doc;
}

function hashKey(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}
