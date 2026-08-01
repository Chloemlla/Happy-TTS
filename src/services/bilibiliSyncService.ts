import crypto from "node:crypto";
import axios from "axios";
import { BilibiliSyncModel, type BilibiliSearchRecord, type BilibiliSyncDoc, type BilibiliSyncSettings } from "../models/bilibiliSyncModel";
import { config } from "../config/config";

export const BILIBILI_UID_PATTERN = /^\d{1,12}$/;
export const MAX_SETTINGS_BYTES = 64 * 1024;
export const MAX_SEARCH_BATCH_SIZE = 100;
export const MAX_SEARCH_RECORDS = 1000;
export const MAX_SEARCH_KEYWORD_LENGTH = 256;
export const MAX_SEARCH_RECORD_ID_LENGTH = 128;
const CREDENTIAL_ALGO = "aes-256-gcm";
const CREDENTIAL_KEY_VERSION = "v1";

export class BilibiliSyncError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BilibiliSyncError";
  }
}

export interface BilibiliSearchRecordInput {
  id: string;
  keyword: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt: string | null;
}

export interface BilibiliSearchRecordView extends Omit<BilibiliSearchRecord, "serverUpdatedAt" | "dedupeKey"> {
  serverUpdatedAt: string;
  category: "searchHistory";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveSettingKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized.includes("password") ||
    normalized.includes("cookie") ||
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("apikey") ||
    normalized.includes("accesskey") ||
    normalized.includes("privatekey") ||
    normalized.includes("sessdata") ||
    normalized.includes("bilijct") ||
    normalized.includes("dedeuserid") ||
    normalized === "authorization";
}

function sanitizeSettingValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeSettingValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveSettingKey(key))
      .map(([key, nested]) => [key, sanitizeSettingValue(nested)]),
  );
}

function credentialKey(): Buffer {
  return crypto.createHash("sha256").update(process.env.BILIBILI_COOKIE_ENCRYPTION_KEY || process.env.PASSWORD_ENCRYPTION_KEY || process.env.AES_KEY || config.jwtSecret).digest();
}

function encryptCredential(cookie: string): { credentialCiphertext: string; credentialIv: string; credentialTag: string; credentialKeyVersion: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CREDENTIAL_ALGO, credentialKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(cookie, "utf8"), cipher.final()]);
  return {
    credentialCiphertext: ciphertext.toString("base64"),
    credentialIv: iv.toString("base64"),
    credentialTag: cipher.getAuthTag().toString("base64"),
    credentialKeyVersion: CREDENTIAL_KEY_VERSION,
  };
}

function decryptCredential(doc: BilibiliSyncDoc): string {
  if (doc.credentialKeyVersion !== CREDENTIAL_KEY_VERSION || !doc.credentialCiphertext || !doc.credentialIv || !doc.credentialTag) {
    throw new BilibiliSyncError("Bilibili 凭据不可用", "BILIBILI_CREDENTIAL_INVALID", 403);
  }
  const decipher = crypto.createDecipheriv(CREDENTIAL_ALGO, credentialKey(), Buffer.from(doc.credentialIv, "base64"));
  decipher.setAuthTag(Buffer.from(doc.credentialTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(doc.credentialCiphertext, "base64")), decipher.final()]).toString("utf8");
}

async function verifyBilibiliCookie(cookie: string, expectedUid: string): Promise<void> {
  if (!cookie.trim() || cookie.length > 8192) throw new BilibiliSyncError("Bilibili 登录凭据无效", "BILIBILI_COOKIE_INVALID", 401);
  try {
    const response = await axios.get("https://api.bilibili.com/x/web-interface/nav", {
      headers: { Cookie: cookie, "User-Agent": "PiliPlus/Synapse sync verifier" },
      timeout: 8000,
      validateStatus: () => true,
    });
    const data = response.data?.data;
    if (response.status !== 200 || response.data?.code !== 0 || data?.isLogin !== true || String(data?.mid) !== expectedUid) {
      throw new Error("identity mismatch");
    }
  } catch (_error) {
    throw new BilibiliSyncError("Bilibili 登录凭据校验失败", "BILIBILI_COOKIE_INVALID", 401);
  }
}

