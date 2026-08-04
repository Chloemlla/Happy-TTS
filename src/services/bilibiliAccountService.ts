import { BilibiliSyncModel } from "../models/bilibiliSyncModel";
import { BilibiliAccountBindingModel, type BilibiliAccountBindingDoc, type BilibiliAccountClientIdentity } from "../models/bilibiliAccountBindingModel";
import { BilibiliSyncError, encryptCredential, normalizeUid, verifyBilibiliCookie } from "./bilibiliSyncService";

export const MAX_DEVICE_BYTES = 16 * 1024;
export const MAX_PERMISSIONS_ENTRIES = 512;
export const MAX_ACCOUNTS_PER_USER = 64;

export interface BilibiliAccountUpsertInput {
  uid: string;
  cookie: string;
  isPrimary?: boolean;
  device?: unknown;
  permissions?: unknown;
  client?: unknown;
}

export interface BilibiliAccountView {
  uid: string;
  status: "active" | "invalid";
  isPrimary: boolean;
  boundAt: string;
  lastSyncedAt: string;
  deviceSummary: Record<string, unknown>;
  permissionsCount: number;
  client: BilibiliAccountClientIdentity;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: number }).code === 11000);
}

function normalizeDevice(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    throw new BilibiliSyncError("设备信息必须是 JSON 对象", "BILIBILI_DEVICE_INVALID");
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_DEVICE_BYTES) {
    throw new BilibiliSyncError("设备信息超出大小限制", "BILIBILI_DEVICE_TOO_LARGE");
  }
  return value;
}

function normalizePermissions(value: unknown): Record<string, string> {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    throw new BilibiliSyncError("权限清单必须是 JSON 对象", "BILIBILI_PERMISSIONS_INVALID");
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_PERMISSIONS_ENTRIES) {
    throw new BilibiliSyncError("权限清单超出数量限制", "BILIBILI_PERMISSIONS_TOO_LARGE");
  }
  const normalized: Record<string, string> = {};
  for (const [key, status] of entries) {
    const name = key.slice(0, 128);
    normalized[name] = typeof status === "string" ? status.slice(0, 64) : "unknown";
  }
  return normalized;
}

function normalizeClient(value: unknown): BilibiliAccountClientIdentity {
  if (!isPlainObject(value)) return {};
  const text = (key: string): string | undefined => {
    const raw = value[key];
    return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 256) : undefined;
  };
  return {
    clientId: text("client_id") ?? text("clientId"),
    clientName: text("client_name") ?? text("clientName"),
    clientVersion: text("client_version") ?? text("clientVersion"),
    clientBuild: text("client_build") ?? text("clientBuild"),
    deviceId: text("device_id") ?? text("deviceId"),
    deviceName: text("device_name") ?? text("deviceName"),
    platform: text("platform"),
  };
}

function deviceSummary(device: Record<string, unknown>): Record<string, unknown> {
  const pick = (key: string): unknown => device[key];
  return {
    platform: pick("platform") ?? pick("os"),
    model: pick("model"),
    brand: pick("brand") ?? pick("manufacturer"),
    appVersion: pick("appVersion") ?? pick("versionName"),
    sdkInt: pick("sdkInt"),
    isTablet: pick("isTablet") ?? pick("formFactor"),
  };
}

function toView(doc: Pick<BilibiliAccountBindingDoc, "bilibiliUid" | "credentialStatus" | "isPrimary" | "uidBoundAt" | "lastSyncedAt" | "device" | "permissions" | "client">): BilibiliAccountView {
  return {
    uid: doc.bilibiliUid,
    status: doc.credentialStatus,
    isPrimary: doc.isPrimary,
    boundAt: new Date(doc.uidBoundAt).toISOString(),
    lastSyncedAt: new Date(doc.lastSyncedAt).toISOString(),
    deviceSummary: deviceSummary(doc.device || {}),
    permissionsCount: Object.keys(doc.permissions || {}).length,
    client: doc.client || {},
  };
}

