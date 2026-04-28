import logger from "../logger";
import { getMysqlConnection } from "../userStorageProvider";
import type { User } from "../userStorageTypes";
import type { UserStorageProvider } from "../userStorageProvider";
import { removeAvatarBase64 } from "./fileUserStorageProvider";

const deserializeUser = (user: User | null): User | null => {
  if (!user) {
    return null;
  }

  const parsedUser = { ...user } as User & Record<string, unknown>;
  for (const key of ["backupCodes", "passkeyCredentials", "fingerprints"]) {
    const value = parsedUser[key];
    if (typeof value === "string" && value.trim()) {
      try {
        parsedUser[key] = JSON.parse(value);
      } catch {
        logger.warn(`[UserStorage] MySQL 字段 ${key} JSON 反序列化失败`, { userId: user.id });
      }
    }
  }

  return parsedUser as User;
};

export const MYSQL_USERS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    email VARCHAR(128) NOT NULL,
    password VARCHAR(128) NOT NULL,
    role VARCHAR(16) NOT NULL,
    dailyUsage INT DEFAULT 0,
    lastUsageDate VARCHAR(32),
    createdAt VARCHAR(32),
    token VARCHAR(255),
    tokenExpiresAt BIGINT,
    totpSecret VARCHAR(255),
    totpEnabled BOOLEAN DEFAULT FALSE,
    backupCodes JSON,
    passkeyEnabled BOOLEAN DEFAULT FALSE,
    passkeyCredentials JSON,
    pendingChallenge VARCHAR(255),
    currentChallenge VARCHAR(255),
    passkeyVerified BOOLEAN DEFAULT FALSE,
    avatarUrl VARCHAR(255),
    authProvider VARCHAR(32),
    linuxdoId VARCHAR(255),
    linuxdoUsername VARCHAR(255),
    linuxdoAvatarUrl VARCHAR(255),
    requireFingerprint BOOLEAN DEFAULT FALSE,
    requireFingerprintAt BIGINT,
    fingerprints JSON,
    lastLoginIp VARCHAR(255),
    lastLoginAt VARCHAR(64),
    ticketViolationCount INT DEFAULT 0,
    ticketBannedUntil VARCHAR(64),
    isTranslationEnabled BOOLEAN DEFAULT TRUE,
    translationAccessUntil VARCHAR(64),
    accountStatus VARCHAR(32) DEFAULT 'active'
  )
`;

export const ensureMysqlUsersTable = async (): Promise<void> => {
  const conn = await getMysqlConnection();
  try {
    await conn.execute(MYSQL_USERS_TABLE_SQL);
  } finally {
    await conn.end();
  }
};

export const mysqlUserStorageProvider: UserStorageProvider = {
  async getAllUsers() {
    const conn = await getMysqlConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM users");
      return (rows as User[]).map((user) => removeAvatarBase64(deserializeUser(user)!));
    } finally {
      await conn.end();
    }
  },

  async getUserById(id: string) {
    const conn = await getMysqlConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM users WHERE id = ?", [id]);
      return removeAvatarBase64(deserializeUser((rows as User[])[0] || null));
    } finally {
      await conn.end();
    }
  },

  async getUserByEmail(email: string) {
    const conn = await getMysqlConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM users WHERE email = ?", [email]);
      return removeAvatarBase64(deserializeUser((rows as User[])[0] || null));
    } finally {
      await conn.end();
    }
  },

  async getUserByUsername(username: string) {
    const conn = await getMysqlConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM users WHERE username = ?", [username]);
      return removeAvatarBase64(deserializeUser((rows as User[])[0] || null));
    } finally {
      await conn.end();
    }
  },

  async getUserByLinuxDoId(linuxdoId: string) {
    const conn = await getMysqlConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM users WHERE linuxdoId = ?", [linuxdoId]);
      return removeAvatarBase64(deserializeUser((rows as User[])[0] || null));
    } finally {
      await conn.end();
    }
  },

  async createUser(user: User) {
    const conn = await getMysqlConnection();
    try {
      await conn.execute(
        `INSERT INTO users (
          id, username, email, password, role, dailyUsage, lastUsageDate, createdAt,
          token, tokenExpiresAt, totpSecret, totpEnabled, backupCodes, passkeyEnabled,
          passkeyCredentials, pendingChallenge, currentChallenge, passkeyVerified, avatarUrl,
          authProvider, linuxdoId, linuxdoUsername, linuxdoAvatarUrl, requireFingerprint,
          requireFingerprintAt, fingerprints, lastLoginIp, lastLoginAt, ticketViolationCount,
          ticketBannedUntil, isTranslationEnabled, translationAccessUntil, accountStatus
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.username,
          user.email,
          user.password,
          user.role,
          user.dailyUsage,
          user.lastUsageDate,
          user.createdAt,
          user.token || null,
          user.tokenExpiresAt || null,
          user.totpSecret || null,
          user.totpEnabled ?? false,
          user.backupCodes ? JSON.stringify(user.backupCodes) : null,
          user.passkeyEnabled ?? false,
          user.passkeyCredentials ? JSON.stringify(user.passkeyCredentials) : null,
          user.pendingChallenge || null,
          user.currentChallenge || null,
          user.passkeyVerified ?? false,
          user.avatarUrl || null,
          user.authProvider || "local",
          user.linuxdoId || null,
          user.linuxdoUsername || null,
          user.linuxdoAvatarUrl || null,
          user.requireFingerprint ?? false,
          user.requireFingerprintAt || null,
          user.fingerprints ? JSON.stringify(user.fingerprints) : null,
          user.lastLoginIp || null,
          user.lastLoginAt || null,
          user.ticketViolationCount ?? 0,
          user.ticketBannedUntil || null,
          user.isTranslationEnabled ?? true,
          user.translationAccessUntil || null,
          user.accountStatus || "active",
        ],
      );
      return user;
    } finally {
      await conn.end();
    }
  },

  async updateUser(userId: string, updates: Partial<User>) {
    const conn = await getMysqlConnection();
    try {
      const fields = Object.keys(updates).filter((key) => key !== "id");
      if (fields.length === 0) {
        return null;
      }

      const values = fields.map((field) => {
        const value = (updates as Record<string, unknown>)[field];
        if (["backupCodes", "passkeyCredentials", "fingerprints"].includes(field) && value !== undefined) {
          return JSON.stringify(value);
        }
        return value;
      });

      await conn.execute(`UPDATE users SET ${fields.map((field) => `${field} = ?`).join(", ")} WHERE id = ?`, [
        ...values,
        userId,
      ]);

      const [rows] = await conn.execute("SELECT * FROM users WHERE id = ?", [userId]);
      return removeAvatarBase64(deserializeUser((rows as User[])[0] || null));
    } catch (error) {
      logger.error("[UserStorage] MySQL updateUser 失败", { error, userId });
      throw error;
    } finally {
      await conn.end();
    }
  },

  async deleteUser(userId: string) {
    const conn = await getMysqlConnection();
    try {
      await conn.execute("DELETE FROM users WHERE id = ?", [userId]);
      return true;
    } finally {
      await conn.end();
    }
  },
};