async function requireActiveCredential(userId: string): Promise<BilibiliSyncDoc> {
  const doc = await BilibiliSyncModel.findOne({ userId }).select("+credentialCiphertext +credentialIv +credentialTag +credentialKeyVersion").lean<BilibiliSyncDoc | null>();
  if (!doc?.bilibiliUid || doc.credentialStatus !== "active") throw new BilibiliSyncError("请先绑定有效的 Bilibili 账号", "BILIBILI_BIND_REQUIRED", 403);
  try {
    const cookie = decryptCredential(doc);
    await verifyBilibiliCookie(cookie, doc.bilibiliUid);
    await BilibiliSyncModel.updateOne({ userId }, { $set: { credentialLastCheckedAt: new Date() } });
    return doc;
  } catch (error) {
    await BilibiliSyncModel.updateOne({ userId }, { $set: { credentialStatus: "invalid", credentialLastCheckedAt: new Date() } });
    if (error instanceof BilibiliSyncError) throw error;
    throw new BilibiliSyncError("Bilibili 登录凭据不可用", "BILIBILI_CREDENTIAL_INVALID", 403);
  }
}

function normalizeUid(value: unknown): string {
  if (typeof value !== "string") {
    throw new BilibiliSyncError("Bilibili UID 必须是数字字符串", "BILIBILI_UID_INVALID");
  }

  const uid = value.trim();
  if (!BILIBILI_UID_PATTERN.test(uid) || Number(uid) <= 0) {
    throw new BilibiliSyncError("Bilibili UID 格式无效", "BILIBILI_UID_INVALID");
  }

  return uid;
}

function normalizeDedupeKey(keyword: string): string {
  return keyword.trim().toLocaleLowerCase();
}

function parseDate(value: unknown, field: string, fallback: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new BilibiliSyncError(`${field} 必须是有效的 ISO 8601 时间`, "BILIBILI_SYNC_INVALID_DATE");
  }
  return new Date(value).toISOString();
}

function validateSettings(settings: unknown): BilibiliSyncSettings {
  if (!isPlainObject(settings)) {
    throw new BilibiliSyncError("settings 必须是 JSON 对象", "BILIBILI_SETTINGS_INVALID");
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(settings);
  } catch (_error) {
    throw new BilibiliSyncError("settings 必须是可序列化的 JSON 对象", "BILIBILI_SETTINGS_INVALID");
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_SETTINGS_BYTES) {
    throw new BilibiliSyncError("settings 超出大小限制", "BILIBILI_SETTINGS_TOO_LARGE");
  }

  return sanitizeSettingValue(settings) as BilibiliSyncSettings;
}

function validateBaseVersion(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new BilibiliSyncError("baseVersion 必须是非负整数", "BILIBILI_SETTINGS_VERSION_INVALID");
  }
  return value as number;
}

