import logger from "./logger";
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
  if (!user.email || user.role === "admin") {
    return;
  }

  const usagePercent = (dailyUsage / DAILY_LIMIT) * 100;
  if (usagePercent !== 80 && usagePercent !== 100) {
    return;
  }

  try {
    const { sendEmail } = await import("../services/emailSender");
    const { generateUsageAlertEmailHtml } = await import("../templates/emailTemplates");
    const time = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const emailHtml = generateUsageAlertEmailHtml(user.username, `${usagePercent}%`, dailyUsage, DAILY_LIMIT, time);
    sendEmail({
      to: user.email,
      subject: `Synapse 每日用量警报 (${usagePercent}%)`,
      html: emailHtml,
      logTag: "用量警报通知",
      checkQuota: false,
    }).catch((error) => logger.warn(`[用量警报通知] 邮件发送失败: ${user.email}`, error));
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

  async createUser(username: string, email: string, password: string): Promise<User | null> {
    const existUserByName = await getUserByUsername(username);
    const existUserByEmail = await getUserByEmail(email);
    if (existUserByName || existUserByEmail) {
      return null;
    }
    return getUserStorageProvider().createUser(buildNewUser(username, email, password));
  },

  async authenticateUser(identifier: string, password: string): Promise<User | null> {
    const sanitizedIdentifier = userValidationService.sanitizeInput(identifier);
    const provider = getUserStorageProvider();
    const user =
      (await provider.getUserByUsername(sanitizedIdentifier)) || (await provider.getUserByEmail(sanitizedIdentifier));

    if (!user || user.password !== password) {
      return null;
    }

    return user;
  },

  async getUserById(id: string): Promise<User | null> {
    return getUserById(id);
  },

  async getUserByEmail(email: string): Promise<User | null> {
    return getUserByEmail(email);
  },

  async getUserByUsername(username: string): Promise<User | null> {
    return getUserByUsername(username);
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
    if (user.role === "admin") return Infinity;

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
    if (user.role === "admin") return true;
    const { incrementUserDailyUsageAtomic } = await import("../services/userService");
    const result = await incrementUserDailyUsageAtomic(userId, DAILY_LIMIT);
    if (!result.success || !result.user) {
      return false;
    }
    await maybeSendUsageAlert(result.user, result.user.dailyUsage);
    return true;
  },
};
