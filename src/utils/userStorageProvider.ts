import mysql from "mysql2/promise";
import { config } from "../config/config";
import type { User } from "./userStorageTypes";

export type UserStorageMode = "file" | "mongo" | "mysql";

export interface UserStorageProvider {
  getAllUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserByLinuxDoId(linuxdoId: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User | null>;
  deleteUser(userId: string): Promise<boolean>;
}

export const getCurrentUserStorageMode = (): UserStorageMode => {
  const mode = process.env.USER_STORAGE_MODE || config.userStorageMode || "file";
  if (mode === "mongo" || mode === "mysql") {
    return mode;
  }
  return "file";
};

export async function getMysqlConnection() {
  const { host, port, user, password, database } = config.mysql;
  return mysql.createConnection({ host, port: Number(port), user, password, database });
}

