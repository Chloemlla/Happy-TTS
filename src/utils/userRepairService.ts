import mongoose from "mongoose";
import logger from "./logger";
import { mongoUserStorageProvider } from "./providers/mongoUserStorageProvider";
import type { User } from "./userStorageTypes";

const isValidUserList = (data: unknown): data is User[] =>
  Array.isArray(data) && data.every((user) => typeof user?.id === "string" && typeof user?.username === "string");

export const userRepairService = {
  async isHealthy(): Promise<boolean> {
    try {
      const users = await mongoUserStorageProvider.getAllUsers();
      return isValidUserList(users);
    } catch {
      return false;
    }
  },

  async tryFix(): Promise<boolean> {
    return mongoose.connection.readyState === 1;
  },

  async autoCheckAndFix(): Promise<{ healthy: boolean; fixed: boolean; mode: string; message: string }> {
    const healthy = await userRepairService.isHealthy();

    if (healthy) {
      return { healthy: true, fixed: false, mode: "mongo", message: "mongo 用户存储健康" };
    }

    const fixed = await userRepairService.tryFix();
    const postFixHealthy = fixed ? await userRepairService.isHealthy() : false;

    if (postFixHealthy) {
      return { healthy: true, fixed: true, mode: "mongo", message: "mongo 用户存储已修复" };
    }

    return {
      healthy: false,
      fixed,
      mode: "mongo",
      message: `mongo 用户存储异常${fixed ? "，但修复后仍不健康" : "，且未能自动修复"}`,
    };
  },

  initializeMongoListener(): void {
    logger.info("[UserStorage] Mongo-only 模式下不再自动切换存储");
  },

  disableAutoSwitch(): void {
    logger.info("[UserStorage] Mongo-only 模式下自动切换不可用");
  },

  enableAutoSwitch(): void {
    logger.info("[UserStorage] Mongo-only 模式下自动切换不可用");
  },
};
