import { mongoUserStorageProvider } from "./providers/mongoUserStorageProvider";
import type { User } from "./userStorageTypes";

export type UserStorageMode = "mongo";

export interface UserStorageProvider {
  getAllUsers(): Promise<User[]>;
  getAdminUserList?(opts?: { includeFingerprints?: boolean }): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserByLinuxDoId(linuxdoId: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User | null>;
  deleteUser(userId: string): Promise<boolean>;
}

export const getCurrentUserStorageMode = (): UserStorageMode => "mongo";

export const getUserStorageProvider = (): UserStorageProvider => mongoUserStorageProvider;
