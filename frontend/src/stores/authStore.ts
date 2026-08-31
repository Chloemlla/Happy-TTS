import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../types/auth";
import { api } from "../api/api";

/**
 * Enriched error thrown by auth actions so UI can surface lockout / retry hints.
 */
export interface AuthRequestError extends Error {
  status?: number;
  code?: string;
  remainingAttempts?: number;
  attemptLimit?: number;
  lockedUntil?: number;
  retryAfterSeconds?: number;
}

interface LoginResponse {
  user: User;
  token: string;
  requires2FA?: boolean;
  twoFactorType?: string[];
}

export type LoginResult =
  | { requires2FA: true; user: User; token: string; twoFactorType: string[] }
  | { requires2FA: false; user: User; token: string };

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  /** true until the initial session check has settled. */
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string, cfToken?: string) => Promise<LoginResult>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setUser: (user: User | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const isAuthRejectionStatus = (status?: number): boolean => status === 401 || status === 403;

const buildAuthError = (error: any): AuthRequestError => {
  const errorData = error.response?.data || {};
  const msg = errorData.error || error.message || "登录失败，请检查网络或稍后重试";
  const authError = new Error(msg) as AuthRequestError;
  authError.status = error.response?.status;
  authError.code = errorData.code;
  authError.remainingAttempts = errorData.remainingAttempts;
  authError.attemptLimit = errorData.attemptLimit;
  authError.lockedUntil = errorData.lockedUntil;
  authError.retryAfterSeconds = errorData.retryAfterSeconds;
  return authError;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      login: async (username, password, cfToken) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.post<LoginResponse>("/api/auth/login", {
            identifier: username,
            password,
            ...(cfToken ? { cfToken } : {}),
          });
          const { user, requires2FA, twoFactorType } = response.data;
          // 2FA required: keep the session pending — do NOT mark authenticated yet.
          if (requires2FA && twoFactorType && twoFactorType.length > 0) {
            set({ isLoading: false });
            return { requires2FA: true, user, token: response.data.token, twoFactorType };
          }
          set({ user, isAuthenticated: true, isLoading: false, error: null });
          return { requires2FA: false, user, token: response.data.token };
        } catch (error: any) {
          const authError = buildAuthError(error);
          set({ isLoading: false, error: authError.message });
          throw authError;
        }
      },

      logout: () => {
        set({ user: null, isAuthenticated: false, error: null });
      },

      checkAuth: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.get<User>("/api/auth/me");
          const data = response.data;
          if (data) {
            set({ user: data, isAuthenticated: true, isLoading: false });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        } catch (error: any) {
          if (isAuthRejectionStatus(error.response?.status)) {
            set({ user: null, isAuthenticated: false, isLoading: false, error: "登录状态已失效，请重新登录" });
          } else {
            set({ isLoading: false });
          }
        }
      },

      setUser: (user) => {
        set({ user, isAuthenticated: user !== null });
      },

      setIsLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      reset: () => {
        set({ user: null, isAuthenticated: false, isLoading: false, error: null });
      },
    }),
    {
      name: "auth-storage",
      // G9-09：只持久化展示用身份元数据（id/username/email/role），不把完整 user
      // 写进 localStorage，避免客户端伪造 role 驱动权限 UI。认证态以 /auth/me 实时结果为准。
      partialize: (state) => ({
        user: state.user
          ? ({
              id: state.user.id,
              username: state.user.username,
              email: state.user.email,
              role: state.user.role,
              // 仅持久化上述非敏感展示字段；其余字段不写入 localStorage
            } as User)
          : null,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<{ user: Partial<User> | null }>;
        const persistedUser = p.user;
        const user =
          persistedUser && typeof persistedUser === "object" && persistedUser.id
            ? (persistedUser as User)
            : null;
        return {
          ...current,
          user,
          // 持久化数据不驱动认证：isAuthenticated 必须由 /auth/me 实时判定，
          // 持久化 user 仅用于加载期展示，避免手改 localStorage 伪造登录态。
          isAuthenticated: false,
        };
      },
    },
  ),
);
