import type { Request } from "express";
import { buildAccountSecuritySummary } from "../services/accountSecuritySummaryService";
import type { User } from "../utils/userStorage";

export type AdminUserRecord = User & {
  ticketBanned?: boolean;
};

type SensitiveUserFields =
  | "password"
  | "passwordHash"
  | "passwordCiphertext"
  | "passwordIv"
  | "passwordTag"
  | "passwordKeyVersion"
  | "passwordWrappedDek"
  | "passwordDekId";

export type SanitizedAdminUser = Omit<AdminUserRecord, SensitiveUserFields>;

export type AdminUserListItem = SanitizedAdminUser & {
  fingerprintCount: number;
  latestFingerprint: { id: string; ts: number; ua?: string; ip?: string } | null;
  securitySummary: ReturnType<typeof buildAccountSecuritySummary>;
};

export function sanitizeInput(str: string) {
  return str.replace(/[<>]/g, "");
}

// 安全校验辅助：是否为合法的用户 ID 字符串（防 NoSQL/路径注入）
export function isValidUserId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 128;
}

// 合法 role 枚举
const VALID_ROLES = new Set<User["role"]>(["user", "admin", "trusted"]);
const VALID_ACCOUNT_STATUSES = new Set<NonNullable<User["accountStatus"]>>(["active", "suspended"]);

export function isUserRole(value: unknown): value is User["role"] {
  return typeof value === "string" && VALID_ROLES.has(value as User["role"]);
}

export function isAccountStatus(value: unknown): value is NonNullable<User["accountStatus"]> {
  return typeof value === "string" && VALID_ACCOUNT_STATUSES.has(value as NonNullable<User["accountStatus"]>);
}

// 合法 announcement format 枚举
export const VALID_ANNOUNCEMENT_FORMATS = new Set(["markdown", "html"]);

export function stripSensitiveUserFields(
  user: Partial<AdminUserRecord> | null | undefined,
): Partial<SanitizedAdminUser> {
  const {
    password,
    passwordHash,
    passwordCiphertext,
    passwordIv,
    passwordTag,
    passwordKeyVersion,
    passwordWrappedDek,
    passwordDekId,
    ...safeUser
  } = user || {};
  return safeUser as Partial<SanitizedAdminUser>;
}

export function getLatestFingerprintSummary(fingerprints: unknown): { id: string; ts: number; ua?: string; ip?: string } | null {
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) return null;
  const latest = fingerprints.reduce((currentLatest, item) => {
    const currentTs = Number(currentLatest?.ts || 0);
    const itemTs = Number(item?.ts || 0);
    return itemTs > currentTs ? item : currentLatest;
  }, fingerprints[0]);

  if (!latest?.id) return null;
  return {
    id: String(latest.id),
    ts: Number(latest.ts || 0),
    ua: typeof latest.ua === "string" ? latest.ua : undefined,
    ip: typeof latest.ip === "string" ? latest.ip : undefined,
  };
}

export function getAdminUserFingerprintCount(user: AdminUserRecord | null | undefined): number {
  if (typeof user?.fingerprintCount === "number") return user.fingerprintCount;
  return Array.isArray(user?.fingerprints) ? user.fingerprints.length : 0;
}

export function sanitizeAdminUserForList(user: AdminUserRecord, includeFingerprints: boolean) {
  const safeUser = stripSensitiveUserFields(user) as SanitizedAdminUser;
  const fingerprints = Array.isArray(safeUser.fingerprints) ? safeUser.fingerprints : [];
  const fingerprintSummary = {
    fingerprintCount: fingerprints.length > 0 ? fingerprints.length : getAdminUserFingerprintCount(user),
    latestFingerprint:
      getLatestFingerprintSummary(fingerprints) || getLatestFingerprintSummary([safeUser.latestFingerprint]) || null,
  };

  if (includeFingerprints) {
    const withSummary = { ...safeUser, ...fingerprintSummary };
    return {
      ...withSummary,
      securitySummary: buildAccountSecuritySummary(withSummary as User),
    } as AdminUserListItem;
  }

  const { fingerprints: _fingerprints, ...safeWithoutFingerprints } = safeUser;
  const withSummary = { ...safeWithoutFingerprints, ...fingerprintSummary };
  return {
    ...withSummary,
    securitySummary: buildAccountSecuritySummary(withSummary as User),
  } as AdminUserListItem;
}

