import fs from "node:fs";
import path from "node:path";
import logger from "../logger";
import type { User } from "../userStorageTypes";
import type { UserStorageProvider } from "../userStorageProvider";

export const USERS_FILE = path.join(process.cwd(), "data", "users.json");

const withRetry = <T>(fn: () => T, maxRetry = 2, label = ""): T => {
  let lastErr: unknown;
  for (let i = 0; i <= maxRetry; i++) {
    try {
      return fn();
    } catch (error) {
      lastErr = error;
      if (i < maxRetry) {
        logger.warn(`[UserStorage] ${label} 第${i + 1}次失败，自动重试...`, error);
      }
    }
  }
  logger.error(`[UserStorage] ${label} 连续${maxRetry + 1}次失败，放弃重试`, lastErr);
  throw lastErr;
};

export const removeAvatarBase64 = <T>(value: T): T => {
  if (value && typeof value === "object" && "avatarBase64" in (value as Record<string, unknown>)) {
    delete (value as Record<string, unknown>).avatarBase64;
  }
  return value;
};

export const ensureUsersDirectory = (): void => {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export const readUsersFromFile = (): User[] =>
  withRetry(() => {
    if (!fs.existsSync(USERS_FILE)) {
      throw new Error(`用户数据文件不存在: ${USERS_FILE}`);
    }
    const data = fs.readFileSync(USERS_FILE, "utf-8");
    if (!data.trim()) {
      throw new Error(`用户数据文件为空: ${USERS_FILE}`);
    }
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      throw new Error(`用户数据文件格式错误: ${USERS_FILE}`);
    }
    return parsed as User[];
  }, 2, "readUsersFromFile");

export const writeUsersToFile = (users: User[]): void =>
  withRetry(() => {
    ensureUsersDirectory();
    const tempFile = `${USERS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
    fs.renameSync(tempFile, USERS_FILE);
  }, 2, "writeUsersToFile");

export const fileUserStorageProvider: UserStorageProvider = {
  async getAllUsers() {
    return readUsersFromFile().map((user) => removeAvatarBase64(user));
  },

  async getUserById(id: string) {
    return removeAvatarBase64(readUsersFromFile().find((user) => user.id === id) || null);
  },

  async getUserByEmail(email: string) {
    return removeAvatarBase64(readUsersFromFile().find((user) => user.email === email) || null);
  },

  async getUserByUsername(username: string) {
    return removeAvatarBase64(readUsersFromFile().find((user) => user.username === username) || null);
  },

  async getUserByLinuxDoId(linuxdoId: string) {
    return removeAvatarBase64(readUsersFromFile().find((user) => user.linuxdoId === linuxdoId) || null);
  },

  async createUser(user: User) {
    const users = readUsersFromFile();
    users.push(user);
    writeUsersToFile(users);
    return removeAvatarBase64(user);
  },

  async updateUser(userId: string, updates: Partial<User>) {
    const users = readUsersFromFile();
    const index = users.findIndex((user) => user.id === userId);
    if (index === -1) {
      return null;
    }
    users[index] = removeAvatarBase64({ ...users[index], ...updates });
    writeUsersToFile(users);
    return users[index];
  },

  async deleteUser(userId: string) {
    const users = readUsersFromFile();
    const nextUsers = users.filter((user) => user.id !== userId);
    if (nextUsers.length === users.length) {
      return false;
    }
    writeUsersToFile(nextUsers);
    return true;
  },
};

