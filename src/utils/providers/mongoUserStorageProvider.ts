import * as userService from "../../services/userService";
import logger from "../logger";
import type { User } from "../userStorageTypes";
import type { UserStorageProvider } from "../userStorageProvider";
import { removeAvatarBase64 } from "./fileUserStorageProvider";

export const mongoUserStorageProvider: UserStorageProvider = {
  async getAllUsers() {
    return (await userService.getAllUsers()).map((user) => removeAvatarBase64(user));
  },

  async getUserById(id: string) {
    return removeAvatarBase64(await userService.getUserById(id));
  },

  async getUserByEmail(email: string) {
    return removeAvatarBase64(await userService.getUserByEmail(email));
  },

  async getUserByUsername(username: string) {
    return removeAvatarBase64(await userService.getUserByUsername(username));
  },

  async getUserByLinuxDoId(linuxdoId: string) {
    return removeAvatarBase64(await userService.getUserByLinuxDoId(linuxdoId));
  },

  async createUser(user: User) {
    return removeAvatarBase64(await userService.createUser(user));
  },

  async updateUser(userId: string, updates: Partial<User>) {
    return removeAvatarBase64(await userService.updateUser(userId, updates));
  },

  async deleteUser(userId: string) {
    try {
      await userService.deleteUser(userId);
      return true;
    } catch (error) {
      logger.error("[UserStorage] MongoDB deleteUser 失败", { error, userId });
      return false;
    }
  },
};