async function mirrorLegacyPrimary(userId: string, uid: string, credential: ReturnType<typeof encryptCredential>): Promise<void> {
  const legacy = await BilibiliSyncModel.findOne({ userId }).select("bilibiliUid").lean<{ bilibiliUid?: string } | null>();
  if (legacy?.bilibiliUid && legacy.bilibiliUid !== uid) return;
  const now = new Date();
  try {
    await BilibiliSyncModel.updateOne(
      { userId },
      {
        $set: {
          bilibiliUid: uid,
          uidBoundAt: now,
          ...credential,
          credentialStatus: "active",
          credentialValidatedAt: now,
          credentialLastCheckedAt: now,
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // Another Synapse user holds this uid as the legacy primary. The vault
    // binding still applies; only the legacy mirror is skipped.
    if (!isDuplicateKeyError(error)) throw error;
  }
}

async function clearLegacyPrimaryIfNeeded(userId: string, uid: string): Promise<void> {
  const legacy = await BilibiliSyncModel.findOne({ userId }).select("bilibiliUid").lean<{ bilibiliUid?: string } | null>();
  if (!legacy?.bilibiliUid || legacy.bilibiliUid !== uid) return;
  await BilibiliSyncModel.updateOne(
    { userId },
    {
      $unset: { bilibiliUid: 1, credentialCiphertext: 1, credentialIv: 1, credentialTag: 1, credentialKeyVersion: 1 },
      $set: { uidBoundAt: null, credentialStatus: "invalid", credentialValidatedAt: null, credentialLastCheckedAt: new Date() },
    },
  );
}

export async function upsertBilibiliAccount(userId: string, input: BilibiliAccountUpsertInput): Promise<{ bound: true; uid: string; status: "active"; isPrimary: boolean }> {
  const uid = normalizeUid(input.uid);
  if (typeof input.cookie !== "string" || !input.cookie.trim()) {
    throw new BilibiliSyncError("需要当前 Bilibili 登录 Cookie", "BILIBILI_COOKIE_REQUIRED", 401);
  }
  try {
    await verifyBilibiliCookie(input.cookie, uid);
  } catch (error) {
    await BilibiliAccountBindingModel.updateOne(
      { userId, bilibiliUid: uid },
      { $set: { credentialStatus: "invalid", credentialLastCheckedAt: new Date() } },
    );
    throw error;
  }

  const device = normalizeDevice(input.device);
  const permissions = normalizePermissions(input.permissions);
  const client = normalizeClient(input.client);
  const isPrimary = input.isPrimary === true;
  const now = new Date();
  const credential = encryptCredential(input.cookie);

  const doc = await BilibiliAccountBindingModel.findOneAndUpdate(
    { userId, bilibiliUid: uid },
    {
      $set: {
        isPrimary,
        uidBoundAt: now,
        ...credential,
        credentialStatus: "active",
        credentialValidatedAt: now,
        credentialLastCheckedAt: now,
        device,
        permissions,
        client,
        lastSyncedAt: now,
      },
      $setOnInsert: { userId, bilibiliUid: uid },
    },
    { upsert: true, returnDocument: "after" },
  ).select("+credentialCiphertext +credentialIv +credentialTag +credentialKeyVersion");

  if (!doc) throw new BilibiliSyncError("保存 Bilibili 账号绑定失败", "BILIBILI_ACCOUNT_SAVE_FAILED", 500);

  if (isPrimary) {
    await mirrorLegacyPrimary(userId, uid, credential);
  }
  return { bound: true, uid, status: "active", isPrimary };
}

export async function listBilibiliAccounts(userId: string): Promise<{ accounts: BilibiliAccountView[] }> {
  const docs = await BilibiliAccountBindingModel.find({ userId })
    .select("bilibiliUid credentialStatus isPrimary uidBoundAt lastSyncedAt device permissions client")
    .sort({ isPrimary: -1, lastSyncedAt: -1 })
    .lean<Pick<BilibiliAccountBindingDoc, "bilibiliUid" | "credentialStatus" | "isPrimary" | "uidBoundAt" | "lastSyncedAt" | "device" | "permissions" | "client">[]>();
  return { accounts: docs.map(toView) };
}

export async function removeBilibiliAccount(userId: string, rawUid: unknown): Promise<{ removed: boolean; uid: string }> {
  const uid = normalizeUid(rawUid);
  const result = await BilibiliAccountBindingModel.deleteOne({ userId, bilibiliUid: uid });
  if (result.deletedCount > 0) {
    await clearLegacyPrimaryIfNeeded(userId, uid);
  }
  return { removed: result.deletedCount > 0, uid };
}

export async function pruneBilibiliAccounts(userId: string, rawActiveUids: unknown): Promise<{ removed: string[]; activeCount: number }> {
  if (!Array.isArray(rawActiveUids)) {
    throw new BilibiliSyncError("activeUids 必须是数组", "BILIBILI_ACCOUNT_LIST_INVALID");
  }
  if (rawActiveUids.length > MAX_ACCOUNTS_PER_USER) {
    throw new BilibiliSyncError("账号数量超出限制", "BILIBILI_ACCOUNT_LIST_TOO_LARGE");
  }
  const activeUids = new Set<string>();
  for (const raw of rawActiveUids) {
    if (typeof raw === "string" && raw.trim()) {
      activeUids.add(normalizeUid(raw));
    }
  }
  const docs = await BilibiliAccountBindingModel.find({ userId }).select("bilibiliUid").lean<{ bilibiliUid: string }[]>();
  const stale = docs
    .map((doc) => doc.bilibiliUid)
    .filter((uid) => uid && !activeUids.has(uid));
  if (stale.length > 0) {
    await BilibiliAccountBindingModel.deleteMany({ userId, bilibiliUid: { $in: stale } });
    for (const uid of stale) {
      await clearLegacyPrimaryIfNeeded(userId, uid);
    }
  }
  return { removed: stale, activeCount: activeUids.size };
}
