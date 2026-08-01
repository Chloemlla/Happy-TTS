/**
 * Auth domain — UserStorage provider adapter.
 *
 * Wraps the legacy UserStorage utility behind the UserProvider port so
 * the AuthService can look up users without depending on the storage
 * implementation directly.
 */

import { UserStorage } from "../../utils/userStorage";
import type { AuthUser, UserProvider } from "../auth.ports";

class UserStorageProvider implements UserProvider {
  async getUserById(userId: string): Promise<AuthUser | null> {
    const user = await UserStorage.getUserById(userId);
    if (!user) return null;

    return {
      ...user,
      accountStatus: (user as any).accountStatus,
      disabled: (user as any).disabled,
    } as unknown as AuthUser;
  }
}

/** Singleton provider instance. */
export const userStorageProvider: UserProvider = new UserStorageProvider();