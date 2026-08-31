/**
 * G4-19 管理端用户列表 aggregation 下推辅助
 *
 * 把筛选/排序/分页/统计的 aggregation pipeline 构建逻辑从 userService 拆出，
 * 避免 userService 越过 800 行硬闸门。本文件不依赖 userService 内部实现。
 */

export interface AdminUserListQueryParams {
  keyword: string;
  role: string;
  accountStatus: string;
  security: string;
  ticket: string;
  translation: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface AdminUserListStats {
  total: number;
  users: number;
  admins: number;
  superadmins: number;
  trusted: number;
  active: number;
  suspended: number;
  totpEnabled: number;
  passkeyEnabled: number;
  fingerprintRequired: number;
  withFingerprints: number;
  ticketViolated: number;
  ticketBanned: number;
  translationDisabled: number;
  translationLimited: number;
  totalDailyUsage: number;
}

export interface AdminUserListPageResult {
  users: any[];
  total: number;
  stats: AdminUserListStats;
  filteredStats: AdminUserListStats;
}

const ADMIN_USER_SORT_FIELD_MAP: Record<string, string> = {
  username: "username",
  email: "email",
  role: "role",
  accountStatus: "accountStatus",
  createdAt: "createdAt",
  dailyUsage: "dailyUsage",
  lastUsageDate: "lastUsageDate",
  lastLoginAt: "lastLoginAt",
  ticketViolationCount: "ticketViolationCount",
};

function escapeRegexInput(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildAdminUserMatchStage(q: AdminUserListQueryParams): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (q.role !== "all") and.push({ role: q.role });

  if (q.accountStatus === "suspended") and.push({ accountStatus: "suspended" });
  else if (q.accountStatus === "active") and.push({ accountStatus: { $ne: "suspended" } });

  if (q.keyword) {
    const kw = escapeRegexInput(q.keyword);
    and.push({
      $or: [
        { id: { $regex: kw, $options: "i" } },
        { username: { $regex: kw, $options: "i" } },
        { email: { $regex: kw, $options: "i" } },
        { role: { $regex: kw, $options: "i" } },
        { authProvider: { $regex: kw, $options: "i" } },
        { linuxdoId: { $regex: kw, $options: "i" } },
        { linuxdoUsername: { $regex: kw, $options: "i" } },
        { lastLoginIp: { $regex: kw, $options: "i" } },
      ],
    });
  }

  if (q.security === "totp") and.push({ totpEnabled: true });
  else if (q.security === "passkey") and.push({ passkeyEnabled: true });
  else if (q.security === "fingerprintRequired") and.push({ requireFingerprint: true });
  else if (q.security === "noMfa") {
    and.push({ $and: [{ totpEnabled: { $ne: true } }, { passkeyEnabled: { $ne: true } }] });
  }

  const nowIso = new Date().toISOString();
  if (q.ticket === "normal") {
    and.push({
      $expr: {
        $and: [
          { $lte: [{ $ifNull: ["$ticketViolationCount", 0] }, 0] },
          { $not: [{ $gt: ["$ticketBannedUntil", nowIso] }] },
        ],
      },
    });
  } else if (q.ticket === "violated") {
    and.push({ $expr: { $gt: [{ $ifNull: ["$ticketViolationCount", 0] }, 0] } });
  } else if (q.ticket === "banned") {
    and.push({ $expr: { $gt: ["$ticketBannedUntil", nowIso] } });
  }

  if (q.translation === "enabled") and.push({ isTranslationEnabled: { $ne: false } });
  else if (q.translation === "disabled") and.push({ isTranslationEnabled: false });
  else if (q.translation === "limited") and.push({ $expr: { $gt: ["$translationAccessUntil", nowIso] } });

  return and.length > 0 ? { $and: and } : {};
}

export function buildAdminUserStatsGroup(nowIso: string): Record<string, unknown> {
  return {
    _id: null,
    total: { $sum: 1 },
    users: { $sum: { $cond: [{ $eq: ["$role", "user"] }, 1, 0] } },
    admins: { $sum: { $cond: [{ $eq: ["$role", "admin"] }, 1, 0] } },
    superadmins: { $sum: { $cond: [{ $eq: ["$role", "superadmin"] }, 1, 0] } },
    trusted: { $sum: { $cond: [{ $eq: ["$role", "trusted"] }, 1, 0] } },
    active: { $sum: { $cond: [{ $eq: ["$accountStatus", "suspended"] }, 0, 1] } },
    suspended: { $sum: { $cond: [{ $eq: ["$accountStatus", "suspended"] }, 1, 0] } },
    totpEnabled: { $sum: { $cond: [{ $eq: ["$totpEnabled", true] }, 1, 0] } },
    passkeyEnabled: { $sum: { $cond: [{ $eq: ["$passkeyEnabled", true] }, 1, 0] } },
    fingerprintRequired: { $sum: { $cond: [{ $eq: ["$requireFingerprint", true] }, 1, 0] } },
    withFingerprints: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ["$fingerprints", []] } }, 0] }, 1, 0] } },
    ticketViolated: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$ticketViolationCount", 0] }, 0] }, 1, 0] } },
    ticketBanned: { $sum: { $cond: [{ $gt: ["$ticketBannedUntil", nowIso] }, 1, 0] } },
    translationDisabled: { $sum: { $cond: [{ $eq: ["$isTranslationEnabled", false] }, 1, 0] } },
    translationLimited: { $sum: { $cond: [{ $gt: ["$translationAccessUntil", nowIso] }, 1, 0] } },
    totalDailyUsage: { $sum: { $ifNull: ["$dailyUsage", 0] } },
  };
}

export const EMPTY_ADMIN_USER_STATS: AdminUserListStats = {
  total: 0,
  users: 0,
  admins: 0,
  superadmins: 0,
  trusted: 0,
  active: 0,
  suspended: 0,
  totpEnabled: 0,
  passkeyEnabled: 0,
  fingerprintRequired: 0,
  withFingerprints: 0,
  ticketViolated: 0,
  ticketBanned: 0,
  translationDisabled: 0,
  translationLimited: 0,
  totalDailyUsage: 0,
};

export function normalizeAdminUserStats(raw: unknown): AdminUserListStats {
  if (!raw || typeof raw !== "object") return { ...EMPTY_ADMIN_USER_STATS };
  const record = raw as Record<string, unknown>;
  const pick = (key: string): number => {
    const v = Number(record[key]);
    return Number.isFinite(v) ? v : 0;
  };
  return {
    total: pick("total"),
    users: pick("users"),
    admins: pick("admins"),
    superadmins: pick("superadmins"),
    trusted: pick("trusted"),
    active: pick("active"),
    suspended: pick("suspended"),
    totpEnabled: pick("totpEnabled"),
    passkeyEnabled: pick("passkeyEnabled"),
    fingerprintRequired: pick("fingerprintRequired"),
    withFingerprints: pick("withFingerprints"),
    ticketViolated: pick("ticketViolated"),
    ticketBanned: pick("ticketBanned"),
    translationDisabled: pick("translationDisabled"),
    translationLimited: pick("translationLimited"),
    totalDailyUsage: pick("totalDailyUsage"),
  };
}

export function getAdminUserSortField(query: AdminUserListQueryParams): string {
  return ADMIN_USER_SORT_FIELD_MAP[query.sortBy] || "createdAt";
}
