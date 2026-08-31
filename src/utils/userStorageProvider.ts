import { mongoUserStorageProvider } from "./providers/mongoUserStorageProvider";
import type { User } from "./userStorageTypes";

export type UserStorageMode = "mongo";

export interface UserStorageProvider {
  getAllUsers(): Promise<User[]>;
  getAdminUserList?(opts?: { includeFingerprints?: boolean }): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserSecretsById?(id: string): Promise<User | null>;
  consumeTotpCounter?(id: string, counter: number): Promise<boolean>;
  consumePendingChallenge?(id: string, expectedChallenge: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByEmailCaseInsensitive(email: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserByToken(token: string): Promise<User | null>;
  getUserByLinuxDoId(linuxdoId: string): Promise<User | null>;
  getUsersByIds?(ids: string[]): Promise<User[]>;
  createUser(user: User): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User | null>;
  bulkUpdateUsers?(ops: Array<{ updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> } }>): Promise<void>;
  deleteUser(userId: string): Promise<boolean>;
}

export const getCurrentUserStorageMode = (): UserStorageMode => "mongo";

export const getUserStorageProvider = (): UserStorageProvider => mongoUserStorageProvider;