type AdminUserListRoleFilter = "all" | "user" | "admin" | "trusted";
type AdminUserListAccountStatusFilter = "all" | "active" | "suspended";
type AdminUserListSecurityFilter = "all" | "totp" | "passkey" | "fingerprintRequired" | "noMfa";
type AdminUserListTicketFilter = "all" | "normal" | "violated" | "banned";
type AdminUserListTranslationFilter = "all" | "enabled" | "disabled" | "limited";
type AdminUserListSortOrder = "asc" | "desc";

interface AdminUserListQuery {
  keyword: string;
  role: AdminUserListRoleFilter;
  accountStatus: AdminUserListAccountStatusFilter;
  security: AdminUserListSecurityFilter;
  ticket: AdminUserListTicketFilter;
  translation: AdminUserListTranslationFilter;
  sortBy: string;
  sortOrder: AdminUserListSortOrder;
  page: number;
  pageSize: number;
  envelope: boolean;
}

const ADMIN_USER_LIST_SORT_FIELDS = new Set([
  "username",
  "email",
  "role",
  "accountStatus",
  "createdAt",
  "dailyUsage",
  "lastUsageDate",
  "lastLoginAt",
  "ticketViolationCount",
]);

export const ADMIN_USER_BULK_ACTIONS = new Set([
  "resetDailyUsage",
  "requireFingerprint",
  "clearFingerprintRequirement",
  "suspend",
  "activate",
  "enableTranslation",
  "disableTranslation",
  "clearTranslationRestrictions",
  "clearTicketRestrictions",
  "resetMfa",
]);

