import logger from "./logger";
import {
  getPrimaryAdminAuthUser,
  getUserAuthByEmail,
  getUserAuthByUsername,
  incrementUserDailyUsageAtomic,
  verifyAndMigrateUserPassword,
  type AdminUserListPageResult,
  type AdminUserListQueryParams,
  type AdminUserListStats,
} from "../services/userService";
import { sendEmail } from "../services/emailSender";
import { generateUsageAlertEmailHtml } from "../templates/emailTemplates";
import { getUserStorageProvider } from "./userStorageProvider";
import type { User } from "./userStorageTypes";
import { userValidationService } from "./userValidationService";

const DAILY_LIMIT = 5;

const buildNewUser = (username: string, email: string, password: string): User => ({
  id: Date.now().toString(),
  username,
  email,
  password,
  role: "user",
  dailyUsage: 0,
  lastUsageDate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  isTranslationEnabled: true,
  translationAccessUntil: "",
  accountStatus: "active",
});

const getUserById = async (userId: string): Promise<User | null> => getUserStorageProvider().getUserById(userId);
const getUserByEmail = async (email: string): Promise<User | null> => getUserStorageProvider().getUserByEmail(email);
const getUserByUsername = async (username: string): Promise<User | null> =>
  getUserStorageProvider().getUserByUsername(username);
const updateUser = async (userId: string, updates: Partial<User>): Promise<User | null> =>
  getUserStorageProvider().updateUser(userId, updates);

const maybeSendUsageAlert = async (user: User, dailyUsage: number): Promise<void> => {
  if (!user.email || user.role === "admin" || user.role === "superadmin") {
    return;
  }

  const usagePercent = (dailyUsage / DAILY_LIMIT) * 100;
  if (usagePercent !== 80 && usagePercent !== 100) {
    return;
  }

  try {
    const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const emailHtml = generateUsageAlertEmailHtml(user.username, `${usagePercent}%`, dailyUsage, DAILY_LIMIT, time);
    sendEmail({
      to: user.email,
      subject: `Synapse 每日用量警报 (${usagePercent}%)`,
      html: emailHtml,
      logTag: "用量警报通知",
      checkQuota: true,
    })
      .then((result) => {
        if (result.success) {
          logger.info(`[用量警报通知] 成功发送到 ${user.email}`);
        } else {
          logger.warn(`[用量警报通知] 发送失败: ${user.email} - ${result.error}`);
        }
      })
      .catch((error: unknown) => {
        logger.warn(`[用量警报通知] 发送异常: ${user.email}`, error);
      });
  } catch (error) {
    logger.warn("[用量警报通知] 发送通知邮件失败:", error);
  }
};

