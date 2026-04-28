import logger from "./logger";
import { userBootstrapService } from "./userBootstrapService";
import { userRepairService } from "./userRepairService";
import { userRepository } from "./userRepository";
import type { User, ValidationError } from "./userStorageTypes";
import { InputValidationError, userValidationService } from "./userValidationService";

export type { User, ValidationError } from "./userStorageTypes";
export { InputValidationError } from "./userValidationService";

export class UserStorage {
  public static sanitizeInput(input: string | undefined): string {
    return userValidationService.sanitizeInput(input);
  }

  public static validateUserInput(
    username: string,
    password: string,
    email?: string,
    isRegistration: boolean = false,
  ): ValidationError[] {
    return userValidationService.validateUserInput(username, password, email, isRegistration);
  }

  public static checkPassword(user: User, password: string): boolean {
    return userValidationService.checkPassword(user, password);
  }

  public static async isHealthy(): Promise<boolean> {
    return userRepairService.isHealthy();
  }

  public static async tryFix(): Promise<boolean> {
    return userRepairService.tryFix();
  }

  public static async getAllUsers(): Promise<User[]> {
    return userRepository.getAllUsers();
  }

  public static async createUser(username: string, email: string, password: string): Promise<User | null> {
    const errors = this.validateUserInput(username, password, email, true);
    if (errors.length > 0) {
      logger.error("[UserStorage] 创建用户失败: 输入验证失败", { username, email, errors });
      throw new InputValidationError(errors);
    }

    const user = await userRepository.createUser(username, email, password);
    if (!user) {
      throw new InputValidationError([{ field: "username", message: "用户名或邮箱已存在" }]);
    }
    return user;
  }

  public static async authenticateUser(identifier: string, password: string): Promise<User | null> {
    const errors = this.validateUserInput(identifier, password, undefined, false);
    if (errors.length > 0) {
      logger.error("[UserStorage] authenticateUser 输入验证失败", { identifier, errors });
      throw new InputValidationError(errors);
    }
    return userRepository.authenticateUser(identifier, password);
  }

  public static async getUserById(id: string): Promise<User | null> {
    return userRepository.getUserById(id);
  }

  public static async getUserByEmail(email: string): Promise<User | null> {
    return userRepository.getUserByEmail(email);
  }

  public static async getUserByUsername(username: string): Promise<User | null> {
    return userRepository.getUserByUsername(username);
  }

  public static async getUserByLinuxDoId(linuxdoId: string): Promise<User | null> {
    return userRepository.getUserByLinuxDoId(linuxdoId);
  }

  public static async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    return userRepository.updateUser(userId, updates);
  }

  public static async deleteUser(userId: string): Promise<boolean> {
    return userRepository.deleteUser(userId);
  }

  public static async getRemainingUsage(userId: string): Promise<number> {
    return userRepository.getRemainingUsage(userId);
  }

  public static getDailyLimit(): number {
    return userRepository.getDailyLimit();
  }

  public static async incrementUsage(userId: string): Promise<boolean> {
    return userRepository.incrementUsage(userId);
  }

  public static initializeMongoListener(): void {
    userRepairService.initializeMongoListener();
  }

  public static disableAutoSwitch(): void {
    userRepairService.disableAutoSwitch();
  }

  public static enableAutoSwitch(): void {
    userRepairService.enableAutoSwitch();
  }

  public static async autoCheckAndFix(): Promise<{ healthy: boolean; fixed: boolean; mode: string; message: string }> {
    return userRepairService.autoCheckAndFix();
  }

  public static async initializeDatabase(): Promise<{ initialized: boolean; message: string }> {
    return userBootstrapService.initializeDatabase();
  }
}