function validateSearchRecord(input: unknown, now: string): BilibiliSearchRecordInput {
  if (!isPlainObject(input)) {
    throw new BilibiliSyncError("搜索记录必须是对象", "BILIBILI_SEARCH_RECORD_INVALID");
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
  if (!id || id.length > MAX_SEARCH_RECORD_ID_LENGTH) {
    throw new BilibiliSyncError("搜索记录 id 无效", "BILIBILI_SEARCH_RECORD_INVALID");
  }
  if (!keyword || keyword.length > MAX_SEARCH_KEYWORD_LENGTH) {
    throw new BilibiliSyncError("搜索关键词无效", "BILIBILI_SEARCH_RECORD_INVALID");
  }

  return {
    id,
    keyword,
    createdAt: parseDate(input.createdAt, "createdAt", now),
    updatedAt: parseDate(input.updatedAt, "updatedAt", now),
    isDeleted: input.isDeleted === true,
    deletedAt:
      input.deletedAt === undefined || input.deletedAt === null ? null : parseDate(input.deletedAt, "deletedAt", now),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

function toView(record: BilibiliSearchRecord): BilibiliSearchRecordView {
  return {
    id: record.id,
    keyword: record.keyword,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isDeleted: record.isDeleted,
    deletedAt: record.deletedAt,
    serverUpdatedAt: new Date(record.serverUpdatedAt).toISOString(),
    category: "searchHistory",
  };
}

function settingsSummary(settings: BilibiliSyncSettings): { keys: string[]; sizeBytes: number } {
  const serialized = JSON.stringify(settings);
  return {
    keys: Object.keys(settings).sort(),
    sizeBytes: Buffer.byteLength(serialized, "utf8"),
  };
}

async function ensureDocument(userId: string): Promise<BilibiliSyncDoc> {
  const doc = await BilibiliSyncModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, settingsVersion: 0, settings: {}, searchRecords: [] } },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error("无法初始化 Bilibili 同步文档");
  return doc as BilibiliSyncDoc;
}

export async function getBilibiliUid(userId: string): Promise<{ bound: boolean; uid: string | null; boundAt: string | null }> {
  const doc = await BilibiliSyncModel.findOne({ userId }).select("bilibiliUid uidBoundAt credentialStatus").lean<BilibiliSyncDoc | null>();
  return {
    bound: Boolean(doc?.bilibiliUid && doc.credentialStatus === "active"),
    uid: doc?.bilibiliUid || null,
    boundAt: doc?.uidBoundAt ? new Date(doc.uidBoundAt).toISOString() : null,
  };
}

export async function bindBilibiliUid(userId: string, rawUid: unknown, rawCookie: unknown): Promise<{ bound: true; uid: string; boundAt: string }> {
  const uid = normalizeUid(rawUid);
  if (typeof rawCookie !== "string" || !rawCookie.trim()) throw new BilibiliSyncError("需要当前 Bilibili 登录 Cookie", "BILIBILI_COOKIE_REQUIRED", 401);
  try {
    await verifyBilibiliCookie(rawCookie, uid);
  } catch (error) {
    await BilibiliSyncModel.updateOne(
      { userId, bilibiliUid: uid },
      { $set: { credentialStatus: "invalid", credentialLastCheckedAt: new Date() } },
    );
    throw error;
  }
  const current = await BilibiliSyncModel.findOne({ userId }).select("bilibiliUid").lean<BilibiliSyncDoc | null>();
  if (current?.bilibiliUid && current.bilibiliUid !== uid) {
    throw new BilibiliSyncError("当前账号已绑定另一个 Bilibili UID，请先解绑", "BILIBILI_UID_ALREADY_BOUND", 409);
  }
  const owner = await BilibiliSyncModel.findOne({ bilibiliUid: uid, userId: { $ne: userId } }).select("userId").lean();
  if (owner) {
    throw new BilibiliSyncError("该 Bilibili UID 已被其他账号绑定", "BILIBILI_UID_CONFLICT", 409);
  }

  const boundAt = new Date();
  try {
    const doc = await BilibiliSyncModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          bilibiliUid: uid,
          uidBoundAt: boundAt,
          ...encryptCredential(rawCookie),
          credentialStatus: "active",
          credentialValidatedAt: boundAt,
          credentialLastCheckedAt: boundAt,
        },
        $setOnInsert: { userId, settings: {}, settingsVersion: 0, searchRecords: [] },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!doc) throw new Error("绑定 Bilibili UID 失败");
    return { bound: true, uid, boundAt: new Date((doc as BilibiliSyncDoc).uidBoundAt || boundAt).toISOString() };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new BilibiliSyncError("该 Bilibili UID 已被其他账号绑定", "BILIBILI_UID_CONFLICT", 409);
    }
    throw error;
  }
}

export async function unbindBilibiliUid(userId: string): Promise<{ bound: false; uid: null; boundAt: null }> {
  await BilibiliSyncModel.updateOne({ userId }, { $unset: { bilibiliUid: 1, credentialCiphertext: 1, credentialIv: 1, credentialTag: 1, credentialKeyVersion: 1 }, $set: { uidBoundAt: null, credentialStatus: "invalid", credentialValidatedAt: null, credentialLastCheckedAt: new Date() } });
  return { bound: false, uid: null, boundAt: null };
}

export async function getBilibiliSettings(userId: string): Promise<{ settings: BilibiliSyncSettings; version: number; updatedAt: string | null }> {
  await requireActiveCredential(userId);
  const doc = await BilibiliSyncModel.findOne({ userId }).select("settings settingsVersion settingsUpdatedAt").lean<BilibiliSyncDoc | null>();
  return {
    settings: sanitizeSettingValue(doc?.settings || {}) as BilibiliSyncSettings,
    version: doc?.settingsVersion || 0,
    updatedAt: doc?.settingsUpdatedAt ? new Date(doc.settingsUpdatedAt).toISOString() : null,
  };
}

export async function updateBilibiliSettings(
  userId: string,
  rawSettings: unknown,
  rawBaseVersion: unknown,
  includeSummary: boolean,
): Promise<{ settings: BilibiliSyncSettings; version: number; updatedAt: string }> {
  await requireActiveCredential(userId);
  const settings = validateSettings(rawSettings);
  const baseVersion = validateBaseVersion(rawBaseVersion);
  const now = new Date();
  await ensureDocument(userId);

  const updated = await BilibiliSyncModel.findOneAndUpdate(
    { userId, settingsVersion: baseVersion },
    { $set: { settings, settingsUpdatedAt: now }, $inc: { settingsVersion: 1 } },
    { returnDocument: "after" },
  ).lean<BilibiliSyncDoc | null>();

  if (!updated) {
    const current = await getBilibiliSettings(userId);
    throw new BilibiliSyncError("settings 版本冲突", "BILIBILI_SETTINGS_CONFLICT", 409, {
      currentVersion: current.version,
      currentUpdatedAt: current.updatedAt,
      ...(includeSummary ? { settingsSummary: settingsSummary(current.settings) } : {}),
    });
  }

  return {
    settings,
    version: updated.settingsVersion,
    updatedAt: new Date(updated.settingsUpdatedAt || now).toISOString(),
  };
}

