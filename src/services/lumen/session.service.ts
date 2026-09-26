/**
 * Project-Lumen 侧的「设备与会话」（S-03）。
 *
 * 与 `src/services/authSessionService.ts` 的 `listAuthDevices` / `revokeAuthDevice`
 * 形状保持一致（deviceKey 40 位十六进制、按 deviceKey 分组、当前设备不可撤销），
 * 这样两个账号体系在前端可以共用同一套展示与交互逻辑。
 *
 * 关键差异（必须记住，否则会写出跨库串号的代码）：lumen 会话的 `_id` **就是**访问令牌本体，
 * 所以「撤销」在这里等于删除文档，而不是打 revokedAt 标记；用户也是 lumen/User，
 * 与 Synapse 的 auth_sessions 没有任何 ID 关联。
 */
import { Session, type ISession } from "../../models/lumen/index.js";
import { deriveLumenDeviceKey } from "../../utils/lumenClientIdentity";
import logger from "../../utils/logger.js";

export interface LumenSessionView {
  sessionId: string;
  deviceKey: string;
  deviceInstallationId: string | null;
  deviceName: string;
  platform: string;
  clientType: string;
  recentActivityAt: string;
  ipAddress: string | null;
  current: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface LumenDeviceView {
  deviceKey: string;
  deviceId: string | null;
  deviceName: string;
  platform: string;
  clientType: string;
  recentActivityAt: string;
  ipAddress: string | null;
  current: boolean;
  sessions: LumenSessionView[];
}

export class LumenSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "SESSION_NOT_FOUND" | "CURRENT_SESSION_PROTECTED" = "SESSION_NOT_FOUND",
  ) {
    super(message);
    this.name = "LumenSessionError";
  }
}

function toIso(value: Date | number | undefined | null): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function deviceKeyOf(userId: string, doc: ISession): string {
  return deriveLumenDeviceKey(userId, doc.clientType, doc.deviceInstallationId, doc.userAgent);
}

export async function listLumenDevices(userId: string, currentAccessToken?: string): Promise<LumenDeviceView[]> {
  const docs = (await Session.find({ userId, expiresAt: { $gt: new Date() } })
    .sort({ lastActiveAt: -1, lastUsedAt: -1, createdAt: -1 })
    .lean()) as unknown as ISession[];

  const groups = new Map<string, LumenDeviceView>();
  for (const doc of docs) {
    const deviceKey = deviceKeyOf(userId, doc);
    const current = Boolean(currentAccessToken) && doc._id === currentAccessToken;
    const view: LumenSessionView = {
      sessionId: doc._id,
      deviceKey,
      deviceInstallationId: doc.deviceInstallationId ?? null,
      deviceName: doc.deviceName || doc.platform || "Project-Lumen",
      platform: doc.platform || "未知平台",
      clientType: doc.clientType || "other",
      recentActivityAt: toIso(doc.lastActiveAt ?? doc.lastUsedAt ?? doc.createdAt),
      ipAddress: doc.ipAddress ?? null,
      current,
      createdAt: toIso(doc.createdAt),
      expiresAt: toIso(doc.expiresAt),
    };

    const group = groups.get(deviceKey);
    if (!group) {
      groups.set(deviceKey, {
        deviceKey,
        deviceId: view.deviceInstallationId,
        deviceName: view.deviceName,
        platform: view.platform,
        clientType: view.clientType,
        recentActivityAt: view.recentActivityAt,
        ipAddress: view.ipAddress,
        current,
        sessions: [view],
      });
      continue;
    }
    group.sessions.push(view);
    group.current ||= current;
    // 组内取最近活动的那条作为代表；上面的排序保证第一条就是最新的。
    if (new Date(view.recentActivityAt).getTime() > new Date(group.recentActivityAt).getTime()) {
      group.recentActivityAt = view.recentActivityAt;
      group.ipAddress = view.ipAddress;
    }
  }

  return [...groups.values()];
}

export async function revokeLumenDevice(
  userId: string,
  deviceKey: string,
  currentAccessToken?: string,
): Promise<{ revoked: number }> {
  const docs = (await Session.find({ userId }).lean()) as unknown as ISession[];
  const matching = docs.filter((doc) => deviceKeyOf(userId, doc) === deviceKey);
  if (matching.length === 0) {
    throw new LumenSessionError("设备会话不存在", "SESSION_NOT_FOUND");
  }

  if (currentAccessToken && matching.some((doc) => doc._id === currentAccessToken)) {
    // 与 auth_sessions 同语义：撤销当前设备会把调用者自己踢下线，必须拒绝。
    throw new LumenSessionError("当前会话不可撤销", "CURRENT_SESSION_PROTECTED");
  }

  const ids = matching.map((doc) => doc._id);
  const result = await Session.deleteMany({ userId, _id: { $in: ids } });
  const revoked = Number(result.deletedCount || 0);
  logger.info("[LumenSessions] Revoked device sessions", { userId, deviceKey, revoked });
  return { revoked };
}
