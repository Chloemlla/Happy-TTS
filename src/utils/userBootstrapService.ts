import { connectMongo } from "../services/mongoService";
import { config } from "../config/config";
import logger from "./logger";
import { mongoUserStorageProvider } from "./providers/mongoUserStorageProvider";
import type { User } from "./userStorageTypes";

const buildDefaultAdmin = (): User => {
  const adminUsername = config.adminUsername;
  return {
    id: Date.now().toString(),
    username: adminUsername,
    email: `${adminUsername}@example.com`,
    password: config.adminPassword,
    role: "admin",
    dailyUsage: 0,
    lastUsageDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    isTranslationEnabled: true,
    translationAccessUntil: "",
    accountStatus: "active",
  };
};

const printAdminCreated = (admin: User): void => {
  // Never log the plaintext password; operators already provide ADMIN_PASSWORD via env.
  logger.info("[Bootstrap] Default admin account ensured", {
    username: admin.username,
    email: admin.email,
    hasCredential: Boolean(admin.password),
  });
};

const reconcileAdmin = async (
  users: User[],
  update: (userId: string, updates: Partial<User>) => Promise<User | null>,
  remove: (userId: string) => Promise<boolean>,
): Promise<number> => {
  const adminUsername = config.adminUsername;
  const adminEmail = `${adminUsername}@example.com`;
  const existingAdmin = users.find((user) => user.role === "admin" || user.username === adminUsername);

  if (!existingAdmin) {
    return -1;
  }

  if (existingAdmin.username === adminUsername && existingAdmin.role !== "admin") {
    await update(existingAdmin.id, { role: "admin", email: adminEmail });
  }

  const conflicts = users.filter(
    (user) => user.id !== existingAdmin.id && user.role !== "admin" && user.username === adminUsername,
  );
  for (const conflict of conflicts) {
    await remove(conflict.id);
  }
  return conflicts.length;
};

export const userBootstrapService = {
  async initializeDatabase(): Promise<{ initialized: boolean; message: string }> {
    logger.info("[UserStorage] 开始初始化 MongoDB 用户存储");

    try {
      await connectMongo();
      const users = await mongoUserStorageProvider.getAllUsers();
      const conflictCount = await reconcileAdmin(
        users,
        async (userId, updates) => mongoUserStorageProvider.updateUser(userId, updates),
        async (userId) => mongoUserStorageProvider.deleteUser(userId),
      );

      if (conflictCount >= 0) {
        return {
          initialized: true,
          message: `MongoDB 初始化完成，已存在管理员账户，清理了 ${conflictCount} 个冲突用户`,
        };
      }

      const admin = buildDefaultAdmin();
      await mongoUserStorageProvider.createUser(admin);
      printAdminCreated(admin);
      return {
        initialized: true,
        message: `MongoDB 初始化完成，已创建默认管理员账户: ${admin.username}`,
      };
    } catch (error) {
      logger.error("[UserStorage] 数据库初始化失败", { error, mode: "mongo" });
      return {
        initialized: false,
        message: `数据库初始化失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