export const userRepository = {
  getDailyLimit(): number {
    return DAILY_LIMIT;
  },

  async getAllUsers(): Promise<User[]> {
    return getUserStorageProvider().getAllUsers();
  },

  async getAdminUserList(opts: { includeFingerprints?: boolean } = {}): Promise<User[]> {
    const provider = getUserStorageProvider();
    if (typeof provider.getAdminUserList === "function") {
      return provider.getAdminUserList(opts);
    }
    return provider.getAllUsers();
  },

  async getAdminUserListPage(
    query: AdminUserListQueryParams,
    includeFingerprints: boolean,
  ): Promise<AdminUserListPageResult> {
    const provider = getUserStorageProvider();
    if (typeof provider.getAdminUserListPage === "function") {
      return provider.getAdminUserListPage(query, includeFingerprints);
    }
    // 兜底：provider 不支持分页时退化为全量读取 + 内存分页（stats 为空，不影响主链路）
    const all =
      typeof provider.getAdminUserList === "function"
        ? await provider.getAdminUserList({ includeFingerprints })
        : [];
    const total = all.length;
    const start = (query.page - 1) * query.pageSize;
    const users = all.slice(start, start + query.pageSize);
    const emptyStats: AdminUserListStats = {
      total: 0, users: 0, admins: 0, superadmins: 0, trusted: 0, active: 0, suspended: 0,
      totpEnabled: 0, passkeyEnabled: 0, fingerprintRequired: 0, withFingerprints: 0,
      ticketViolated: 0, ticketBanned: 0, translationDisabled: 0, translationLimited: 0, totalDailyUsage: 0,
    };
    return { users, total, stats: emptyStats, filteredStats: emptyStats };
  },

  async getPrimaryAdminAuthUser() {
    return getPrimaryAdminAuthUser();
  },

  async createUser(username: string, email: string, password: string): Promise<User | null> {
    const existUserByName = await getUserByUsername(username);
    const existUserByEmail = await getUserByEmail(email);
    if (existUserByName || existUserByEmail) {
      return null;
    }
    try {
      return await getUserStorageProvider().createUser(buildNewUser(username, email, password));
    } catch (error) {
      // Two concurrent registrations can both pass the check above and race on the
      // DB unique index; surface the same "already exists" semantics instead of a raw E11000.
      if (error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000) {
        return null;
      }
      throw error;
    }
  },

  async authenticateUser(identifier: string, password: string): Promise<User | null> {
    const sanitizedIdentifier = userValidationService.sanitizeInput(identifier);
    const user =
      (await getUserAuthByUsername(sanitizedIdentifier)) || (await getUserAuthByEmail(sanitizedIdentifier));

    if (!user) {
      return null;
    }

    const result = await verifyAndMigrateUserPassword(user, password);
    return result.valid ? result.user : null;
  },

  async getUserById(id: string): Promise<User | null> {
    return getUserById(id);
  },

  async getUserSecretsById(id: string): Promise<User | null> {
    const provider = getUserStorageProvider();
    if (typeof provider.getUserSecretsById === "function") {
      return provider.getUserSecretsById(id);
    }
    return provider.getUserById(id);
  },

  async consumeTotpCounter(id: string, counter: number): Promise<boolean> {
    const provider = getUserStorageProvider();
    if (typeof provider.consumeTotpCounter === "function") {
      return provider.consumeTotpCounter(id, counter);
    }
    return true;
  },

  async consumePendingChallenge(id: string, expectedChallenge: string): Promise<User | null> {
    const provider = getUserStorageProvider();
    if (typeof provider.consumePendingChallenge === "function") {
      return provider.consumePendingChallenge(id, expectedChallenge);
    }
    return provider.getUserById(id);
  },

  async getUserByEmail(email: string): Promise<User | null> {
    return getUserByEmail(email);
  },

  async getUserByEmailCaseInsensitive(email: string): Promise<User | null> {
    if (!email || typeof email !== "string") {
      return null;
    }
    const provider = getUserStorageProvider();
    if (typeof provider.getUserByEmailCaseInsensitive === "function") {
      return provider.getUserByEmailCaseInsensitive(email);
    }
    return null;
  },

  async getUserByUsername(username: string): Promise<User | null> {
    return getUserByUsername(username);
  },

  async getUserByToken(token: string): Promise<User | null> {
    if (!token || typeof token !== "string") {
      return null;
    }
    const provider = getUserStorageProvider();
    if (typeof provider.getUserByToken === "function") {
      return provider.getUserByToken(token);
    }
    return null;
  },

  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (!ids || ids.length === 0) return [];
    const provider = getUserStorageProvider();
    if (typeof provider.getUsersByIds === "function") {
      return provider.getUsersByIds(ids);
    }
    return provider.getAllUsers().then((users) => users.filter((u) => ids.includes(u.id)));
  },

  async bulkUpdateUsers(ops: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }>): Promise<void> {
    if (!ops || ops.length === 0) return;
    const provider = getUserStorageProvider();
    if (typeof provider.bulkUpdateUsers === "function") {
      await provider.bulkUpdateUsers(ops);
    } else {
      // Fallback: sequential updates
      for (const op of ops) {
        const id = op.updateOne.filter.id as string;
        const updates = op.updateOne.update.$set as Partial<User>;
        if (id && updates) {
          await provider.updateUser(id, updates);
        }
      }
    }
  },

  async getUserByLinuxDoId(linuxdoId: string): Promise<User | null> {
    if (!linuxdoId || typeof linuxdoId !== "string") {
      return null;
    }
    return getUserStorageProvider().getUserByLinuxDoId(linuxdoId);
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    return getUserStorageProvider().updateUser(userId, updates);
  },

  async deleteUser(userId: string): Promise<boolean> {
    return getUserStorageProvider().deleteUser(userId);
  },

  async getRemainingUsage(userId: string): Promise<number> {
    const user = await getUserById(userId);
    if (!user) return 0;
    if (user.role === "admin" || user.role === "superadmin") return Infinity;

    const today = new Date().toISOString().split("T")[0];
    let lastUsageDate = "";
    try {
      lastUsageDate = new Date(user.lastUsageDate).toISOString().split("T")[0];
    } catch {
      return DAILY_LIMIT;
    }

    if (!user.lastUsageDate || lastUsageDate === "Invalid Date") return DAILY_LIMIT;
    if (today !== lastUsageDate) return DAILY_LIMIT;
    return DAILY_LIMIT - user.dailyUsage;
  },

  async incrementUsage(userId: string): Promise<boolean> {
    const user = await getUserById(userId);
    if (!user) return false;
    if (user.role === "admin" || user.role === "superadmin") return true;
    const result = await incrementUserDailyUsageAtomic(userId, DAILY_LIMIT);
    if (!result.success || !result.user) {
      return false;
    }
    await maybeSendUsageAlert(result.user, result.user.dailyUsage);
    return true;
  },
};