export function getFirstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return getFirstQueryValue(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

export function isTruthyQueryFlag(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(getFirstQueryValue(value).toLowerCase());
}

export function normalizeEnumQuery<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(getFirstQueryValue(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function parseAdminUserListQuery(query: Request["query"]): AdminUserListQuery {
  const sortBy = getFirstQueryValue(query.sortBy);
  return {
    keyword: getFirstQueryValue(query.keyword).slice(0, 100).toLowerCase(),
    role: normalizeEnumQuery(getFirstQueryValue(query.role), ["all", "user", "admin", "trusted"] as const, "all"),
    accountStatus: normalizeEnumQuery(
      getFirstQueryValue(query.accountStatus),
      ["all", "active", "suspended"] as const,
      "all",
    ),
    security: normalizeEnumQuery(
      getFirstQueryValue(query.security),
      ["all", "totp", "passkey", "fingerprintRequired", "noMfa"] as const,
      "all",
    ),
    ticket: normalizeEnumQuery(
      getFirstQueryValue(query.ticket),
      ["all", "normal", "violated", "banned"] as const,
      "all",
    ),
    translation: normalizeEnumQuery(
      getFirstQueryValue(query.translation),
      ["all", "enabled", "disabled", "limited"] as const,
      "all",
    ),
    sortBy: ADMIN_USER_LIST_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt",
    sortOrder: normalizeEnumQuery(getFirstQueryValue(query.sortOrder), ["asc", "desc"] as const, "desc"),
    page: parseBoundedInteger(query.page, 1, 1, 100_000),
    pageSize: parseBoundedInteger(query.pageSize, 20, 1, 100),
    envelope: isTruthyQueryFlag(query.envelope),
  };
}

export function isFutureDate(value: unknown, now = Date.now()): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts) && ts > now;
}

export function getNormalizedAccountStatus(user: AdminUserRecord | null | undefined): "active" | "suspended" {
  return user?.accountStatus === "suspended" ? "suspended" : "active";
}

export function getUserSearchText(user: AdminUserRecord | null | undefined): string {
  return [
    user?.id,
    user?.username,
    user?.email,
    user?.role,
    user?.authProvider,
    user?.linuxdoId,
    user?.linuxdoUsername,
    user?.lastLoginIp,
  ]
    .filter((item) => typeof item === "string" && item.trim())
    .join(" ")
    .toLowerCase();
}

export function matchesAdminUserListFilters(user: AdminUserRecord, filters: AdminUserListQuery): boolean {
  const now = Date.now();
  if (filters.keyword && !getUserSearchText(user).includes(filters.keyword)) {
    return false;
  }

  if (filters.role !== "all" && user?.role !== filters.role) {
    return false;
  }

  if (filters.accountStatus !== "all" && getNormalizedAccountStatus(user) !== filters.accountStatus) {
    return false;
  }

  if (filters.security === "totp" && !user?.totpEnabled) return false;
  if (filters.security === "passkey" && !user?.passkeyEnabled) return false;
  if (filters.security === "fingerprintRequired" && !user?.requireFingerprint) return false;
  if (filters.security === "noMfa" && (user?.totpEnabled || user?.passkeyEnabled)) return false;

  const ticketViolationCount = Number(user?.ticketViolationCount || 0);
  const ticketBanned = isFutureDate(user?.ticketBannedUntil, now);
  if (filters.ticket === "normal" && (ticketViolationCount > 0 || ticketBanned)) return false;
  if (filters.ticket === "violated" && ticketViolationCount <= 0) return false;
  if (filters.ticket === "banned" && !ticketBanned) return false;

  const translationLimited = isFutureDate(user?.translationAccessUntil, now);
  if (filters.translation === "enabled" && user?.isTranslationEnabled === false) return false;
  if (filters.translation === "disabled" && user?.isTranslationEnabled !== false) return false;
  if (filters.translation === "limited" && !translationLimited) return false;

  return true;
}

export function getAdminUserSortValue(user: AdminUserRecord, field: string): string | number {
  const record = user as AdminUserRecord & Record<string, unknown>;
  if (["createdAt", "lastUsageDate", "lastLoginAt"].includes(field)) {
    const ts = Date.parse(String(record[field] || ""));
    return Number.isFinite(ts) ? ts : 0;
  }

  if (["dailyUsage", "ticketViolationCount"].includes(field)) {
    const value = Number(record[field] || 0);
    return Number.isFinite(value) ? value : 0;
  }

  return String(record[field] ?? "").toLowerCase();
}

export function sortAdminUsers(users: AdminUserRecord[], filters: AdminUserListQuery): AdminUserRecord[] {
  const multiplier = filters.sortOrder === "asc" ? 1 : -1;
  return [...users].sort((a, b) => {
    const av = getAdminUserSortValue(a, filters.sortBy);
    const bv = getAdminUserSortValue(b, filters.sortBy);
    if (typeof av === "number" && typeof bv === "number") {
      return (av - bv) * multiplier;
    }
    return String(av).localeCompare(String(bv), "zh-CN") * multiplier;
  });
}

export function buildAdminUserListStats(users: AdminUserRecord[]) {
  const now = Date.now();
  return users.reduce(
    (acc, user) => {
      acc.total += 1;
      if (user?.role === "admin") acc.admins += 1;
      else if (user?.role === "trusted") acc.trusted += 1;
      else acc.users += 1;
      if (getNormalizedAccountStatus(user) === "suspended") acc.suspended += 1;
      else acc.active += 1;
      if (user?.totpEnabled) acc.totpEnabled += 1;
      if (user?.passkeyEnabled) acc.passkeyEnabled += 1;
      if (user?.requireFingerprint) acc.fingerprintRequired += 1;
      if (getAdminUserFingerprintCount(user) > 0) acc.withFingerprints += 1;
      if (Number(user?.ticketViolationCount || 0) > 0) acc.ticketViolated += 1;
      if (isFutureDate(user?.ticketBannedUntil, now)) acc.ticketBanned += 1;
      if (user?.isTranslationEnabled === false) acc.translationDisabled += 1;
      if (isFutureDate(user?.translationAccessUntil, now)) acc.translationLimited += 1;
      acc.totalDailyUsage += Number(user?.dailyUsage || 0);
      return acc;
    },
    {
      total: 0,
      users: 0,
      admins: 0,
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
    },
  );
}

export function buildAdminUserListEnvelope(users: AdminUserListItem[], filters: AdminUserListQuery) {
  const filteredUsers = users.filter((user) => matchesAdminUserListFilters(user, filters));
  const sortedUsers = sortAdminUsers(filteredUsers, filters);
  const total = sortedUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;

  return {
    users: sortedUsers.slice(start, start + filters.pageSize),
    pagination: {
      page,
      pageSize: filters.pageSize,
      total,
      totalPages,
    },
    filters: {
      keyword: filters.keyword,
      role: filters.role,
      accountStatus: filters.accountStatus,
      security: filters.security,
      ticket: filters.ticket,
      translation: filters.translation,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    },
    stats: buildAdminUserListStats(users),
    filteredStats: buildAdminUserListStats(filteredUsers),
  };
}

export function getAdminUserBulkActionUpdates(action: string, now: number): Partial<User> | null {
  switch (action) {
    case "resetDailyUsage":
      return { dailyUsage: 0, lastUsageDate: new Date(now).toISOString() };
    case "requireFingerprint":
      return { requireFingerprint: true, requireFingerprintAt: now };
    case "clearFingerprintRequirement":
      return { requireFingerprint: false, requireFingerprintAt: 0 };
    case "suspend":
      return { accountStatus: "suspended" };
    case "activate":
      return { accountStatus: "active" };
    case "enableTranslation":
      return { isTranslationEnabled: true };
    case "disableTranslation":
      return { isTranslationEnabled: false };
    case "clearTranslationRestrictions":
      return { isTranslationEnabled: true, translationAccessUntil: "", accountStatus: "active" };
    case "clearTicketRestrictions":
      return { ticketViolationCount: 0, ticketBannedUntil: "" };
    case "resetMfa":
      return {
        totpEnabled: false,
        totpSecret: "",
        backupCodes: [],
        passkeyEnabled: false,
        passkeyVerified: false,
        passkeyCredentials: [],
        pendingChallenge: "",
        currentChallenge: "",
      };
    default:
      return null;
  }
}

/**
 * 对 updateUser / createUser 中允许写入的各字段做严格类型与范围校验。
 * 返回净化后的 updates 对象，遇到非法值则抛出带描述的 Error。
 * token 字段故意不在白名单内（禁止通过此接口直接写 token）。
 */
export function validateAndSanitizeUserUpdates(body: Record<string, unknown>): Partial<User> {
  const out: Partial<User> = {};

  // username: 3-20 位字母数字下划线
  if (body.username !== undefined) {
    if (typeof body.username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(body.username.trim())) {
      throw new Error("用户名格式不合法（3-20位字母数字下划线）");
    }
    out.username = body.username.trim();
  }

  // email
  if (body.email !== undefined) {
    if (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())
    ) {
      throw new Error("邮箱格式不合法");
    }
    out.email = body.email.trim().toLowerCase();
  }

  // role: 枚举限制
  if (body.role !== undefined) {
    if (!isUserRole(body.role)) {
      throw new Error("role 值非法，只允许 user、admin 或 trusted");
    }
    out.role = body.role;
  }

  // dailyUsage: 非负整数
  if (body.dailyUsage !== undefined) {
    const v = Number(body.dailyUsage);
    if (!Number.isInteger(v) || v < 0 || v > 1_000_000) {
      throw new Error("dailyUsage 必须为 0-1000000 的整数");
    }
    out.dailyUsage = v;
  }

  // lastUsageDate: ISO 日期字符串或空串
  if (body.lastUsageDate !== undefined) {
    if (typeof body.lastUsageDate !== "string" || body.lastUsageDate.length > 64) {
      throw new Error("lastUsageDate 格式不合法");
    }
    out.lastUsageDate = body.lastUsageDate.trim();
  }

  // tokenExpiresAt: 允许管理员置 0 使 token 立即失效，但不允许超远未来
  if (body.tokenExpiresAt !== undefined) {
    const v = Number(body.tokenExpiresAt);
    if (!Number.isFinite(v) || v < 0) {
      throw new Error("tokenExpiresAt 必须为非负数");
    }
    const maxAllowed = Date.now() + 365 * 24 * 60 * 60 * 1000;
    if (v > maxAllowed) {
      throw new Error("tokenExpiresAt 不得超过当前时间 365 天");
    }
    out.tokenExpiresAt = v;
  }

  // totpEnabled: boolean
  if (body.totpEnabled !== undefined) {
    out.totpEnabled = Boolean(body.totpEnabled);
  }

  // totpSecret: 长度限制
  if (body.totpSecret !== undefined) {
    if (typeof body.totpSecret !== "string" || body.totpSecret.length > 256) {
      throw new Error("totpSecret 格式不合法");
    }
    out.totpSecret = body.totpSecret.trim();
  }

  // backupCodes: 字符串数组，最多 20 条，每条最长 128 字符
  if (body.backupCodes !== undefined) {
    if (!Array.isArray(body.backupCodes) || body.backupCodes.length > 20) {
      throw new Error("backupCodes 必须为不超过 20 个元素的数组");
    }
    for (const code of body.backupCodes) {
      if (typeof code !== "string" || code.length > 128) {
        throw new Error("backupCodes 中包含非法元素");
      }
    }
    out.backupCodes = (body.backupCodes as string[]).map((c) => c.trim()).filter(Boolean);
  }

  // passkeyEnabled / passkeyVerified: boolean
  if (body.passkeyEnabled !== undefined) out.passkeyEnabled = Boolean(body.passkeyEnabled);
  if (body.passkeyVerified !== undefined) out.passkeyVerified = Boolean(body.passkeyVerified);

  // pendingChallenge / currentChallenge: 字符串，长度限制
  for (const field of ["pendingChallenge", "currentChallenge"]) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string" || body[field].length > 512) {
        throw new Error(`${field} 格式不合法`);
      }
      if (field === "pendingChallenge") {
        out.pendingChallenge = body[field].trim();
      } else {
        out.currentChallenge = body[field].trim();
      }
    }
  }

  // avatarUrl: 只允许 http/https 或空串
  if (body.avatarUrl !== undefined) {
    if (typeof body.avatarUrl !== "string" || body.avatarUrl.length > 2048) {
      throw new Error("avatarUrl 格式不合法");
    }
    const trimmed = body.avatarUrl.trim();
    if (trimmed !== "" && !/^https?:\/\//i.test(trimmed)) {
      throw new Error("avatarUrl 只允许 http/https 协议");
    }
    out.avatarUrl = trimmed;
  }

  // requireFingerprint / fingerprintRequestDismissedOnce: boolean
  if (body.requireFingerprint !== undefined) out.requireFingerprint = Boolean(body.requireFingerprint);
  if (body.fingerprintRequestDismissedOnce !== undefined)
    out.fingerprintRequestDismissedOnce = Boolean(body.fingerprintRequestDismissedOnce);

  // requireFingerprintAt / fingerprintRequestDismissedAt: 非负整数时间戳
  for (const field of ["requireFingerprintAt", "fingerprintRequestDismissedAt"]) {
    if (body[field] !== undefined) {
      const v = Number(body[field]);
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(`${field} 必须为非负数`);
      }
      if (field === "requireFingerprintAt") {
        out.requireFingerprintAt = v;
      } else {
        out.fingerprintRequestDismissedAt = v;
      }
    }
  }

  // ticketViolationCount: 非负整数
  if (body.ticketViolationCount !== undefined) {
    const v = Number(body.ticketViolationCount);
    if (!Number.isInteger(v) || v < 0) {
      throw new Error("ticketViolationCount 必须为非负整数");
    }
    out.ticketViolationCount = v;
  }

  // ticketBannedUntil: ISO 日期字符串或空串
  if (body.ticketBannedUntil !== undefined) {
    if (typeof body.ticketBannedUntil !== "string") {
      throw new Error("ticketBannedUntil 必须为字符串");
    }
    out.ticketBannedUntil = body.ticketBannedUntil.trim();
  }

  if (body.isTranslationEnabled !== undefined || body.is_translation_enabled !== undefined) {
    out.isTranslationEnabled = Boolean(body.isTranslationEnabled ?? body.is_translation_enabled);
  }

  if (body.translationAccessUntil !== undefined || body.translation_access_until !== undefined) {
    const value = body.translationAccessUntil ?? body.translation_access_until;
    if (typeof value !== "string") {
      throw new Error("translationAccessUntil 必须为字符串");
    }
    out.translationAccessUntil = value.trim();
  }

  if (body.accountStatus !== undefined || body.account_status !== undefined) {
    const value = body.accountStatus ?? body.account_status;
    if (!isAccountStatus(value)) {
      throw new Error("accountStatus 值非法，只允许 active 或 suspended");
    }
    out.accountStatus = value;
  }

  return out;
}