export async function upsertBilibiliSearchRecords(
  userId: string,
  rawRecords: unknown,
): Promise<{ accepted: number; ignored: number; deduplicated: number; pruned: number; serverTime: string }> {
  await requireActiveCredential(userId);
  if (!Array.isArray(rawRecords) || rawRecords.length === 0 || rawRecords.length > MAX_SEARCH_BATCH_SIZE) {
    throw new BilibiliSyncError(`records 数量必须为 1-${MAX_SEARCH_BATCH_SIZE}`, "BILIBILI_SEARCH_BATCH_INVALID");
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const inputRecords = rawRecords.map((record) => validateSearchRecord(record, nowIso));
  const deduped = new Map<string, BilibiliSearchRecordInput>();
  let deduplicated = 0;
  for (const record of inputRecords) {
    const key = normalizeDedupeKey(record.keyword);
    const previous = deduped.get(key);
    if (previous) deduplicated += 1;
    if (!previous || record.updatedAt >= previous.updatedAt || record.isDeleted) deduped.set(key, record);
  }

  const doc = await ensureDocument(userId);
  const records = [...((doc.searchRecords || []) as BilibiliSearchRecord[])];
  let accepted = 0;
  let ignored = 0;
  for (const incoming of deduped.values()) {
    const incomingKey = normalizeDedupeKey(incoming.keyword);
    const existingIndex = records.findIndex((item) => item.id === incoming.id || item.dedupeKey === incomingKey);
    const next: BilibiliSearchRecord = {
      ...incoming,
      dedupeKey: incomingKey,
      deletedAt: incoming.isDeleted ? incoming.deletedAt || nowIso : null,
      serverUpdatedAt: now,
    };
    if (existingIndex < 0) {
      records.push(next);
      accepted += 1;
      continue;
    }

    const existing = records[existingIndex];
    if (incoming.updatedAt >= existing.updatedAt || incoming.isDeleted) {
      records[existingIndex] = next;
      accepted += 1;
    } else {
      ignored += 1;
    }
  }

  records.sort((a, b) => new Date(b.serverUpdatedAt).getTime() - new Date(a.serverUpdatedAt).getTime());
  const pruned = Math.max(0, records.length - MAX_SEARCH_RECORDS);
  records.splice(MAX_SEARCH_RECORDS);
  await BilibiliSyncModel.updateOne({ userId }, { $set: { searchRecords: records } });

  return { accepted, ignored, deduplicated, pruned, serverTime: nowIso };
}

export async function getBilibiliSearchChanges(
  userId: string,
  since: string,
  rawLimit: unknown,
): Promise<{ records: BilibiliSearchRecordView[]; serverTime: string; nextSince: string; hasMore: boolean }> {
  await requireActiveCredential(userId);
  if (typeof since !== "string" || Number.isNaN(Date.parse(since))) {
    throw new BilibiliSyncError("since 必须是有效的 ISO 8601 时间", "BILIBILI_SYNC_INVALID_SINCE");
  }
  const limit = rawLimit === undefined ? 200 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new BilibiliSyncError("limit 必须是 1-200 的整数", "BILIBILI_SYNC_INVALID_LIMIT");
  }

  const serverTime = new Date().toISOString();
  const doc = await BilibiliSyncModel.findOne({ userId }).select("searchRecords").lean<BilibiliSyncDoc | null>();
  const sinceMs = Date.parse(since);
  const serverTimeMs = Date.parse(serverTime);
  const changed = ((doc?.searchRecords || []) as BilibiliSearchRecord[])
    .filter((record) => {
      const updatedAt = new Date(record.serverUpdatedAt).getTime();
      return updatedAt > sinceMs && updatedAt <= serverTimeMs;
    })
    .sort((a, b) => {
      const byTime = new Date(a.serverUpdatedAt).getTime() - new Date(b.serverUpdatedAt).getTime();
      return byTime || a.id.localeCompare(b.id);
    });
  const page = changed.slice(0, limit);
  return {
    records: page.map(toView),
    serverTime,
    nextSince: serverTime,
    hasMore: changed.length > limit,
  };
}
