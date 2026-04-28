import mongoose from "mongoose";
import { config } from "../config/config";
import logger from "./logger";
import { readUsersFromFile, USERS_FILE, writeUsersToFile } from "./providers/fileUserStorageProvider";
import { mongoUserStorageProvider } from "./providers/mongoUserStorageProvider";
import { ensureMysqlUsersTable, mysqlUserStorageProvider } from "./providers/mysqlUserStorageProvider";
import { getCurrentUserStorageMode } from "./userStorageProvider";
import type { User } from "./userStorageTypes";

const isValidUserList = (data: unknown): data is User[] =>
  Array.isArray(data) && data.every((user) => typeof user?.id === "string" && typeof user?.username === "string");

let autoSwitchEnabled = Boolean(config.userStorageAutoSwitch) && process.env.NODE_ENV !== "production";

const migrateFromFileToMongo = async (): Promise<void> => {
  const fileUsers = readUsersFromFile();
  if (fileUsers.length === 0) {
    logger.info("[UserStorage] 文件存储中没有用户数据，跳过迁移");
    return;
  }

  const mongoUsers = await mongoUserStorageProvider.getAllUsers();
  if (mongoUsers.length > 0) {
    logger.info("[UserStorage] MongoDB 已存在用户数据，跳过文件迁移");
    return;
  }

  for (const user of fileUsers) {
    const existingUser = await mongoUserStorageProvider.getUserByUsername(user.username);
    if (!existingUser) {
      await mongoUserStorageProvider.createUser(user);
    }
  }

  logger.info(`[UserStorage] 文件到 MongoDB 迁移完成，共处理 ${fileUsers.length} 个用户`);
};

export const userRepairService = {
  async isHealthy(): Promise<boolean> {
    const mode = getCurrentUserStorageMode();
    if (mode === "file") {
      try {
        return isValidUserList(readUsersFromFile());
      } catch {
        return false;
      }
    }

    if (mode === "mongo") {
      try {
        const users = await mongoUserStorageProvider.getAllUsers();
        return isValidUserList(users);
      } catch {
        return false;
      }
    }

    try {
      await ensureMysqlUsersTable();
      const users = await mysqlUserStorageProvider.getAllUsers();
      return Array.isArray(users);
    } catch {
      return false;
    }
  },

  async tryFix(): Promise<boolean> {
    const mode = getCurrentUserStorageMode();

    if (mode === "file") {
      try {
        const users = readUsersFromFile();
        if (!isValidUserList(users)) {
          return false;
        }
        writeUsersToFile(users);
        return true;
      } catch {
        return false;
      }
    }

    if (mode === "mysql") {
      try {
        await ensureMysqlUsersTable();
        return true;
      } catch {
        return false;
      }
    }

    return false;
  },

  async autoCheckAndFix(): Promise<{ healthy: boolean; fixed: boolean; mode: string; message: string }> {
    const mode = getCurrentUserStorageMode();
    const healthy = await userRepairService.isHealthy();

    if (healthy) {
      return { healthy: true, fixed: false, mode, message: `${mode} 用户存储健康` };
    }

    const fixed = await userRepairService.tryFix();
    const postFixHealthy = fixed ? await userRepairService.isHealthy() : false;

    if (postFixHealthy) {
      return { healthy: true, fixed: true, mode, message: `${mode} 用户存储已修复` };
    }

    return { healthy: false, fixed, mode, message: `${mode} 用户存储异常${fixed ? "，但修复后仍不健康" : "，且未能自动修复"}` };
  },

  initializeMongoListener(): void {
    if (!autoSwitchEnabled) {
      logger.info("[UserStorage] 自动存储切换已禁用");
      return;
    }

    mongoose.connection.on("connected", () => {
      logger.info("[UserStorage] MongoDB 连接成功，按显式配置切换到 mongo");
      process.env.USER_STORAGE_MODE = "mongo";
      void migrateFromFileToMongo().catch((error) => {
        logger.error("[UserStorage] MongoDB 连接后迁移文件用户失败", { error });
      });
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("[UserStorage] MongoDB 连接断开，按显式配置切换到 file");
      process.env.USER_STORAGE_MODE = "file";
    });

    mongoose.connection.on("error", (error: Error) => {
      logger.error("[UserStorage] MongoDB 连接错误", error);
      process.env.USER_STORAGE_MODE = "file";
    });
  },

  disableAutoSwitch(): void {
    autoSwitchEnabled = false;
    logger.info("[UserStorage] 自动存储切换已禁用");
  },

  enableAutoSwitch(): void {
    if (process.env.NODE_ENV === "production") {
      logger.warn("[UserStorage] 生产环境默认不启用自动存储切换");
      return;
    }
    autoSwitchEnabled = true;
    logger.info("[UserStorage] 自动存储切换已启用");
  },

  getUsersFilePath(): string {
    return USERS_FILE;
  },
};
