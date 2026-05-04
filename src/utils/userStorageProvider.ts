import { mongoUserStorageProvider } from "./providers/mongoUserStorageProvider";

export type UserStorageMode = "mongo";

export interface UserStorageProvider {
  getAllUsers(): Promise<any[]>;
  getUserById(id: string): Promise<any | null>;
  getUserByEmail(email: string): Promise<any | null>;
  getUserByUsername(username: string): Promise<any | null>;
  getUserByLinuxDoId(linuxdoId: string): Promise<any | null>;
  createUser(user: any): Promise<any>;
  updateUser(userId: string, updates: any): Promise<any | null>;
  deleteUser(userId: string): Promise<boolean>;
}

export const getCurrentUserStorageMode = (): UserStorageMode => "mongo";

export const getUserStorageProvider = (): UserStorageProvider => mongoUserStorageProvider;
